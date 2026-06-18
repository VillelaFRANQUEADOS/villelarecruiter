import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { google } from "@ai-sdk/google";
import { uploadPdfToDrive } from "@/lib/curriculos.functions";
import { generateObject } from "ai";
import { z } from "zod";
import { extractCandidateIdentity } from "@/lib/candidate-parser";

// ─── Schema ───────────────────────────────────────────────────────────────────

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
] as const;

type UfCode = typeof UFS[number];

const ExtractedSchema = z.object({
  nome: z.string(),
  telefone: z.string(),
  email: z.string(),
  cidade: z.string(),
  estado: z.string(),
});

type Extracted = z.infer<typeof ExtractedSchema>;

// ─── Utilitários ─────────────────────────────────────────────────────────────

function extractEmailFromText(text: string): string {
  if (!text) return "";
  const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0].toLowerCase() : "";
}

function normalizePhone(value: string, fallbackText: string): string {
  let p = (value || "").replace(/\D/g, "");
  if (p.startsWith("55") && p.length > 11) p = p.slice(2);
  if (p.length === 10 || p.length === 11) return p;
  const re = /(?:\+?55[\s.\-]?)?\(?(\d{2})\)?[\s.\-]?(9?\d{4})[\s.\-]?(\d{4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fallbackText)) !== null) {
    const digits = (m[1] + m[2] + m[3]).replace(/\D/g, "");
    if (digits.length === 10 || digits.length === 11) return digits;
  }
  return "";
}

function normalizeEmail(value: string, fallbackText: string): string {
  const v = (value || "").trim().toLowerCase();
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(v)) return v;
  return extractEmailFromText(fallbackText);
}

function normalizeUf(value: string): string {
  if (!value) return "";
  const v = value.trim().toUpperCase();
  if (UFS.includes(v as UfCode)) return v;
  return "";
}

// ─── Prompt IA (fallback para PDFs ilegíveis / imagens puras) ────────────────

const STRICT_PROMPT =
  "Você extrai DADOS LITERAIS de currículos brasileiros. Leia TODO o documento (todas as páginas e imagens). Regras OBRIGATÓRIAS:\n" +
  "1. Extraia EXCLUSIVAMENTE: nome, telefone, email, cidade, estado.\n" +
  "2. NUNCA invente nem deduza. Se um campo NÃO estiver explícito, retorne string vazia \"\".\n" +
  "3. nome: nome completo da PESSOA candidata. Geralmente no topo ou ao lado da foto.\n" +
  "4. telefone: APENAS DÍGITOS, com DDD (10 ou 11 dígitos). Remova (), -, ., espaços e DDI 55.\n" +
  "5. email: minúsculas, como aparece. Prefira pessoal (gmail/hotmail/outlook/yahoo/icloud).\n" +
  "6. cidade: nome da cidade onde o candidato RESIDE.\n" +
  "7. estado: sigla UF de 2 letras. Converta nomes por extenso para sigla.\n" +
  "8. Para imagens/PDF escaneado faça OCR cuidadoso e siga as MESMAS regras.\n" +
  "9. Retorne EXATAMENTE JSON com essas 5 chaves, sem texto extra.";

// ─── parseAndCreateCandidato ──────────────────────────────────────────────────

