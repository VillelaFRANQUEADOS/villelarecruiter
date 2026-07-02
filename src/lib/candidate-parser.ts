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

// Nome próprio "bonito" para cada chave normalizada (sem acento, lowercase).
const UF_NAME_DISPLAY: Record<string, string> = {
  "acre":"Acre","alagoas":"Alagoas","amapa":"Amapá","amazonas":"Amazonas","bahia":"Bahia",
  "ceara":"Ceará","distrito federal":"Distrito Federal","espirito santo":"Espírito Santo",
  "goias":"Goiás","maranhao":"Maranhão","mato grosso":"Mato Grosso","mato grosso do sul":"Mato Grosso do Sul",
  "minas gerais":"Minas Gerais","para":"Pará","paraiba":"Paraíba","parana":"Paraná",
  "pernambuco":"Pernambuco","piaui":"Piauí","rio de janeiro":"Rio de Janeiro",
  "rio grande do norte":"Rio Grande do Norte","rio grande do sul":"Rio Grande do Sul",
  "rondonia":"Rondônia","roraima":"Roraima","santa catarina":"Santa Catarina",
  "sao paulo":"São Paulo","sergipe":"Sergipe","tocantins":"Tocantins",
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

// Linhas a IGNORAR completamente na pontuação de nome (case-insensitive, sem acento).
const BLOCKED_NAME_LINES = new Set<string>([
  "grupo villela",
  "adequacao com ia",
  "adequacao da ia a vaga",
  "impressao cv - pandape",
  "impressao cv pandape",
  "status da vaga",
  "vaga atual",
  "origem da candidatura",
]);

// -------- helpers de texto --------

function splitColumns(line: string): string[] {
  if (!line) return [];
  if (/\s{4,}/.test(line)) {
    return line.split(/\s{4,}/).map((s) => s.trim()).filter(Boolean);
  }
  return [line];
}

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

function normKey(s: string): string {
  return stripDiacritics(s).toLowerCase().replace(/\s+/g, " ").trim();
}

function isForbiddenWord(word: string): boolean {
  return FORBIDDEN_WORDS.has(stripDiacritics(word).toLowerCase());
}

function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s|-|')([a-zà-ÿ])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

// -------- EMAIL --------

export function extractEmail(text: string): string {
  const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0].toLowerCase() : "";
}

// -------- TELEFONE --------

const PHONE_REGEX_SOURCE =
  "(?:\\+?55[\\s.\\-]?)?(?:\\(?(\\d{2})\\)?[\\s.\\-]?)(9?[\\s.\\-]?\\d{4})[\\s.\\-]?(\\d{4})";

export function extractPhone(text: string): string {
  if (!text) return "";
  const cleaned = text
    .replace(/\b\d{5}-?\d{3}\b/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ");
  const re = new RegExp(PHONE_REGEX_SOURCE, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    let digits = (m[1] + m[2] + m[3]).replace(/\D/g, "");
    if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
    if (digits.length === 10 || digits.length === 11) return digits;
  }
  return "";
}

// -------- CIDADE / UF --------

function cleanCityLine(line: string): string {
  let s = line;
  // CEP com rótulo
  s = s.replace(/\.?\s*CEP\s*\d{5}-?\d{3}.*$/i, "");
  // CEP no início da linha, sem rótulo (ex: "23020-240 Rio de Janeiro")
  s = s.replace(/^\s*\d{5}-\d{3}\s*/, "");
  // CEP solto no meio
  s = s.replace(/\b\d{5}-\d{3}\b/g, " ");
  // "(3,5 Km da vaga)"
  s = s.replace(/\(\s*\d+[,.]?\d*\s*Km[^)]*\)/gi, "");
  // sufixo ", Brasil"
  s = s.replace(/,\s*bra[sz]il\s*$/i, "");
  s = s.trim().replace(/[,\s;·|]+$/g, "").trim();
  // "São Paulo, São Paulo" -> "São Paulo"
  const dup = s.match(/^(.+?),\s*(.+)$/);
  if (dup && stripDiacritics(dup[1]).toLowerCase().trim() === stripDiacritics(dup[2]).toLowerCase().trim()) {
    s = dup[1].trim();
  }
  return s.replace(/\s{2,}/g, " ").trim();
}

