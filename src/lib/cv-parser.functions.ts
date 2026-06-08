import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { uploadPdfToDrive } from "@/lib/curriculos.functions";
import { generateObject } from "ai";
import { z } from "zod";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"] as const;

// Schema rígido: somente os 5 campos. Sempre string ("" se ausente).
const ExtractedSchema = z.object({
  nome: z.string(),
  telefone: z.string(),
  email: z.string(),
  cidade: z.string(),
  estado: z.string(),
});

type Extracted = z.infer<typeof ExtractedSchema>;

function cleanFileName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[_\-]+/g, " ").trim() || "Candidato";
}

function extractPhoneFromText(text: string): string {
  if (!text) return "";
  const re = /(?:\+?55[\s.\-]?)?\(?(\d{2})\)?[\s.\-]?(9?\d{4})[\s.\-]?(\d{4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const digits = (m[1] + m[2] + m[3]).replace(/\D/g, "");
    if (digits.length === 10 || digits.length === 11) return digits;
  }
  return "";
}

function extractEmailFromText(text: string): string {
  if (!text) return "";
  const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0] : "";
}

const UF_NAMES: Record<string, string> = {
  "acre":"AC","alagoas":"AL","amapa":"AP","amapá":"AP","amazonas":"AM","bahia":"BA",
  "ceara":"CE","ceará":"CE","distrito federal":"DF","espirito santo":"ES","espírito santo":"ES",
  "goias":"GO","goiás":"GO","maranhao":"MA","maranhão":"MA","mato grosso":"MT","mato grosso do sul":"MS",
  "minas gerais":"MG","para":"PA","pará":"PA","paraiba":"PB","paraíba":"PB","parana":"PR","paraná":"PR",
  "pernambuco":"PE","piaui":"PI","piauí":"PI","rio de janeiro":"RJ","rio grande do norte":"RN",
  "rio grande do sul":"RS","rondonia":"RO","rondônia":"RO","roraima":"RR","santa catarina":"SC",
  "sao paulo":"SP","são paulo":"SP","sergipe":"SE","tocantins":"TO",
};

function extractUfFromText(text: string): string {
  if (!text) return "";
  const m = text.match(/[\/\-,\s]\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)(?:[\s,.\)\/\-]|$)/);
  if (m) return m[1];
  const lower = text.toLowerCase();
  for (const [name, uf] of Object.entries(UF_NAMES)) {
    if (lower.includes(name)) return uf;
  }
  return "";
}

function normalizeUf(value: string, fallbackText: string): string {
  if (value) {
    const v = value.trim().toUpperCase();
    if (UFS.includes(v as typeof UFS[number])) return v;
    const named = UF_NAMES[value.trim().toLowerCase()];
    if (named) return named;
  }
  return extractUfFromText(fallbackText);
}

function normalizePhone(value: string, fallbackText: string): string {
  let p = (value || "").replace(/\D/g, "");
  if (p.startsWith("55") && p.length > 11) p = p.slice(2);
  if (p.length === 10 || p.length === 11) return p;
  return extractPhoneFromText(fallbackText);
}

function normalizeEmail(value: string, fallbackText: string): string {
  const v = (value || "").trim().toLowerCase();
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(v)) return v;
  return extractEmailFromText(fallbackText).toLowerCase();
}

const STRICT_PROMPT =
  "Você extrai DADOS LITERAIS de currículos brasileiros. Leia TODO o documento (todas as páginas e imagens). Regras OBRIGATÓRIAS:\n" +
  "1. Extraia EXCLUSIVAMENTE: nome, telefone, email, cidade, estado.\n" +
  "2. NUNCA invente nem deduza. Se um campo NÃO estiver explícito, retorne string vazia \"\".\n" +
  "3. nome: nome completo da PESSOA candidata. NÃO confunda com nome de empresa, escola, curso, cargo ou referência. Geralmente aparece no topo, em destaque, ou ao lado da foto.\n" +
  "4. telefone: APENAS DÍGITOS, com DDD (10 ou 11 dígitos). Remova (), -, ., espaços e o DDI 55. Ex.: '(35) 99117-1223' -> '35991171223'. Se houver vários números, prefira celular (11 dígitos começando com 9 no terceiro dígito).\n" +
  "5. email: minúsculas, como aparece. Se houver vários, prefira o pessoal (gmail, hotmail, outlook, yahoo, icloud) sobre o corporativo.\n" +
  "6. cidade: apenas o nome da cidade onde o candidato RESIDE (bloco contato/endereço/dados pessoais). NÃO use cidade de emprego/faculdade.\n" +
  "7. estado: sigla UF de 2 letras (SP, RJ, MG, RS, SC, PR, BA, PE, CE, GO, DF, ES, MT, MS, PA, MA, PB, RN, AL, SE, PI, TO, RO, AC, AM, AP, RR). Converta nomes por extenso. Se ausente, \"\".\n" +
  "8. Para imagens / PDF escaneado faça OCR cuidadoso e siga as MESMAS regras.\n" +
  "9. Retorne EXATAMENTE JSON com essas 5 chaves, sem texto extra.";


