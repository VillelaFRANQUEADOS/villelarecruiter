import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { google } from "@ai-sdk/google";
import { uploadPdfToDrive } from "@/lib/curriculos.functions";
import { generateObject } from "ai";
import { z } from "zod";
import { extractCandidateIdentity, extractCity, extractUf, extractPhone, extractEmail, extractName } from "@/lib/candidate-parser";
import { validateCity, normalizeOrigem, type OrigemCurriculo } from "@/lib/city-validation";

const ExtractedSchema = z.object({ nome: z.string(), telefone: z.string(), email: z.string(), cidade: z.string(), estado: z.string() });
type Extracted = z.infer<typeof ExtractedSchema>;

function cleanFileName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[_\-]+/g, " ").trim() || "Candidato";
}

function normalizePhone(value: string, fallbackText = ""): string {
  let p = (value || "").replace(/\D/g, "");
  if (p.startsWith("55") && p.length > 11) p = p.slice(2);
  if (p.length === 10 || p.length === 11) return p;
  return extractPhone(fallbackText);
}

function normalizeEmail(value: string, fallbackText = ""): string {
  const v = (value || "").trim().toLowerCase();
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(v)) return v;
  return extractEmail(fallbackText).toLowerCase();
}

const STRICT_PROMPT = `Você é um extrator de currículos brasileiros. Leia TODAS as páginas do currículo e retorne somente JSON com nome, telefone, email, cidade e estado.
REGRAS CRÍTICAS:
- Extraia somente informações explicitamente presentes no currículo. Nunca invente.
- cidade = cidade de RESIDÊNCIA do candidato, não cidade de emprego, faculdade, empresa, vaga ou unidade.
- Procure primeiro dados pessoais, contato, endereço, residência, cidade/UF e cabeçalho do candidato.
- Aceite formatos como "Porto Alegre/RS", "Porto Alegre - RS", "Porto Alegre, RS", "Santo André, São Paulo, Brasil", "Cidade: Porto Alegre", "UF: RS" e endereços completos.
- estado deve ser sempre a UF de 2 letras.
- Se cidade ou estado não estiverem explicitamente identificáveis, retorne "".
- telefone somente dígitos, com DDD, 10 ou 11 dígitos.
- email em minúsculas.
- Para PDF escaneado/imagem, faça OCR cuidadoso.
- Retorne EXATAMENTE: {"nome":"","telefone":"","email":"","cidade":"","estado":""}.`;

function extractLocationFallback(text: string): { cidade: string; estado: string; codigo_ibge: string | null; cidade_validada: boolean; cidade_original_extraida: string | null } | null {
  if (!text) return null;
  const stateNames: Array<[string, string]> = [
    ["distrito federal", "DF"], ["espírito santo", "ES"], ["espirito santo", "ES"], ["minas gerais", "MG"],
    ["mato grosso do sul", "MS"], ["mato grosso", "MT"], ["rio grande do norte", "RN"], ["rio grande do sul", "RS"],
    ["rio de janeiro", "RJ"], ["santa catarina", "SC"], ["são paulo", "SP"], ["sao paulo", "SP"],
    ["paraná", "PR"], ["parana", "PR"], ["paraíba", "PB"], ["paraiba", "PB"], ["pernambuco", "PE"],
    ["amazonas", "AM"], ["bahia", "BA"], ["ceará", "CE"], ["ceara", "CE"], ["goiás", "GO"], ["goias", "GO"],
    ["maranhão", "MA"], ["maranhao", "MA"], ["pará", "PA"], ["para", "PA"], ["piaui", "PI"], ["piauí", "PI"],
    ["rondônia", "RO"], ["rondonia", "RO"], ["roraima", "RR"], ["sergipe", "SE"], ["tocantins", "TO"],
    ["acre", "AC"], ["alagoas", "AL"], ["amapá", "AP"], ["amapa", "AP"], ["ceará", "CE"], ["goias", "GO"],
  ].sort((a, b) => b[0].length - a[0].length);

  const compact = text.replace(/\r/g, " ").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  for (const [stateName, uf] of stateNames) {
    const re = new RegExp(`([^|•·;:]{0,180}?)\s*(?:,|/|-|—|–|\s)\s*${stateName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\s*,?\s*Brasil)?\b`, "i");
    const match = compact.match(re);
    if (!match) continue;
    const words = (match[1] || "").match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.-]*/g) || [];
    for (let size = Math.min(5, words.length); size >= 1; size--) {
      const candidate = words.slice(-size).join(" ").replace(/^[,;|]+|[,;|]+$/g, "").trim();
      if (!candidate) continue;
      const location = validateCity(candidate, uf);
      if (location.cidade_validada && location.cidade) return location as any;
    }
  }

  // Segundo fallback: pares Cidade/UF, inclusive quando o PDF remove quebras de linha.
  const ufPattern = "AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO";
  const pair = compact.match(new RegExp("([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' .-]{2,70}?)\\s*(?:,|/|-|—|–|\\|)\\s*(" + ufPattern + ")\\b", "i"));
  if (pair) {
    const location = validateCity(pair[1].trim(), pair[2].toUpperCase());
    if (location.cidade_validada && location.cidade) return location as any;
  }
  return null;
}