function findUfInSegment(seg: string): string {
  // UF isolada: precedida por início/espaço/pontuação/separador; NÃO por letra colada
  const re = /(^|[^A-Za-zÀ-ÿ])([A-Z]{2})(?![A-Za-zÀ-ÿ])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg)) !== null) {
    const uf = m[2];
    if (!UF_SET.has(uf)) continue;
    const idx = m.index + m[1].length;
    const prev = idx > 0 ? seg[idx - 1] : "";
    if (prev && /[A-Za-zÀ-ÿ]/.test(prev)) continue;
    return uf;
  }
  return "";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractUf(text: string): string {
  if (!text) return "";
  const lines = normalizeLines(text);
  for (const line of lines) {
    const uf = findUfInSegment(cleanCityLine(line));
    if (uf) return uf;
  }
  // Fallback por nome de estado: exige contexto de localização (linha curta,
  // sem dígitos, nome delimitado por separador/começo/fim). Evita falsos
  // positivos como "para iniciantes" casando "Pará".
  for (const rawLine of lines) {
    const line = cleanCityLine(rawLine);
    if (!line) continue;
    if (/\d/.test(line)) continue;
    if (line.split(/\s+/).length > 8) continue;
    const key = stripDiacritics(line).toLowerCase();
    for (const [name, uf] of Object.entries(UF_NAMES)) {
      const re = new RegExp(
        `(^|[,/–\\-]\\s*)${escapeRegex(name)}(\\s*$|\\s*[,/–\\-])`,
        "i",
      );
      if (re.test(key)) return uf;
    }
  }
  return "";
}

// Regex agnóstico de separador (- – / • |)
const CITY_SEP = "\\s*[-–/•|]\\s*";

export function extractCity(text: string): string {
  if (!text) return "";
  const lines = normalizeLines(text);

  // 0) Rótulos explícitos "Cidade: X"
  for (const rawLine of lines) {
    const m = rawLine.match(/^\s*cidade\s*[:\-]\s*(.+)$/i);
    if (m) {
      const v = cleanCityLine(m[1]).replace(/[-–/•|].*$/, "").trim();
      if (v) return v;
    }
  }

  for (const rawLine of lines) {
    const line = cleanCityLine(rawLine);
    if (!line) continue;

    // Segmentos "A – B – C" ou "A / B / C"
    if (/\s[–\-/•|]\s/.test(line)) {
      const parts = line.split(/\s[–\-/•|]\s/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const last = parts[parts.length - 1];
        const penult = parts[parts.length - 2];
        const lastKey = stripDiacritics(last).toLowerCase();
        if (UF_NAMES[lastKey] || UF_SET.has(last.toUpperCase())) {
          if (penult && !/\d/.test(penult)) return penult;
        }
      }
    }

    // "Cidade <sep> UF" — separadores: - – / • |
    const m1 = line.match(new RegExp(`([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\\s'.]{1,60})${CITY_SEP}([A-Z]{2})\\b`));
    if (m1) {
      let cidade = m1[1].trim().replace(/[,;]+$/, "");
      const uf = m1[2];
      if (UF_SET.has(uf) && cidade.length > 2 && !/rua|avenida|\bav\.?\b|alameda|travessa/i.test(cidade)) {
        // Se veio junto com endereço tipo "Rua X, 205, Gravataí", pega só o trecho após a última vírgula
        if (cidade.includes(",")) {
          const tail = cidade.split(",").pop()!.trim();
          if (tail && !/\d/.test(tail) && !/rua|avenida|\bav\.?\b|alameda|travessa/i.test(tail)) {
            cidade = tail;
          }
        }
        return cidade;
      }
    }

    // "Cidade, UF"
    const m2 = line.match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.]{1,60}),\s*([A-Z]{2})\b/);
    if (m2 && UF_SET.has(m2[2])) {
      const cidade = m2[1].trim();
      if (cidade.length > 2) {
        if (cidade.includes(",")) {
          const tail = cidade.split(",").pop()!.trim();
          if (tail) return tail;
        }
        return cidade;
      }
    }

    // "Cidade, Estado por extenso"
    const m3 = line.match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.]{1,60}),\s*([A-Za-zÀ-ÿ\s]{3,30})$/);
    if (m3) {
      const key = stripDiacritics(m3[2].trim()).toLowerCase();
      if (UF_NAMES[key]) return m3[1].trim();
    }
  }

  // Fallback: linha reduz-se a exatamente um nome de estado (capital homônima)
  for (const rawLine of lines) {
    const line = cleanCityLine(rawLine);
    const key = stripDiacritics(line).toLowerCase().trim();
    if (UF_NAME_DISPLAY[key]) return UF_NAME_DISPLAY[key];
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
  if (/(^|\s)-(\s|$)/.test(line)) return true;
  if (/\b(brasil|brazil|contato|principais)\b/i.test(lower)) return true;
  return false;
}