export const parseAndCreateCandidato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    fileName: string;
    fileBase64: string;
    mimeType: string;
    cvText: string;
    images?: string[];
  }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY ausente");

    const cvText = (data.cvText || "").slice(0, 24000);
    const images = (data.images || []).slice(0, 8);

    let extracted: Extracted = { nome: "", telefone: "", email: "", cidade: "", estado: "" };
    let aiFailed = false;
    let aiErrorMsg: string | null = null;

    const hasText = cvText.replace(/\s/g, "").length >= 80;
    const hasImages = images.length > 0;

    // ── 1. Parser determinístico (sempre executa quando há texto) ─────────────
    if (hasText) {
      const identity = extractCandidateIdentity(cvText);
      const emailRegex = extractEmailFromText(cvText);

      extracted = {
        nome: identity.nome,
        telefone: identity.telefone,
        email: emailRegex,
        cidade: identity.cidade,
        estado: identity.estado,
      };

      // ── 2. Fallback IA: só quando confidence insuficiente ──────────────────
      if (identity.confidence < 50) {
        try {
          const model = google("gemini-2.5-flash");
          const userContent: Array<
            | { type: "text"; text: string }
            | { type: "image"; image: string }
          > = [{ type: "text", text: STRICT_PROMPT }];

          userContent.push({ type: "text", text: `CURRÍCULO (texto extraído):\n${cvText}` });
          for (const img of images) {
            userContent.push({ type: "image", image: img });
          }

          const { object } = await generateObject({
            model,
            schema: ExtractedSchema,
            messages: [{ role: "user", content: userContent }],
          });

          // Merge não-destrutivo: determinístico tem prioridade
          extracted = {
            nome: extracted.nome || object.nome,
            telefone: extracted.telefone || object.telefone,
            email: extracted.email || object.email.toLowerCase(),
            cidade: extracted.cidade || object.cidade,
            estado: extracted.estado || object.estado,
          };
        } catch (e) {
          aiFailed = true;
          aiErrorMsg = e instanceof Error ? e.message : "Erro IA";
        }
      }
    } else if (hasImages) {
      // Documento sem texto (imagem pura / PDF escaneado total) → IA direto
      try {
        const model = google("gemini-2.5-flash");
        const userContent: Array<
          | { type: "text"; text: string }
          | { type: "image"; image: string }
        > = [{ type: "text", text: STRICT_PROMPT }];
        for (const img of images) {
          userContent.push({ type: "image", image: img });
        }
        const { object } = await generateObject({
          model,
          schema: ExtractedSchema,
          messages: [{ role: "user", content: userContent }],
        });
        extracted = object;
      } catch (e) {
        aiFailed = true;
        aiErrorMsg = e instanceof Error ? e.message : "Erro IA";
      }
    } else {
      aiFailed = true;
      aiErrorMsg = "Documento sem conteúdo legível";
    }

    // ── 3. Normalização final ─────────────────────────────────────────────────
    const telefoneFinal = normalizePhone(extracted.telefone, cvText);
    const emailFinal = normalizeEmail(extracted.email, cvText) || null;
    const cidadeFinal = (extracted.cidade || "").trim();
    const estadoFinal = normalizeUf(extracted.estado) || null;
    // Nunca usa nome do arquivo como fallback — retorna vazio se não encontrado
    const nomeFinal = (extracted.nome || "").trim();

    const observacoes = aiFailed
      ? `Extração automática falhou (${aiErrorMsg}). Edite manualmente.`
      : null;

    // ── 4. Anti-duplicata ─────────────────────────────────────────────────────
    if (telefoneFinal || emailFinal) {
      const orParts: string[] = [];
      if (telefoneFinal) orParts.push(`telefone.eq.${telefoneFinal}`);
      if (emailFinal) orParts.push(`email.eq.${emailFinal}`);
      const { data: existing } = await supabase
        .from("candidatos")
        .select("id,nome,telefone,email,created_at,recrutador_id")
        .or(orParts.join(","))
        .limit(1)
        .maybeSingle();
      if (existing) {
        return { candidato: null, aiFailed, duplicate: true, existing };
      }
    }

    // ── 5. Upload Drive ───────────────────────────────────────────────────────
    const safeName = data.fileName.replace(/[^\w.\-]/g, "_");
    const driveName = `${Date.now()}-${safeName}`;
    let driveFileId: string;
    try {
      const up = await uploadPdfToDrive({
        filename: driveName,
        pdfBase64: data.fileBase64,
        mimeType: data.mimeType || "application/octet-stream",
      });
      driveFileId = up.fileId;
    } catch (e) {
      throw new Error(`Upload Drive falhou: ${e instanceof Error ? e.message : String(e)}`);
    }

    // ── 6. Inserção no banco ──────────────────────────────────────────────────
    const { data: inserted, error } = await supabase
      .from("candidatos")
      .insert({
        nome: nomeFinal,
        telefone: telefoneFinal,
        email: emailFinal,
        cidade: cidadeFinal,
        estado: estadoFinal,
        observacoes,
        curriculo_url: `drive:${driveFileId}`,
        recrutador_id: userId,
        status: "aguardando_contato",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    return { candidato: inserted, aiFailed, duplicate: false };
  });

// ─── reprocessCandidato ───────────────────────────────────────────────────────

const GATEWAY_DRIVE = "https://connector-gateway.lovable.dev/google_drive";

