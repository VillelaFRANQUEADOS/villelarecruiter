// Parser determinístico (sem IA) de identidade de candidato.
// Cobre layouts LinkedIn, Pandapé, PDFs em 2 colunas e currículos genéricos.

export interface CandidateIdentity {
  nome: string;
  telefone: string;
  email: string;
  cidade: string;
  estado: string;
}

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA",
  "PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
] as const;
const UF_SET = new Set<string>(UFS);

const UF_NAMES: Record<string, string> = {
  "acre":"AC","alagoas":"AL","amapa":"AP","amapá":"AP","amazonas":"AM","bahia":"BA",
  "ceara":"CE","ceará":"CE","distrito federal":"DF","espirito santo":"ES","espírito santo":"ES",
  "goias":"GO","goiás":"GO","maranhao":"MA","maranhão":"MA","mato grosso":"MT","mato grosso do sul":"MS",
  "minas gerais":"MG","para":"PA","pará":"PA","paraiba":"PB","paraíba":"PB","parana":"PR","paraná":"PR",
  "pernambuco":"PE","piaui":"PI","piauí":"PI","rio de janeiro":"RJ","rio grande do norte":"RN",
  "rio grande do sul":"RS","rondonia":"RO","rondônia":"RO","roraima":"RR","santa catarina":"SC",
  "sao paulo":"SP","são paulo":"SP","sergipe":"SE","tocantins":"TO",
};

const FORBIDDEN_WORDS = new Set<string>([
  "curriculo","currículo","curriculum","vitae","cv","dados","pessoais","contato","contatos",
  "endereco","endereço","telefone","celular","email","e-mail","linkedin","github","portfolio",
  "portfólio","objetivo","resumo","perfil","experiencia","experiência","formacao","formação",
  "educacao","educação","habilidades","competencias","competências","idiomas","cursos","brasil",
  "brazil","principais","atividades","empresa","empresas","cargo","cargos","referencias","referências",
  // cargos comuns (evita confundir cargo do topo do Pandapé com nome)
  "administracao","administração","vendedor","vendedora","gerente","consultor","consultora",
  "assistente","analista","estagiario","estagiária","estagiaria","estagiário","coordenador",
  "coordenadora","supervisor","supervisora","diretor","diretora","auxiliar","operador","operadora",
  "tecnico","técnico","engenheiro","engenheira","desenvolvedor","desenvolvedora","programador",
]);

// -------- helpers de texto --------

/** Divide uma linha em várias quando houver 4+ espaços consecutivos (layouts em colunas). */
function splitColumns(line: string): string[] {
  if (!line) return [];
  if (/\s{4,}/.test(line)) {
    return line.split(/\s{4,}/).map((s) => s.trim()).filter(Boolean);
  }
  return [line];
}

/** Normaliza texto em linhas: trim, remove vazias, explode colunas. */
export function normalizeLines(text: string): string[] {
  if (!text) return [];
  const raw = text.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const l of raw) {
    const t = l.trim();
    if (!t) continue;
    for (const piece of splitColumns(t)) out.push(piece);
  }
  return out;
}

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isForbiddenWord(word: string): boolean {
  return FORBIDDEN_WORDS.has(stripDiacritics(word).toLowerCase());
}

// -------- EMAIL --------

export function extractEmail(text: string): string {
  const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0].toLowerCase() : "";
}

// -------- TELEFONE --------

// Cobre: (019) 99292-8243 | +5511960430989 | 85-989973869 | 19-981781756 | (11) 9 9999-9999
const PHONE_REGEX_SOURCE =
  "(?:\\+?55[\\s.\\-]?)?(?:\\(?(\\d{2})\\)?[\\s.\\-]?)(9?[\\s.\\-]?\\d{4})[\\s.\\-]?(\\d{4})";

