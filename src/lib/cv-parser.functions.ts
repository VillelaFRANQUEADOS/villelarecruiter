import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { uploadPdfToDrive } from "@/lib/curriculos.functions";
import { generateObject } from "ai";
import { z } from "zod";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"] as const;

const ExtractedSchema = z.object({
  nome: z.string().nullable().optional(),
  telefone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  cidade: z.string().nullable().optional(),
  estado: z.string().nullable().optional(),
});

type Extracted = z.infer<typeof ExtractedSchema>;

function cleanFileName(name: string) {
  return name.replace(/\.(pdf|docx?|txt|png|jpe?g|webp|bmp|tiff?)$/i, "").replace(/[_\-]+/g, " ").trim() || "Candidato";
}

function hasEnoughText(text: string) {
  const letters = (text.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
  return letters >= 40;
}

function extractPhoneFromText(text: string): string | null {
  if (!text) return null;
  const re = /(?:\+?55[\s.\-]?)?\(?(\d{2})\)?[\s.\-]?(9?\d{4})[\s.\-]?(\d{4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const digits = (m[1] + m[2] + m[3]).replace(/\D/g, "");
    if (digits.length === 10 || digits.length === 11) return digits;
  }
  return null;
}

function extractEmailFromText(text: string): string | null {
  if (!text) return null;
  const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0] : null;
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

function extractUfFromText(text: string): string | null {
  if (!text) return null;
  const m = text.match(/[\/\-,\s]\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)(?:[\s,.\)\/\-]|$)/);
  if (m) return m[1];
  const lower = text.toLowerCase();
  for (const [name, uf] of Object.entries(UF_NAMES)) {
    if (lower.includes(name)) return uf;
  }
  return null;
}