/** Remove sufixo de idade e pontuação colada nas palavras. */
function cleanNameLine(line: string): string {
  let s = line.trim();
  // sufixo ", 48" ou " 48" (idade) no final
  s = s.replace(/,?\s*\d{1,3}\s*$/, "").trim();
  // remove pontuação final da linha
  s = s.replace(/[,.;:·|]+$/g, "").trim();
  return s;
}

function isValidNameWord(w: string): boolean {
  const cleaned = w.replace(/[,.;:]+$/g, "");
  if (!/^[A-Za-zÀ-ÿ]{2,}$/.test(cleaned)) return false;
  if (isForbiddenWord(cleaned)) return false;
  return true;
}

export function calculateNameScore(line: string): number {
  if (!line) return 0;
  if (isLikelyContactLine(line)) return 0;
  const key = normKey(line);
  if (BLOCKED_NAME_LINES.has(key)) return 0;

  const cleaned = cleanNameLine(line);
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return 0;

  for (const w of words) {
    const bare = w.replace(/[,.;:]+$/g, "");
    if (!/^[A-Za-zÀ-ÿ]{2,}$/.test(bare)) return 0;
    if (isForbiddenWord(bare)) return 0;
  }

  let score = 10;
  const bare = words.map((w) => w.replace(/[,.;:]+$/g, ""));
  const allTitle = bare.every((w) => /^[A-ZÀ-Ý][a-zà-ÿ]+$/.test(w));
  const allUpper = bare.every((w) => w === w.toUpperCase());
  if (allTitle || allUpper) score += 5;
  if (words.length >= 2 && words.length <= 4) score += 2;
  return score;
}

/** Detecta nome quebrado em 2-3 linhas consecutivas no topo. */
function extractMultilineName(lines: string[]): { name: string; scoreBonus: number } | null {
  const scan = lines.slice(0, 15);
  for (let i = 0; i < scan.length; i++) {
    const group: string[] = [];
    for (let j = i; j < Math.min(i + 3, scan.length); j++) {
      const raw = scan[j].trim();
      if (!raw) break;
      if (isLikelyContactLine(raw)) break;
      if (BLOCKED_NAME_LINES.has(normKey(raw))) break;
      const words = raw.split(/\s+/).filter(Boolean);
      if (words.length < 1 || words.length > 2) break;
      let ok = true;
      for (const w of words) {
        if (!isValidNameWord(w)) { ok = false; break; }
        // exige título ou maiúsculo
        const bare = w.replace(/[,.;:]+$/g, "");
        if (!/^[A-ZÀ-Ý]/.test(bare)) { ok = false; break; }
      }
      if (!ok) break;
      group.push(raw);
      if (group.length >= 2) {
        const combined = group.join(" ");
        const total = combined.split(/\s+/).length;
        if (total >= 2 && total <= 5) {
          // bônus decresce quanto mais tarde no doc
          const bonus = 20 - i;
          // prefere o maior grupo possível — continua tentando estender
          if (j === Math.min(i + 3, scan.length) - 1) {
            return { name: combined, scoreBonus: bonus };
          }
        }
      }
    }
    if (group.length >= 2) {
      const combined = group.join(" ");
      return { name: combined, scoreBonus: 20 - i };
    }
  }
  return null;
}