function deterministicExtract(text: string): Extracted {
  const identity = extractCandidateIdentity(text);
  let cidade = identity.cidade || extractCity(text);
  let estado = identity.estado || extractUf(text);
  const fallback = extractLocationFallback(text);
  if (fallback) {
    cidade = fallback.cidade || cidade;
    estado = fallback.estado || estado;
  }
  return {
    nome: identity.nome || extractName(text),
    telefone: identity.telefone || extractPhone(text),
    email: identity.email || extractEmail(text),
    cidade,
    estado,
  };
}

function validateExtractedLocation(cidade: string, estado: string) {
  return validateCity((cidade || "").trim(), (estado || "").trim());
}

async function extractWithAiFromText(cvText: string, images: string[]): Promise<Extracted> {
  const model = google("gemini-2.5-flash");
  const content: Array<{ type: "text"; text: string } | { type: "image"; image: string }> = [{ type: "text", text: STRICT_PROMPT }];
  if (cvText.trim()) content.push({ type: "text", text: `TEXTO EXTRAÍDO DO CURRÍCULO:\n${cvText.slice(0, 32000)}` });
  for (const image of images.slice(0, 8)) content.push({ type: "image", image });
  const { object } = await generateObject({ model, schema: ExtractedSchema, messages: [{ role: "user", content }], maxRetries: 0 });
  return object;
}