export function extractPhone(text: string): string {
  if (!text) return "";
  // Descarta contextos claramente não-telefone
  const cleaned = text
    // CEP: 12345-678 ou 12345678
    .replace(/\b\d{5}-?\d{3}\b/g, " ")
    // anos 19xx/20xx isolados
    .replace(/\b(19|20)\d{2}\b/g, " ");

  const re = new RegExp(PHONE_REGEX_SOURCE, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    let digits = (m[1] + m[2] + m[3]).replace(/\D/g, "");
    // remove DDI 55 se sobrar >11
    if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
    if (digits.length === 10 || digits.length === 11) return digits;
  }
  return "";
}

// -------- CIDADE / UF --------

/** Limpeza específica de artefatos comuns antes de casar cidade/UF. */
function cleanCityLine(line: string): string {
  let s = line;
  // "... . CEP 12345-678 ..." -> corta a partir do CEP
  s = s.replace(/\.?\s*CEP\s*\d{5}-?\d{3}.*$/i, "");
  // "(3,5 Km da vaga)" / "(3 Km ...)"
  s = s.replace(/\(\s*\d+[,.]?\d*\s*Km[^)]*\)/gi, "");
  // sufixo ", Brasil" / ", Brazil"
  s = s.replace(/,\s*bra[sz]il\s*$/i, "");
  s = s.trim().replace(/[,\s;·|]+$/g, "").trim();
  // Duplicação "São Paulo, São Paulo" -> "São Paulo"
  const dup = s.match(/^(.+?),\s*(.+)$/);
  if (dup && stripDiacritics(dup[1]).toLowerCase().trim() === stripDiacritics(dup[2]).toLowerCase().trim()) {
    s = dup[1].trim();
  }
  return s;
}

/** UF válida = sigla de 2 letras NÃO precedida por letra colada (evita CRA-SP, OAB-RJ). */
function findUfInSegment(seg: string): string {
  const re = /(^|[^A-Za-zÀ-ÿ])([A-Z]{2})(?![A-Za-zÀ-ÿ])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg)) !== null) {
    const uf = m[2];
    if (!UF_SET.has(uf)) continue;
    // checa char imediatamente antes do match do UF em si
    const idx = m.index + m[1].length;
    const prev = idx > 0 ? seg[idx - 1] : "";
    if (prev && /[A-Za-zÀ-ÿ]/.test(prev)) continue; // colado a letras => entidade tipo CRA-SP
    return uf;
  }
  return "";
}

export function extractUf(text: string): string {
  if (!text) return "";
  const lines = normalizeLines(text);
  for (const line of lines) {
    const uf = findUfInSegment(cleanCityLine(line));
    if (uf) return uf;
  }
  // fallback: nome por extenso
  const lower = stripDiacritics(text).toLowerCase();
  for (const [name, uf] of Object.entries(UF_NAMES)) {
    if (lower.includes(stripDiacritics(name))) return uf;
  }
  return "";
}

export function extractCity(text: string): string {
  if (!text) return "";
  const lines = normalizeLines(text);

  for (const rawLine of lines) {
    const line = cleanCityLine(rawLine);
    if (!line) continue;

    // Segmentos separados por – ou - (ex: "Ribeirão – Capivari – São Paulo")
    if (/\s[–-]\s/.test(line)) {
      const parts = line.split(/\s[–-]\s/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const last = parts[parts.length - 1];
        const penult = parts[parts.length - 2];
        const lastKey = stripDiacritics(last).toLowerCase();
        if (UF_NAMES[lastKey] || UF_SET.has(last.toUpperCase())) {
          if (penult && !/\d/.test(penult)) return penult;
        }
      }
    }

    // Padrão "Cidade - UF" (com UF válida)
    const m1 = line.match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.]{1,60})\s*[-–]\s*([A-Z]{2})\b/);
    if (m1) {
      const cidade = m1[1].trim().replace(/[,;]+$/, "");
      const uf = m1[2];
      if (
        UF_SET.has(uf) &&
        cidade.length > 2 &&
        !/rua|avenida|\bav\.?\b|alameda|travessa/i.test(cidade)
      ) {
        return cidade;
      }
    }

    // Padrão "Cidade, UF"
    const m2 = line.match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.]{1,60}),\s*([A-Z]{2})\b/);
    if (m2 && UF_SET.has(m2[2])) {
      const cidade = m2[1].trim();
      if (cidade.length > 2) return cidade;
    }

    // Padrão "Cidade, Estado por extenso"
    const m3 = line.match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.]{1,60}),\s*([A-Za-zÀ-ÿ\s]{3,30})$/);
    if (m3) {
      const key = stripDiacritics(m3[2].trim()).toLowerCase();
      if (UF_NAMES[key]) return m3[1].trim();
    }
  }

  return "";
}