/** Extração por rótulo explícito (prioridade máxima). */
function extractNameByLabel(lines: string[]): string {
  const labels = [
    "dados pessoais e de contato",
    "dados pessoais",
    "nome completo",
    "nome",
  ];
  for (let i = 0; i < lines.length; i++) {
    const key = normKey(lines[i].replace(/[:\-].*$/, ""));
    // "nome: Fulano" mesma linha
    const inline = lines[i].match(/^\s*nome(?:\s+completo)?\s*[:\-]\s*(.+)$/i);
    if (inline) {
      const v = cleanNameLine(inline[1]);
      if (v && v.split(/\s+/).length >= 2) return v;
    }
    if (labels.includes(key)) {
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const next = lines[j].trim();
        if (!next) continue;
        if (isLikelyContactLine(next)) continue;
        if (BLOCKED_NAME_LINES.has(normKey(next))) continue;
        const cleaned = cleanNameLine(next);
        const words = cleaned.split(/\s+/).filter(Boolean);
        if (words.length >= 2 && words.length <= 5 && words.every((w) => isValidNameWord(w))) {
          return cleaned;
        }
      }
    }
  }
  return "";
}

function extractCityByLabel(lines: string[]): string {
  for (const l of lines) {
    const m = l.match(/^\s*cidade\s*[:\-]\s*(.+)$/i);
    if (m) {
      const v = cleanCityLine(m[1]).replace(/[-–/•|].*$/, "").trim();
      if (v) return v;
    }
  }
  return "";
}

function extractUfByLabel(lines: string[]): string {
  for (const l of lines) {
    const m = l.match(/^\s*(?:estado|uf)\s*[:\-]\s*(.+)$/i);
    if (m) {
      const v = m[1].trim();
      const up = v.toUpperCase();
      if (UF_SET.has(up)) return up;
      const key = stripDiacritics(v).toLowerCase();
      if (UF_NAMES[key]) return UF_NAMES[key];
    }
  }
  return "";
}

export function extractName(text: string): string {
  if (!text) return "";
  const lines = normalizeLines(text).slice(0, 60);

  // 1) Rótulo explícito — prioridade máxima
  const byLabel = extractNameByLabel(lines);
  if (byLabel) return byLabel;

  // 2) Heurística single-line + multi-line concorrem por pontuação
  let best = "";
  let bestScore = 0;
  for (let i = 0; i < lines.length; i++) {
    const s = calculateNameScore(lines[i]);
    if (s > 0) {
      // pequeno bônus por posição
      const total = s + Math.max(0, 5 - Math.floor(i / 3));
      if (total > bestScore) {
        bestScore = total;
        best = cleanNameLine(lines[i]);
      }
    }
  }
  const multi = extractMultilineName(lines);
  if (multi) {
    const multiScore = 12 + multi.scoreBonus;
    if (multiScore > bestScore) {
      best = multi.name;
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
  const headerLines = lines.slice(0, headerEnd);
  const headerText = headerLines.join("\n");
  const fullText = lines.join("\n");

  const email = extractEmail(headerText) || extractEmail(fullText);
  const telefone = extractPhone(headerText) || extractPhone(fullText);

  // rótulos explícitos primeiro
  const cidadeLabel = extractCityByLabel(lines);
  const ufLabel = extractUfByLabel(lines);

  const cidade = cidadeLabel || extractCity(headerText) || extractCity(fullText);
  const estado = ufLabel || extractUf(headerText) || extractUf(fullText);
  const nome = extractName(headerText) || extractName(fullText);

  return { nome, telefone, email, cidade, estado };
}