export const parseAndCreateCandidato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    fileName: string;
    fileBase64: string;
    mimeType: string;
    cvText: string;
    images?: string[]; // data URIs for vision OCR
  }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

    const cvText = (data.cvText || "").slice(0, 24000);
    const images = (data.images || []).slice(0, 8);
    let extracted: Extracted = { nome: "", telefone: "", email: "", cidade: "", estado: "" };
    let aiFailed = false;
    let aiErrorMsg: string | null = null;

    const hasText = cvText.replace(/\s/g, "").length >= 80;
    const hasImages = images.length > 0;

    if (hasText || hasImages) {
      try {
        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway("google/gemini-3-flash-preview");

        const userContent: Array<
          | { type: "text"; text: string }
          | { type: "image"; image: string }
        > = [{ type: "text", text: STRICT_PROMPT }];

        if (hasText) {
          userContent.push({ type: "text", text: `CURRÍCULO (texto extraído):\n${cvText}` });
        }
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

    // Normalização sem inventar: cai para regex sobre o texto bruto se a IA falhou.
    const telefoneFinal = normalizePhone(extracted.telefone, cvText);
    const emailFinal = normalizeEmail(extracted.email, cvText) || null;
    const cidadeFinal = (extracted.cidade || "").trim();
    const estadoFinal = normalizeUf(extracted.estado, cvText) || null;
    const nomeFinal = (extracted.nome || "").trim() || cleanFileName(data.fileName);

    const observacoes = aiFailed
      ? `Extração automática falhou (${aiErrorMsg}). Edite manualmente.`
      : null;

    // Anti-duplicata por telefone ou email
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

    // Upload do arquivo original para o Drive (qualquer mime suportado)
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

// ===================== REPROCESSAMENTO (modo profundo) =====================

const GATEWAY_DRIVE = "https://connector-gateway.lovable.dev/google_drive";

async function downloadFromDrive(fileId: string): Promise<{ base64: string; mimeType: string }> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");
  if (!GOOGLE_DRIVE_API_KEY) throw new Error("GOOGLE_DRIVE_API_KEY ausente (conecte o Google Drive)");
  const res = await fetch(`${GATEWAY_DRIVE}/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
    },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Falha ao baixar do Drive [${res.status}]: ${t.slice(0, 200)}`);
  }
  const mimeType = res.headers.get("content-type")?.split(";")[0] || "application/pdf";
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
    z.object({ candidatoId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

    // 1. Buscar candidato (RLS aplica)
    const { data: cand, error: fetchErr } = await supabase
      .from("candidatos")
      .select("id,nome,telefone,email,cidade,estado,curriculo_url")
      .eq("id", data.candidatoId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!cand) throw new Error("Candidato não encontrado");
    if (!cand.curriculo_url || !cand.curriculo_url.startsWith("drive:")) {
      throw new Error("Currículo indisponível para reprocessamento (sem arquivo no Drive).");
    }

    // 2. Baixar do Drive
    const fileId = cand.curriculo_url.slice(6);
    const { base64, mimeType } = await downloadFromDrive(fileId);

    // 3. Extração deep com o arquivo completo como anexo multimodal
    let extracted: Extracted = { nome: "", telefone: "", email: "", cidade: "", estado: "" };
    let aiErrorMsg: string | null = null;
    try {
      const gateway = createLovableAiGatewayProvider(apiKey);
      const model = gateway("google/gemini-2.5-pro");

      // AI SDK aceita parts type:"file" com base64 + mediaType (imagens e PDF).
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

    // 4. Normalização
    const telefoneNew = normalizePhone(extracted.telefone, "");
    const emailNew = normalizeEmail(extracted.email, "") || "";
    const cidadeNew = (extracted.cidade || "").trim();
    const estadoNew = normalizeUf(extracted.estado, "") || "";
    const nomeNew = (extracted.nome || "").trim();

    // 5. Merge NÃO-destrutivo: só preenche campos vazios/null
    const isEmpty = (v: string | null | undefined) => !v || !String(v).trim();
    const patch: Record<string, string | null> = {};
    const updatedFields: string[] = [];
    if (isEmpty(cand.nome) && nomeNew) { patch.nome = nomeNew; updatedFields.push("nome"); }
    if (isEmpty(cand.telefone) && telefoneNew) { patch.telefone = telefoneNew; updatedFields.push("telefone"); }
    if (isEmpty(cand.email) && emailNew) { patch.email = emailNew; updatedFields.push("email"); }
    if (isEmpty(cand.cidade) && cidadeNew) { patch.cidade = cidadeNew; updatedFields.push("cidade"); }
    if (isEmpty(cand.estado) && estadoNew) { patch.estado = estadoNew; updatedFields.push("estado"); }

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
      extracted: { nome: nomeNew, telefone: telefoneNew, email: emailNew, cidade: cidadeNew, estado: estadoNew },
    };
  });