export const parseAndCreateCandidato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileName: string; fileBase64: string; mimeType: string; cvText: string; images?: string[]; origemCurriculo?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY ausente");
    const cvText = (data.cvText || "").slice(0, 32000);
    const images = data.images || [];
    let extracted = deterministicExtract(cvText);
    let aiFailed = false;
    let aiErrorMsg: string | null = null;
    let location = validateExtractedLocation(extracted.cidade, extracted.estado);
    const needsAi = !extracted.nome || !extracted.telefone || !extracted.email || !location.cidade_validada || !location.estado;
    if (needsAi && (cvText.replace(/\s/g, "").length >= 30 || images.length > 0)) {
      try {
        const ai = await extractWithAiFromText(cvText, images);
        extracted = { nome: ai.nome || extracted.nome, telefone: ai.telefone || extracted.telefone, email: ai.email || extracted.email, cidade: ai.cidade || extracted.cidade, estado: ai.estado || extracted.estado };
        location = validateExtractedLocation(extracted.cidade, extracted.estado);
      } catch (e) {
        aiFailed = true;
        aiErrorMsg = e instanceof Error ? e.message : "Erro IA";
      }
    }
    const telefoneFinal = normalizePhone(extracted.telefone, cvText);
    const emailFinal = normalizeEmail(extracted.email, cvText) || null;
    const nomeFinal = (extracted.nome || "").trim() || cleanFileName(data.fileName);
    location = validateExtractedLocation(extracted.cidade, extracted.estado);
    const origem: OrigemCurriculo = normalizeOrigem(data.origemCurriculo);
    if (aiFailed) console.warn("Extração com IA falhou:", aiErrorMsg);
    if (telefoneFinal || emailFinal) {
      const orParts: string[] = [];
      if (telefoneFinal) orParts.push(`telefone.eq.${telefoneFinal}`);
      if (emailFinal) orParts.push(`email.eq.${emailFinal}`);
      const { data: existing } = await supabase.from("candidatos").select("id,nome,telefone,email,created_at,recrutador_id").or(orParts.join(",")).limit(1).maybeSingle();
      if (existing) return { candidato: null, aiFailed, duplicate: true, existing };
    }
    const safeName = data.fileName.replace(/[^\w.\-]/g, "_");
    let driveFileId: string;
    try {
      const up = await uploadPdfToDrive({ filename: `${Date.now()}-${safeName}`, pdfBase64: data.fileBase64, mimeType: data.mimeType || "application/octet-stream" });
      driveFileId = up.fileId;
    } catch (e) {
      throw new Error(`Upload Drive falhou: ${e instanceof Error ? e.message : String(e)}`);
    }
    const { data: inserted, error } = await supabase.from("candidatos").insert({
      nome: nomeFinal, telefone: telefoneFinal, email: emailFinal, cidade: location.cidade, estado: location.estado,
      codigo_ibge: location.codigo_ibge, cidade_validada: location.cidade_validada, cidade_original_extraida: location.cidade_original_extraida,
      origem_curriculo: origem, observacoes: null, curriculo_url: `drive:${driveFileId}`, recrutador_id: userId, status: "aguardando_contato",
    }).select().single();
    if (error) throw new Error(error.message);
    return { candidato: inserted, aiFailed, duplicate: false };
  });

