import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { google } from "@ai-sdk/google";
import { uploadPdfToDrive } from "@/lib/curriculos.functions";
import { generateObject } from "ai";
import { z } from "zod";
import { extractCandidateIdentity, extractCity, extractUf, extractPhone, extractEmail, extractName } from "@/lib/candidate-parser";
import { validateCity, normalizeOrigem, type OrigemCurriculo } from "@/lib/city-validation";
import { createLovableAiGatewayProvider, LOVABLE_GATEWAY_MODELS } from "@/lib/ai-gateway";

// ===================== CADEIA DE FALLBACK DE MODELOS =====================
// A IA é opcional. Quando houver GEMINI_API_KEY ou LOVABLE_API_KEY, ela pode
// enriquecer a extração determinística. Sem essas chaves, o ATS continua
// funcionando com o parser local e não bloqueia o cadastro.
function isRateLimitError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /429|rate.?limit|resource.?exhausted|quota/i.test(msg);
}

type ModelAttempt = { label: string; model: Parameters<typeof generateObject>[0]["model"] };

function buildModelChain(): ModelAttempt[] {
  const attempts: ModelAttempt[] = [];
  if (process.env.GEMINI_API_KEY) {
    attempts.push(
      { label: "google:gemini-2.5-flash", model: google("gemini-2.5-flash") },
      { label: "google:gemini-2.5-flash-lite", model: google("gemini-2.5-flash-lite") },
      { label: "google:gemini-2.0-flash", model: google("gemini-2.0-flash") },
    );
  }
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (lovableKey) {
    const lovable = createLovableAiGatewayProvider(lovableKey);
    attempts.push(
      { label: "lovable-gateway:gemini-2.5-flash", model: lovable(LOVABLE_GATEWAY_MODELS.geminiFlash) },
      { label: "lovable-gateway:gemini-2.5-flash-lite", model: lovable(LOVABLE_GATEWAY_MODELS.geminiFlashLite) },
    );
  }
  return attempts;
}

async function generateObjectWithFallback<T extends z.ZodTypeAny>(
  schema: T,
  buildMessages: (model: Parameters<typeof generateObject>[0]["model"]) => Parameters<typeof generateObject>[0]["messages"],
): Promise<z.infer<T>> {
  const chain = buildModelChain();
  if (!chain.length) throw new Error("Nenhum provedor de IA configurado");
  let lastError: unknown = null;
  for (const attempt of chain) {
    try {
      const { object } = (await generateObject({
        model: attempt.model,
        schema,
        messages: buildMessages(attempt.model),
        maxRetries: 0,
      } as Parameters<typeof generateObject>[0])) as { object: z.infer<T> };
      return object;
    } catch (e) {
      lastError = e;
      const rateLimited = isRateLimitError(e);
      console.warn(`Extração IA falhou em ${attempt.label} (${rateLimited ? "limite de taxa" : "erro"}):`, e instanceof Error ? e.message : e);
      if (!rateLimited) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Todos os modelos de IA falharam");
}

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

// Pega até `maxWords` palavras (letras) imediatamente antes da posição `index`
// dentro de `text`. Limitar a janela evita que a regex "volte" até o início
// do currículo e capture nome/cargo do candidato como se fosse a cidade.
function wordsBefore(text: string, index: number, maxWords = 5): string[] {
  const before = text.slice(0, index);
  const matches = before.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.-]*/g) || [];
  return matches.slice(-maxWords);
}

// Dada a posição de uma UF no texto, tenta cidade+UF usando janelas
// decrescentes de palavras imediatamente anteriores (5, 4, 3, 2, 1 palavras),
// preferindo o candidato mais específico que valida contra o cadastro IBGE.
function tryCandidatesBeforeUf(compact: string, index: number, uf: string) {
  const words = wordsBefore(compact, index, 5);
  for (let size = words.length; size >= 1; size--) {
    const candidate = words.slice(-size).join(" ").trim();
    if (!candidate) continue;
    const location = validateCity(candidate, uf);
    if (location.cidade_validada && location.cidade) return location;
  }
  return null;
}

