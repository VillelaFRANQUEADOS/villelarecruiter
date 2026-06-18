/**
 * Parser determinístico de currículos brasileiros.
 * Sem IA. Sistema de pontuação por linha.
 * Extrai: nome, telefone, cidade, estado (UF).
 */

import { BRAZIL_CITIES, findCityInText, normalizeCityText } from "./brazil-cities";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface CandidateIdentity {
  nome: string;
  telefone: string;
  cidade: string;
  estado: string;
  confidence: number;
}

interface ScoredName {
  text: string;
  lineIndex: number;
  score: number;
}

interface PhoneCandidate {
  normalized: string;
  lineIndex: number;
}

interface CityCandidate {
  name: string;
  uf: string;
  lineIndex: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const UF_SIGLAS = new Set([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
]);

const UF_NAMES: Record<string, string> = {
  "acre":"AC","alagoas":"AL","amapa":"AP","amapá":"AP","amazonas":"AM","bahia":"BA",
  "ceara":"CE","ceará":"CE","distrito federal":"DF","espirito santo":"ES","espírito santo":"ES",
  "goias":"GO","goiás":"GO","maranhao":"MA","maranhão":"MA","mato grosso":"MT",
  "mato grosso do sul":"MS","minas gerais":"MG","para":"PA","pará":"PA",
  "paraiba":"PB","paraíba":"PB","parana":"PR","paraná":"PR","pernambuco":"PE",
  "piaui":"PI","piauí":"PI","rio de janeiro":"RJ","rio grande do norte":"RN",
  "rio grande do sul":"RS","rondonia":"RO","rondônia":"RO","roraima":"RR",
  "santa catarina":"SC","sao paulo":"SP","são paulo":"SP","sergipe":"SE","tocantins":"TO",
};

const FORBIDDEN_WORDS = new Set([
  "curriculo","curriculum","resumo","summary","objetivo","objective",
  "experiencia","experiencia","experience","formacao","formacao","education",
  "pagina","pagina","page","linkedin","indeed","visualizado","atualizado",
  "referencias","referencias","references","habilidades","skills","competencias",
  "competencias","idiomas","languages","certificacoes","certificacoes","contato",
  "contact","endereco","endereco","address","nacionalidade","estado civil",
  "candidato","candidata","perfil","profile","curriculo vitae","dados pessoais",
]);

const NAME_PENALTY_WORDS = [
  "currículo","curriculum","linkedin","page","página","resumo","summary",
  "objetivo","experiência","formação","education","email","telefone","celular",
  "whatsapp","fone","tel","cel","cep","rua","av.","avenida","bairro","número",
  "number","street","data de","nascimento","cpf","rg","cnh",
];

const PHONE_REGEX_SOURCE =
  /(?:\+?55[\s.\-]?)?\(?(\d{2})\)?[\s.\-]?(9?\d{4})[\s.\-]?(\d{4})/.source;

const UF_CONTEXT_REGEX_SOURCE = /(?:^|[\s,/\-])([A-Z]{2})(?:[\s,/\-]|$)/.source;

// ─── Normalização de linhas ───────────────────────────────────────────────────

export function normalizeLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/\s+/g, " ")
        .replace(/[^\w\sÀ-ÿ@.,;:()+\-/]/g, " ")
        .trim()
    )
    .filter((line) => line.length > 1);
}

// ─── Telefones ────────────────────────────────────────────────────────────────

export function findPhones(lines: string[]): PhoneCandidate[] {
  const results: PhoneCandidate[] = [];
  const seen = new Set<string>();

  lines.forEach((line, index) => {
    const re = new RegExp(PHONE_REGEX_SOURCE, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const digits = (m[1] + m[2] + m[3]).replace(/\D/g, "");
      if ((digits.length === 10 || digits.length === 11) && !seen.has(digits)) {
        seen.add(digits);
        results.push({ normalized: digits, lineIndex: index });
      }
    }
  });

  return results;
}