async function downloadFromDrive(
  fileId: string
): Promise<{ base64: string; mimeType: string }> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");
  if (!GOOGLE_DRIVE_API_KEY)
    throw new Error("GOOGLE_DRIVE_API_KEY ausente (conecte o Google Drive)");

  const res = await fetch(
    `${GATEWAY_DRIVE}/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
      },
    }
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Falha ao baixar do Drive [${res.status}]: ${t.slice(0, 200)}`);
  }
  const mimeType =
    res.headers.get("content-type")?.split(";")[0] || "application/pdf";
  const arr = await res.arrayBuffer();
  const base64 = Buffer.from(arr).toString("base64");
  return { base64, mimeType };
}

const DEEP_PROMPT =
  STRICT_PROMPT +
  "\n\nIMPORTANTE: Este é um reprocessamento profundo. O arquivo COMPLETO está anexado. " +
  "Leia TODAS as páginas e imagens com atenção máxima. Faça OCR rigoroso se necessário. " +
  "Procure os 5 campos em qualquer parte do documento (cabeçalho, rodapé, sidebar, dados pessoais, contato).";

export const reprocessCandidato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { candidatoId: string }) =>
    z.object({ candidatoId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow)
      throw new Error("Acesso negado: apenas administradores podem reprocessar currículos.");

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY ausente");

    const { data: cand, error: fetchErr } = await supabase
      .from("candidatos")
      .select("id,nome,telefone,email,cidade,estado,curriculo_url")
      .eq("id", data.candidatoId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!cand) throw new Error("Candidato não encontrado");
    if (!cand.curriculo_url || !cand.curriculo_url.startsWith("drive:")) {
      throw new Error(
        "Currículo indisponível para reprocessamento (sem arquivo no Drive)."
      );
    }

    const fileId = cand.curriculo_url.slice(6);
    const { base64, mimeType } = await downloadFromDrive(fileId);

    let extracted: Extracted = { nome: "", telefone: "", email: "", cidade: "", estado: "" };
    let aiErrorMsg: string | null = null;

    try {
      const model = google("gemini-2.5-flash");

      type Part =
        | { type: "text"; text: string }
        | { type: "file"; data: string; mediaType: string }
        | { type: "image"; image: string };

      const parts: Part[] = [{ type: "text", text: DEEP_PROMPT }];
      if (mimeType.startsWith("image/")) {
        parts.push({ type: "image", image: `data:${mimeType};base64,${base64}` });
      } else {
        parts.push({ type: "file", data: base64, mediaType: mimeType });
      }

      const { object } = await generateObject({
        model,
        schema: ExtractedSchema,
        messages: [{ role: "user", content: parts as unknown as never }],
      });
      extracted = object;
    } catch (e) {
      aiErrorMsg = e instanceof Error ? e.message : "Erro IA";
      throw new Error(`Falha no reprocessamento: ${aiErrorMsg}`);
    }

    const telefoneNew = normalizePhone(extracted.telefone, "");
    const emailNew = normalizeEmail(extracted.email, "") || "";
    const cidadeNew = (extracted.cidade || "").trim();
    const estadoNew = normalizeUf(extracted.estado) || "";
    const nomeNew = (extracted.nome || "").trim();

    const isEmpty = (v: string | null | undefined) =>
      !v || !String(v).trim();

    const patch: Record<string, string | null> = {};
    const updatedFields: string[] = [];

    if (isEmpty(cand.nome) && nomeNew) {
      patch.nome = nomeNew;
      updatedFields.push("nome");
    }
    if (isEmpty(cand.telefone) && telefoneNew) {
      patch.telefone = telefoneNew;
      updatedFields.push("telefone");
    }
    if (isEmpty(cand.email) && emailNew) {
      patch.email = emailNew;
      updatedFields.push("email");
    }
    if (isEmpty(cand.cidade) && cidadeNew) {
      patch.cidade = cidadeNew;
      updatedFields.push("cidade");
    }
    if (isEmpty(cand.estado) && estadoNew) {
      patch.estado = estadoNew;
      updatedFields.push("estado");
    }

    const nowIso = new Date().toISOString();
    patch.ultimo_reprocessamento_at = nowIso;

    const { error: updErr } = await supabase
      .from("candidatos")
      .update(patch as never)
      .eq("id", data.candidatoId);
    if (updErr) throw new Error(updErr.message);

    return {
      updatedFields,
      ultimo_reprocessamento_at: nowIso,
      extracted: {
        nome: nomeNew,
        telefone: telefoneNew,
        email: emailNew,
        cidade: cidadeNew,
        estado: estadoNew,
      },
    };
  });