function normalizeUf(value: string | null | undefined, cvText: string): string | null {
  if (value) {
    const v = value.trim().toUpperCase();
    if (UFS.includes(v as typeof UFS[number])) return v;
    const named = UF_NAMES[value.trim().toLowerCase()];
    if (named) return named;
  }
  return extractUfFromText(cvText);
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(s: string): Set<string> {
  return new Set(normalizeName(s).split(" ").filter((t) => t.length >= 3));
}

function nameSimilarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

export const parseAndCreateCandidato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileName: string; pdfBase64: string; cvText: string; mimeType?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

    const cvText = (data.cvText || "").slice(0, 12000);
    let extracted: Extracted = {};
    let aiFailed = false;
    let aiErrorMsg: string | null = null;

    if (hasEnoughText(cvText)) {
      try {
        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway("google/gemini-3-flash-preview");
        const { object } = await generateObject({
          model,
          schema: ExtractedSchema,
          prompt:
            "Extraia APENAS estes campos de um currículo brasileiro. Não invente dados — se não encontrar, retorne null:\n" +
            "- nome: nome completo\n" +
            "- telefone: APENAS DÍGITOS com DDD (10 ou 11 dígitos). Remova +55, parênteses, traços, espaços.\n" +
            "- email\n" +
            "- cidade: apenas o nome da cidade\n" +
            "- estado: sigla UF de 2 letras (SP, RJ, MG, RS, SC, PR, BA, PE, CE, GO etc.)\n\n" +
            "CURRÍCULO:\n" + cvText,
        });
        extracted = object;
      } catch (e) {
        aiFailed = true;
        aiErrorMsg = e instanceof Error ? e.message : "Erro IA";
      }
    } else {
      aiFailed = true;
      aiErrorMsg = "Arquivo sem texto legível";
    }

    const nomeFinal = (extracted.nome && extracted.nome.trim()) || cleanFileName(data.fileName);

    let telefoneFinal = (extracted.telefone || "").replace(/\D/g, "");
    if (telefoneFinal.startsWith("55") && telefoneFinal.length > 11) telefoneFinal = telefoneFinal.slice(2);
    if (telefoneFinal.length < 10 || telefoneFinal.length > 11) telefoneFinal = "";
    if (!telefoneFinal) telefoneFinal = extractPhoneFromText(cvText) || "";

    const emailFinal = (extracted.email && extracted.email.trim().toLowerCase()) || extractEmailFromText(cvText)?.toLowerCase() || null;
    const cidadeFinal = (extracted.cidade && extracted.cidade.trim()) || "";
    const estadoFinal = normalizeUf(extracted.estado, cvText);

    // Buscar duplicata: telefone, email ou nome similar
    let existing: { id: string; nome: string; telefone: string | null; email: string | null; cidade: string | null; estado: string | null; observacoes: string | null; curriculo_url: string | null } | null = null;

    if (telefoneFinal || emailFinal) {
      const orParts: string[] = [];
      if (telefoneFinal) orParts.push(`telefone.eq.${telefoneFinal}`);
      if (emailFinal) orParts.push(`email.eq.${emailFinal}`);
      const { data: byContact } = await supabase
        .from("candidatos")
        .select("id,nome,telefone,email,cidade,estado,observacoes,curriculo_url")
        .or(orParts.join(","))
        .limit(1)
        .maybeSingle();
      if (byContact) existing = byContact;
    }

    if (!existing) {
      // Busca por nome similar (mesmas iniciais para reduzir varredura)
      const firstToken = normalizeName(nomeFinal).split(" ")[0] ?? "";
      if (firstToken.length >= 3) {
        const { data: byName } = await supabase
          .from("candidatos")
          .select("id,nome,telefone,email,cidade,estado,observacoes,curriculo_url")
          .ilike("nome", `%${firstToken}%`)
          .limit(20);
        if (byName && byName.length > 0) {
          for (const c of byName) {
            if (nameSimilarity(c.nome, nomeFinal) >= 0.8) {
              existing = c;
              break;
            }
          }
        }
      }
    }

    // Quem está importando
    const { data: profile } = await supabase.from("profiles").select("nome").eq("id", userId).maybeSingle();
    const importerName = profile?.nome || "usuário";
    const now = new Date().toLocaleString("pt-BR");

    // Upload do arquivo para o Drive (sempre que tiver conteúdo novo)
    const safeName = data.fileName.replace(/[^\w.\-]/g, "_");
    const driveName = `${Date.now()}-${safeName}`;
    let driveFileId: string | null = null;
    try {
      const up = await uploadPdfToDrive({ filename: driveName, pdfBase64: data.pdfBase64 });
      driveFileId = up.fileId;
    } catch (e) {
      // Não bloqueia: segue sem currículo se Drive falhar
      console.error("Drive upload falhou:", e);
    }

    if (existing) {
      // Atualiza apenas campos vazios + currículo + observação de importação
      const updates: Record<string, unknown> = {};
      if (!existing.telefone && telefoneFinal) updates.telefone = telefoneFinal;
      if (!existing.email && emailFinal) updates.email = emailFinal;
      if (!existing.cidade && cidadeFinal) updates.cidade = cidadeFinal;
      if (!existing.estado && estadoFinal) updates.estado = estadoFinal;
      if (driveFileId) updates.curriculo_url = `drive:${driveFileId}`;
      const note = `[${now}] Reimportado por ${importerName}`;
      updates.observacoes = existing.observacoes ? `${existing.observacoes}\n${note}` : note;

      const { data: updated, error } = await supabase
        .from("candidatos")
        .update(updates)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { candidato: updated, aiFailed, duplicate: true, updated: true, existing };
    }

    if (!driveFileId) throw new Error("Upload do currículo falhou");

    const observacoes = aiFailed
      ? `Extração automática falhou (${aiErrorMsg}). Edite manualmente.\n[${now}] Importado por ${importerName}`
      : `[${now}] Importado por ${importerName}`;

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

    return { candidato: inserted, aiFailed, duplicate: false, updated: false };
  });