export function calculatePhoneScore(phone: PhoneCandidate, totalLines: number): number {
  let score = 50;
  const relativePos = phone.lineIndex / Math.max(totalLines, 1);
  if (relativePos < 0.33) score += 20;
  else if (relativePos < 0.5) score += 10;
  // Celular (11 dígitos com 9) tem prioridade sobre fixo (10 dígitos)
  if (phone.normalized.length === 11) score += 5;
  return score;
}

// ─── Cidades ─────────────────────────────────────────────────────────────────

export function findCities(lines: string[]): CityCandidate[] {
  const results: CityCandidate[] = [];
  const seen = new Set<string>();

  lines.forEach((line, index) => {
    // Padrão 1: "Cidade - UF" / "Cidade/UF" / "Cidade, UF" / "Cidade UF"
    const patterns = [
      /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,40}?)\s*[-\/,]\s*([A-Z]{2})\b/g,
      /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,40}?)\s+([A-Z]{2})\s*$/g,
    ];

    for (const pattern of patterns) {
      const re = new RegExp(pattern.source, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const cityRaw = m[1].trim();
        const ufRaw = m[2].trim();
        if (!UF_SIGLAS.has(ufRaw)) continue;
        if (isForbidden(cityRaw)) continue;
        if (cityRaw.split(/\s+/).length > 5) continue;
        if (cityRaw.length < 3) continue;

        const normed = normalizeCityText(cityRaw);
        const found = BRAZIL_CITIES.find((c) => c.normalized === normed && c.uf === ufRaw);
        const finalName = found ? found.name : cityRaw;
        const key = `${finalName}|${ufRaw}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ name: finalName, uf: ufRaw, lineIndex: index });
        }
      }
    }

    // Padrão 2: cidade por extenso na base (ex: "Florianópolis, Santa Catarina")
    const byName = findCityInText(line);
    if (byName) {
      const key = `${byName.name}|${byName.uf}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ name: byName.name, uf: byName.uf, lineIndex: index });
      }
    }
  });

  return results;
}

export function calculateCityScore(
  city: CityCandidate,
  phones: PhoneCandidate[],
  names: ScoredName[],
  totalLines: number
): number {
  let score = 30;
  const relativePos = city.lineIndex / Math.max(totalLines, 1);

  if (relativePos < 0.3) score += 20;
  else if (relativePos < 0.5) score += 10;

  for (const ph of phones) {
    const dist = Math.abs(city.lineIndex - ph.lineIndex);
    if (dist <= 3) score += 25;
    else if (dist <= 8) score += 10;
  }

  for (const nm of names.slice(0, 3)) {
    const dist = Math.abs(city.lineIndex - nm.lineIndex);
    if (dist <= 5) score += 15;
    else if (dist <= 12) score += 5;
  }

  // Cidade validada na base recebe bônus extra
  const normed = normalizeCityText(city.name);
  const inBase = BRAZIL_CITIES.some((c) => c.normalized === normed && c.uf === city.uf);
  if (inBase) score += 20;

  return score;
}

// ─── Nomes ────────────────────────────────────────────────────────────────────

export function calculateNameScore(line: string, lineIndex: number, totalLines: number): number {
  if (!line || line.length < 3) return 0;
  if (line.includes("@")) return 0;
  if (/\d{4,}/.test(line)) return 0;
  if (isForbidden(line)) return 0;

  const lineLower = line.toLowerCase();
  for (const word of NAME_PENALTY_WORDS) {
    if (lineLower.includes(word)) return 0;
  }

  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return 0;

  const CONNECTORS = new Set([   "de",   "da",   "do",   "das",   "dos",   "e" ]);  const allLetters = words.every((w) => {     const lower = w.toLowerCase();      if (CONNECTORS.has(lower)) {         return true;     }      return /^[A-Za-zÀ-ÿ]+$/.test(w); });
  if (!allLetters) return 0;

  const allCapitalized = words.every((w) =>
    /^[A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝ]/.test(w)
  );
  if (!allCapitalized) return 0;

  let score = 10;

  if (lineIndex === 0) score += 50;
  else if (lineIndex <= 2) score += 40;
  else if (lineIndex <= 5) score += 30;
  else if (lineIndex <= 10) score += 15;
  else if (lineIndex <= 20) score += 5;

  if (words.length === 3 || words.length === 4) score += 20;
  else if (words.length === 2) score += 10;

  const avgLen = words.reduce((s, w) => s + w.length, 0) / words.length;
  if (avgLen >= 4) score += 10;

  // Penalidade leve por preposições (nome ainda pode ser válido)
  const preps = new Set(["De","Da","Do","Dos","Das","E"]);
  const onlyPreps = words.filter((w) => preps.has(w));
  if (onlyPreps.length > 0) score -= 5 * onlyPreps.length;

  return Math.max(score, 0);
}