// -------- NOME --------

function isLikelyContactLine(line: string): boolean {
  const lower = line.toLowerCase();
  if (line.includes("@")) return true;
  if (/https?:\/\//i.test(line)) return true;
  if (/\blinkedin\b|\(linkedin\)|\(mobile\)/i.test(line)) return true;
  if (/\d{4,}/.test(line)) return true;
  if (/[\/]/.test(line)) return true;
  if (/(^|\s)-(\s|$)/.test(line)) return true; // hífen isolado
  if (/\b(brasil|brazil|contato|principais)\b/i.test(lower)) return true;
  return false;
}

/** Pontua uma linha como candidata a nome. Retorna 0 se inválida. */
export function calculateNameScore(line: string): number {
  if (!line) return 0;
  if (isLikelyContactLine(line)) return 0;

  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return 0;

  // todas as palavras: apenas letras (aceita MAIÚSCULAS inteiras: MARCELA, GIOVANNA)
  for (const w of words) {
    if (!/^[A-Za-zÀ-ÿ]{2,}$/.test(w)) return 0;
    if (isForbiddenWord(w)) return 0;
  }

  let score = 10;
  // bônus: todas Capitalizadas OU todas MAIÚSCULAS
  const allTitle = words.every((w) => /^[A-ZÀ-Ý][a-zà-ÿ]+$/.test(w));
  const allUpper = words.every((w) => w === w.toUpperCase());
  if (allTitle || allUpper) score += 5;
  // bônus por número de palavras "ideais"
  if (words.length >= 2 && words.length <= 4) score += 2;
  return score;
}

export function extractName(text: string): string {
  if (!text) return "";
  const lines = normalizeLines(text).slice(0, 60);
  let best = "";
  let bestScore = 0;
  for (const line of lines) {
    const s = calculateNameScore(line);
    if (s > bestScore) {
      bestScore = s;
      best = line;
    }
  }
  return best;
}

// -------- HEADER / API principal --------

const HEADER_KEYWORDS = [
  "experiencia","experiência","formacao","formação","educacao","educação",
  "habilidades","competencias","competências","idiomas","objetivo","resumo",
  "cursos","atividades","perfil profissional",
];

/** Índice (linha) onde o cabeçalho termina — primeira seção conhecida. */
export function findHeaderEnd(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const lower = stripDiacritics(lines[i]).toLowerCase();
    for (const kw of HEADER_KEYWORDS) {
      if (lower.startsWith(kw) || lower === kw) return i;
    }
  }
  return Math.min(lines.length, 40);
}

export function extractCandidateIdentity(text: string): CandidateIdentity {
  const lines = normalizeLines(text);
  const headerEnd = findHeaderEnd(lines);
  const headerText = lines.slice(0, headerEnd).join("\n");
  const fullText = lines.join("\n");

  const email = extractEmail(headerText) || extractEmail(fullText);
  const telefone = extractPhone(headerText) || extractPhone(fullText);
  const cidade = extractCity(headerText) || extractCity(fullText);
  const estado = extractUf(headerText) || extractUf(fullText);
  const nome = extractName(headerText) || extractName(fullText);

  return { nome, telefone, email, cidade, estado };
}