function extractLocationFallback(text: string): { cidade: string; estado: string; codigo_ibge: string | null; cidade_validada: boolean; cidade_original_extraida: string | null } | null {
  if (!text) return null;
  const compact = text.replace(/\r/g, " ").replace(/\n/g, " ").replace(/\s+/g, " ").trim();

  // 1) Prioriza a sigla de 2 letras (ex.: "Barueri, SP", "São Paulo - SP"),
  // que é o formato mais comum em currículos e o menos ambíguo. Percorre
  // TODAS as ocorrências da sigla no texto, não só a primeira, pois um
  // currículo pode citar a UF de uma empresa/vaga antes do endereço real.
  const ufPattern = "AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO";
  const ufRe = new RegExp(`(?:^|[\\s,/\\-–—|])(${ufPattern})\\b`, "g");
  let m: RegExpExecArray | null;
  while ((m = ufRe.exec(compact))) {
    const uf = m[1].toUpperCase();
    const ufIndex = m.index + m[0].indexOf(m[1]);
    const location = tryCandidatesBeforeUf(compact, ufIndex, uf);
    if (location) return location as any;
  }

  // 2) Nome do estado por extenso (menos comum). Mesma lógica de janela
  // limitada de palavras, para não confundir bairro/cidade com o nome do
  // estado (ex.: "Penha – São Paulo – SP" não pode virar cidade="Penha").
  const stateNames: Array<[string, string]> = [
    ["distrito federal", "DF"], ["espírito santo", "ES"], ["espirito santo", "ES"], ["minas gerais", "MG"],
    ["mato grosso do sul", "MS"], ["mato grosso", "MT"], ["rio grande do norte", "RN"], ["rio grande do sul", "RS"],
    ["rio de janeiro", "RJ"], ["santa catarina", "SC"], ["são paulo", "SP"], ["sao paulo", "SP"],
    ["paraná", "PR"], ["parana", "PR"], ["paraíba", "PB"], ["paraiba", "PB"], ["pernambuco", "PE"],
    ["amazonas", "AM"], ["bahia", "BA"], ["ceará", "CE"], ["ceara", "CE"], ["goiás", "GO"], ["goias", "GO"],
    ["maranhão", "MA"], ["maranhao", "MA"], ["pará", "PA"], ["para", "PA"], ["piaui", "PI"], ["piauí", "PI"],
    ["rondônia", "RO"], ["rondonia", "RO"], ["roraima", "RR"], ["sergipe", "SE"], ["tocantins", "TO"],
    ["acre", "AC"], ["alagoas", "AL"], ["amapá", "AP"], ["amapa", "AP"],
  ].sort((a, b) => b[0].length - a[0].length);

  for (const [stateName, uf] of stateNames) {
    const re = new RegExp(`\\b${stateName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    const match = re.exec(compact);
    if (!match) continue;
    const location = tryCandidatesBeforeUf(compact, match.index, uf);
    if (location) return location as any;
  }

  return null;
}

function normalizeCandidateName(value: string): string {
  const name = (value || "").replace(/\s+/g, " ").trim();
  if (!name || name.length > 70 || /\d/.test(name) || name.includes("@")) return "";
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 6) return "";
  const forbidden = [
    "curriculo", "currículo", "curriculum", "contato", "contact", "experiencia", "experiência", "resumo", "summary", "objetivo", "objective", "linkedin",
    "formacao", "formação", "education", "habilidades", "skills", "competencias", "competências", "telefone", "celular", "email", "endereco", "endereço",
    "perfil", "profile", "sobre mim", "experiência profissional", "status da vaga", "vaga atual", "adequacao com ia", "adequação com ia",
    "adequacao da ia a vaga", "adequação da ia a vaga", "impressao cv", "impressão cv", "grupo villela",
  ];
  const lower = name.toLowerCase();
  if (forbidden.some((w) => lower.includes(w))) return "";
  if (!words.every((w) => /^[A-Za-zÀ-ÿ'’-]+$/.test(w))) return "";
  return name;
}

function extractNameFromFileName(fileName: string): string {
  const raw = cleanFileName(fileName)
    .replace(/\b(curriculo|currículo|cv|resume|resum[eé])\b/gi, " ")
    .replace(/\b(arquivo|documento|document)\b/gi, " ")
    .replace(/\s+\d+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalizeCandidateName(raw);
}

function deterministicExtract(text: string, fileName = ""): Extracted {
  const identity = extractCandidateIdentity(text);
  let cidade = identity.cidade || extractCity(text);
  let estado = identity.estado || extractUf(text);
  const fallback = extractLocationFallback(text);
  if (fallback) {
    cidade = fallback.cidade || cidade;
    estado = fallback.estado || estado;
  }
  return {
    nome: normalizeCandidateName(identity.nome || extractName(text) || extractNameFromFileName(fileName)),
    telefone: identity.telefone || extractPhone(text),
    email: identity.email || extractEmail(text),
    cidade,
    estado,
  };
}

function validateExtractedLocation(cidade: string, estado: string) {
  return validateCity((cidade || "").trim(), (estado || "").trim());
}

// A IA é uma camada opcional de enriquecimento. Quando configurada, campos
// essenciais ausentes ou localização não validada disparam uma tentativa.
// Quando não há provedor, o parser determinístico segue normalmente.
function hasAiProvider(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.LOVABLE_API_KEY);
}

function needsAiExtraction(extracted: Extracted, location?: ReturnType<typeof validateExtractedLocation>): boolean {
  return Boolean(
    !extracted.nome ||
    !extracted.telefone ||
    !extracted.email ||
    !location?.cidade_validada ||
    !location?.estado,
  );
}

async function extractWithAiFromText(cvText: string, images: string[]): Promise<Extracted> {
  const content: Array<{ type: "text"; text: string } | { type: "image"; image: string }> = [{ type: "text", text: STRICT_PROMPT }];
  if (cvText.trim()) content.push({ type: "text", text: `TEXTO EXTRAÍDO DO CURRÍCULO:\n${cvText.slice(0, 32000)}` });
  for (const image of images.slice(0, 8)) content.push({ type: "image", image });
  return generateObjectWithFallback(ExtractedSchema, () => [{ role: "user", content }]);
}

export const parseAndCreateCandidato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileName: string; fileBase64: string; mimeType: string; cvText: string; images?: string[]; origemCurriculo?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cvText = (data.cvText || "").slice(0, 32000);
    const images = data.images || [];
    let extracted = deterministicExtract(cvText, data.fileName);
    let aiFailed = false;
    let aiErrorMsg: string | null = null;
    let location = validateExtractedLocation(extracted.cidade, extracted.estado);

    async function findDuplicate(telefone: string, email: string | null) {
      if (!telefone && !email) return null;
      const orParts: string[] = [];
      if (telefone) orParts.push(`telefone.eq.${telefone}`);
      if (email) orParts.push(`email.eq.${email}`);
      const { data: existing } = await supabase.from("candidatos").select("id,nome,telefone,email,created_at,recrutador_id").or(orParts.join(",")).limit(1).maybeSingle();
      return existing;
    }

    const preTelefone = normalizePhone(extracted.telefone, cvText);
    const preEmail = normalizeEmail(extracted.email, cvText) || null;
    const earlyDuplicate = await findDuplicate(preTelefone, preEmail);
    if (earlyDuplicate) return { candidato: null, aiFailed: false, duplicate: true, existing: earlyDuplicate };

    const needsAi = needsAiExtraction(extracted, location);
    if (hasAiProvider() && needsAi && (cvText.replace(/\s/g, "").length >= 30 || images.length > 0)) {
      try {
        const ai = await extractWithAiFromText(cvText, images);
        extracted = {
          nome: ai.nome || extracted.nome,
          telefone: ai.telefone || extracted.telefone,
          email: ai.email || extracted.email,
          cidade: ai.cidade || extracted.cidade,
          estado: ai.estado || extracted.estado,
        };
        location = validateExtractedLocation(extracted.cidade, extracted.estado);
      } catch (e) {
        aiFailed = true;
        aiErrorMsg = e instanceof Error ? e.message : "Erro IA";
      }
    }

    const telefoneFinal = normalizePhone(extracted.telefone, cvText);
    const emailFinal = normalizeEmail(extracted.email, cvText) || null;
    const nomeFinal = normalizeCandidateName(extracted.nome);
    location = validateExtractedLocation(extracted.cidade, extracted.estado);
    const origem: OrigemCurriculo = normalizeOrigem(data.origemCurriculo);
    if (aiFailed) console.warn("Extração com IA falhou:", aiErrorMsg);
    if ((telefoneFinal && telefoneFinal !== preTelefone) || (emailFinal && emailFinal !== preEmail)) {
      const lateDuplicate = await findDuplicate(telefoneFinal, emailFinal);
      if (lateDuplicate) return { candidato: null, aiFailed, duplicate: true, existing: lateDuplicate };
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
  if (!LOVABLE_API_KEY) throw new Error("Conexão com o Google Drive indisponível (LOVABLE_API_KEY ausente)");
  if (!GOOGLE_DRIVE_API_KEY) throw new Error("Conexão com o Google Drive indisponível (conecte o Google Drive)");
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
  const content = [
    { type: "text" as const, text: STRICT_PROMPT + "\nEste é um REPROCESSAMENTO. Reextraia os dados do arquivo completo, mesmo que o cadastro atual já tenha valores. Corrija cidade e UF se estiverem erradas." },
    { type: "file" as const, data: base64, mediaType: mimeType, filename },
  ];
  return generateObjectWithFallback(ExtractedSchema, () => [{ role: "user", content }]);
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

    // O reprocessamento sempre tenta primeiro o parser determinístico. IA é opcional.
    let extracted = deterministicExtract(cvText);
    let location = validateExtractedLocation(extracted.cidade, extracted.estado);
    let aiFailed = false;
    let aiErrorMsg: string | null = null;
    const needsAi = needsAiExtraction(extracted, location);
    if (hasAiProvider() && needsAi) {
      try {
        extracted = await extractWithAiFromFile(base64, mimeType, `${cand.nome || "curriculo"}.pdf`);
        location = validateExtractedLocation(extracted.cidade, extracted.estado);
      } catch (e) {
        aiFailed = true;
        aiErrorMsg = e instanceof Error ? e.message : "Erro IA";
        console.warn("Reprocessamento IA falhou; mantendo resultado determinístico:", aiErrorMsg);
      }
    }

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
    const nomeNew = normalizeCandidateName(extracted.nome);
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