// ===================== REPROCESSAMENTO =====================
const GATEWAY_DRIVE = "https://connector-gateway.lovable.dev/google_drive";
function driveHeaders() {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");
  if (!GOOGLE_DRIVE_API_KEY) throw new Error("GOOGLE_DRIVE_API_KEY ausente (conecte o Google Drive)");
  return { Authorization: `Bearer ${LOVABLE_API_KEY}`, "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY };
}
async function downloadFromDrive(fileId: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(`${GATEWAY_DRIVE}/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: driveHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) throw new Error("Conexão com o Google Drive expirou. Reconecte o Google Drive.");
    if (res.status === 404) throw new Error("Currículo não encontrado no Google Drive.");
    throw new Error(`Falha ao baixar currículo [${res.status}]: ${text.slice(0, 200)}`);
  }
  const mimeType = res.headers.get("content-type")?.split(";")[0] || "application/pdf";
  return { base64: Buffer.from(await res.arrayBuffer()).toString("base64"), mimeType };
}
async function extractPdfTextFromBase64(base64: string): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(Buffer.from(base64, "base64"));
  const pdf = await pdfjsLib.getDocument({ data, disableWorker: true }).promise;
  let text = "";
  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 20); pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    text += content.items.map((item: any) => ("str" in item ? item.str : "")).join(" ") + "\n";
  }
  return text;
}
async function extractWithAiFromFile(base64: string, mimeType: string, filename: string): Promise<Extracted> {
  const model = google("gemini-2.5-flash");
  const content = [
    { type: "text" as const, text: STRICT_PROMPT + "\nEste é um REPROCESSAMENTO. Reextraia os dados do arquivo completo, mesmo que o cadastro atual já tenha valores. Corrija cidade e UF se estiverem erradas." },
    { type: "file" as const, data: base64, mediaType: mimeType, filename },
  ];
  const { object } = await generateObject({ model, schema: ExtractedSchema, messages: [{ role: "user", content }], maxRetries: 0 });
  return object;
}

export const reprocessCandidato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { candidatoId: string }) => z.object({ candidatoId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cand, error: fetchErr } = await supabase.from("candidatos").select("id,nome,telefone,email,cidade,estado,curriculo_url,codigo_ibge").eq("id", data.candidatoId).maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!cand) throw new Error("Candidato não encontrado");
    if (!cand.curriculo_url?.startsWith("drive:")) throw new Error("Currículo indisponível para reprocessamento (sem arquivo no Drive).");

    const fileId = cand.curriculo_url.slice(6);
    const { base64, mimeType } = await downloadFromDrive(fileId);
    let cvText = "";
    try { cvText = await extractPdfTextFromBase64(base64); } catch (e) { console.warn("Não foi possível extrair texto local do PDF:", e); }

    // O fallback determinístico roda sempre. Assim um currículo textual não depende da quota do Gemini.
    let extracted = deterministicExtract(cvText);
    let location = validateExtractedLocation(extracted.cidade, extracted.estado);
    let aiFailed = false;
    let aiErrorMsg: string | null = null;
    const needsAi = !extracted.nome || !extracted.telefone || !extracted.email || !location.cidade_validada || !location.estado;
    if (needsAi) {
      try {
        extracted = await extractWithAiFromFile(base64, mimeType, `${cand.nome || "curriculo"}.pdf`);
        location = validateExtractedLocation(extracted.cidade, extracted.estado);
      } catch (e) {
        aiFailed = true;
        aiErrorMsg = e instanceof Error ? e.message : "Erro IA";
        console.warn("Reprocessamento IA falhou; mantendo resultado determinístico:", aiErrorMsg);
      }
    }

    // Se a IA falhou ou retornou localização inválida, roda novamente o fallback diretamente no texto bruto.
    if (!location.cidade_validada) {
      const fallback = extractLocationFallback(cvText);
      if (fallback) {
        extracted.cidade = fallback.cidade || extracted.cidade;
        extracted.estado = fallback.estado || extracted.estado;
        location = validateExtractedLocation(extracted.cidade, extracted.estado);
      }
    }

    const telefoneNew = normalizePhone(extracted.telefone, cvText);
    const emailNew = normalizeEmail(extracted.email, cvText);
    const nomeNew = (extracted.nome || "").trim();
    location = validateExtractedLocation(extracted.cidade, extracted.estado);
    const patch: Record<string, string | boolean | null> = {};
    const updatedFields: string[] = [];
    const isPlausibleName = (n: string) => /^[A-Za-zÀ-ÿ'’\-\s]{3,}$/.test(n) && n.trim().split(/\s+/).length >= 2;
    const different = (a: unknown, b: unknown) => String(a ?? "").trim().toLowerCase() !== String(b ?? "").trim().toLowerCase();

    if (nomeNew && isPlausibleName(nomeNew) && different(nomeNew, cand.nome)) { patch.nome = nomeNew; updatedFields.push("nome"); }
    if (telefoneNew && different(telefoneNew, cand.telefone)) { patch.telefone = telefoneNew; updatedFields.push("telefone"); }
    if (emailNew && different(emailNew, cand.email)) { patch.email = emailNew; updatedFields.push("email"); }
    if (location.cidade_validada && location.cidade) {
      if (different(location.cidade, cand.cidade)) { patch.cidade = location.cidade; updatedFields.push("cidade"); }
      if (different(location.estado, cand.estado)) { patch.estado = location.estado; updatedFields.push("estado"); }
      if (location.codigo_ibge && different(location.codigo_ibge, cand.codigo_ibge)) patch.codigo_ibge = location.codigo_ibge;
      patch.cidade_validada = true;
      patch.cidade_original_extraida = null;
    } else if (location.estado && different(location.estado, cand.estado)) {
      patch.estado = location.estado;
      updatedFields.push("estado");
    }

    const nowIso = new Date().toISOString();
    patch.ultimo_reprocessamento_at = nowIso;
    const { error: updErr } = await supabase.from("candidatos").update(patch as never).eq("id", data.candidatoId);
    if (updErr) throw new Error(updErr.message);
    return {
      updatedFields,
      ultimo_reprocessamento_at: nowIso,
      aiFailed,
      aiError: aiFailed ? aiErrorMsg : null,
      extracted: { nome: nomeNew, telefone: telefoneNew, email: emailNew, cidade: extracted.cidade || "", estado: extracted.estado || "", cidadeValidada: location.cidade_validada },
    };
  });