export function findNames(lines: string[]): ScoredName[] {
  return lines
    .map((line, index) => ({
      text: line,
      lineIndex: index,
      score: calculateNameScore(line, index, lines.length),
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ─── UF standalone ────────────────────────────────────────────────────────────

export function extractUfFromLines(lines: string[]): string {
  for (const line of lines.slice(0, 30)) {
    const re = new RegExp(UF_CONTEXT_REGEX_SOURCE, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (UF_SIGLAS.has(m[1])) return m[1];
    }
  }
  const allText = lines.join(" ").toLowerCase();
  for (const [name, uf] of Object.entries(UF_NAMES)) {
    if (allText.includes(name)) return uf;
  }
  return "";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isForbidden(text: string): boolean {
  const normed = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  for (const word of FORBIDDEN_WORDS) {
    if (normed.includes(word)) return true;
  }
  return false;
}

export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  return digits.length === 10 || digits.length === 11 ? digits : "";
}

// ─── Função principal ─────────────────────────────────────────────────────────
function findHeaderEnd(lines: string[]): number {
  const markers = [
    "resumo",
    "summary",
    "objetivo",
    "objective",
    "experiência",
    "experiencia",
    "experience",
    "formação",
    "formacao",
    "education",
    "histórico profissional",
    "historico profissional",
    "professional experience"
  ];

  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const line = lines[i]
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (markers.some(marker => line.includes(marker))) {
      return i;
    }
  }

  return Math.min(lines.length, 20);
}
export function extractCandidateIdentity(text: string): CandidateIdentity {
  if (!text || text.replace(/\s/g, "").length < 5) {
    return { nome: "", telefone: "", cidade: "", estado: "", confidence: 0 };
  }

  const lines = normalizeLines(text);

const headerEnd = findHeaderEnd(lines);

// Analisa apenas o cabeçalho
const headerLines = lines.slice(0, headerEnd + 5);

let phones = findPhones(headerLines);
let cities = findCities(headerLines);
let names = findNames(headerLines);
  
  // Se não encontrou no cabeçalho,
// procura no documento inteiro.

if (phones.length === 0) {
    phones = findPhones(lines);
}

if (cities.length === 0) {
    cities = findCities(lines);
}

if (names.length === 0) {
    names = findNames(lines);
}

  // Melhor telefone = maior score (considera posição no topo)
  const bestPhone =
    phones.length > 0
      ? phones.reduce((best, p) =>
          calculatePhoneScore(p, lines.length) >= calculatePhoneScore(best, lines.length)
            ? p
            : best
        )
      : null;

  // Melhor cidade = maior score (considera proximidade com nome+telefone)
  const topNames = names.slice(0, 5);
  const bestCity =
    cities.length > 0
      ? cities.reduce((best, c) =>
          calculateCityScore(c, phones, topNames, lines.length) >=
          calculateCityScore(best, phones, topNames, lines.length)
            ? c
            : best
        )
      : null;

  // Melhor nome = maior score no ranking
  const bestName = names.length > 0 ? names[0] : null;

  // Estado vem da cidade detectada, ou busca standalone
  const estado = bestCity?.uf ?? extractUfFromLines(lines);

  // Confidence: cada campo contribui 25%
  let confidence = 0;
  if (bestName) confidence += 25;
  if (bestPhone) confidence += 25;
  if (bestCity) confidence += 25;
  if (estado) confidence += 25;

  return {
    nome: bestName?.text ?? "",
    telefone: bestPhone?.normalized ?? "",
    cidade: bestCity?.name ?? "",
    estado,
    confidence,
  };
}
