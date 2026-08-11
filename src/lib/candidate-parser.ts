// Parser determinístico de identidade de candidato.
// Prioriza contexto de localização para evitar confundir UFs/cidades de empregos,
// cursos e outras partes do currículo.

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
  acre:"AC", alagoas:"AL", amapa:"AP", amapá:"AP", amazonas:"AM", bahia:"BA",
  ceara:"CE", ceará:"CE", "distrito federal":"DF", "espirito santo":"ES", "espírito santo":"ES",
  goias:"GO", goiás:"GO", maranhao:"MA", maranhão:"MA", "mato grosso":"MT", "mato grosso do sul":"MS",
  "minas gerais":"MG", para:"PA", pará:"PA", paraiba:"PB", paraíba:"PB", parana:"PR", paraná:"PR",
  pernambuco:"PE", piaui:"PI", piauí:"PI", "rio de janeiro":"RJ", "rio grande do norte":"RN",
  "rio grande do sul":"RS", rondonia:"RO", rondônia:"RO", roraima:"RR", "santa catarina":"SC",
  "sao paulo":"SP", "são paulo":"SP", sergipe:"SE", tocantins:"TO",
};

const FORBIDDEN_NAME_WORDS = new Set([
  "curriculo","currículo","curriculum","vitae","cv","dados","pessoais","contato","telefone","celular",
  "email","linkedin","github","portfolio","portfólio","objetivo","resumo","perfil","experiencia","experiência",
  "formacao","formação","educacao","educação","habilidades","competencias","competências","idiomas","cursos",
  "empresa","empresas","cargo","cargos","referencias","referências","brasil","brazil","grupo","villela",
  "vendedor","vendedora","gerente","consultor","consultora","assistente","analista","estagiario","estagiária",
  "coordenador","coordenadora","supervisor","supervisora","diretor","diretora","auxiliar","operador","operadora",
  "tecnico","técnico","engenheiro","engenheira","desenvolvedor","desenvolvedora","programador",
  // Cabeçalhos comuns em currículos exportados do LinkedIn (em inglês).
  "contact","summary","languages","skills","top","profile","about","education","experience","objective",
]);

const BLOCKED_NAME_LINES = new Set([
  "grupo villela","adequacao com ia","adequacao da ia a vaga","impressao cv - pandape","impressao cv pandape",
  "status da vaga","vaga atual","top skills",
]);

function isBlockedNameLine(value: string): boolean {
  const key = normKey(value);
  if (BLOCKED_NAME_LINES.has(key)) return true;
  // Cobre variações com texto extra na mesma linha, ex.: "Status da vaga: Aguardando contato".
  for (const blocked of BLOCKED_NAME_LINES) {
    if (key.startsWith(`${blocked} `) || key.startsWith(`${blocked}:`)) return true;
  }
  return false;
}

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normKey(s: string): string {
  return stripDiacritics(s).toLowerCase().replace(/\s+/g, " ").trim();
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s-])([a-zà-ÿ])/g, (_, sep, c) => sep + c.toUpperCase());
}

export function normalizeLines(text: string): string[] {
  if (!text) return [];
  return text.replace(/\r/g, "").split("\n").flatMap((raw) => {
    const line = raw.trim();
    if (!line) return [];
    // PDFs de 2 colunas costumam inserir 4+ espaços entre os blocos.
    return /\s{4,}/.test(line) ? line.split(/\s{4,}/).map((x) => x.trim()).filter(Boolean) : [line];
  });
}

// -------- EMAIL --------
export function extractEmail(text: string): string {
  const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0].toLowerCase() : "";
}

// -------- TELEFONE --------
export function extractPhone(text: string): string {
  if (!text) return "";
  const cleaned = text.replace(/\b\d{5}-?\d{3}\b/g, " ").replace(/\b(?:19|20)\d{2}\b/g, " ");
  const patterns = [
    /(?:\+?55[\s.-]?)?\(?([0-9]{2})\)?[\s.-]?([9][0-9]{4})[\s.-]?([0-9]{4})/g,
    /(?:\+?55[\s.-]?)?\(?([0-9]{2})\)?[\s.-]?([0-9]{4})[\s.-]?([0-9]{4})/g,
  ];
  for (const re of patterns) {
    const m = re.exec(cleaned);
    if (!m) continue;
    const digits = `${m[1]}${m[2]}${m[3]}`;
    if (digits.length === 10 || digits.length === 11) return digits;
  }
  return "";
}

// -------- LOCALIZAÇÃO --------
function cleanLocationText(value: string): string {
  return value
    .replace(/\b(?:CEP\s*)?\d{5}-?\d{3}\b/gi, " ")
    .replace(/\(\s*\d+[,.]?\d*\s*km[^)]*\)/gi, " ")
    .replace(/,?\s*(?:brasil|brazil)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,;|]+|[,;|.]+$/g, "")
    .trim();
}

function normalizeUf(value: string): string {
  const raw = cleanLocationText(value);
  const up = raw.toUpperCase();
  if (UF_SET.has(up)) return up;
  return UF_NAMES[normKey(raw)] || "";
}

function isAddressToken(value: string): boolean {
  return /^(rua|r\.?|avenida|av\.?|alameda|al\.?|travessa|tv\.?|rodovia|rod\.?|estrada|est\.?|praça|praca|largo|viela|beco|quadra|q\.?|lote|lt\.?|n[ºo]?\.?|numero|número)$/i.test(value);
}

function looksLikeCity(value: string): boolean {
  const s = cleanLocationText(value);
  if (s.length < 3 || s.length > 80) return false;
  if (/\d/.test(s)) return false;
  if (/https?:\/\//i.test(s) || /@/.test(s)) return false;
  if (/\b(?:rua|avenida|av\.?|alameda|travessa|rodovia|estrada)\b/i.test(s)) return false;
  return /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' .-]*$/.test(s);
}

function cityFromLocationLine(raw: string): { cidade: string; estado: string } | null {
  let line = cleanLocationText(raw);
  if (!line) return null;

  // Remove rótulos que já foram reconhecidos, sem destruir o restante.
  line = line.replace(/^\s*(?:cidade|localiza[cç][aã]o|resid[eê]ncia|residente em|endere[cç]o)\s*[:\-]?\s*/i, "");

  // 1) Formatos explícitos: Cidade/UF, Cidade - UF, Cidade, UF, Cidade | UF.
  const pair = line.match(/(.+?)\s*(?:\/|\||-|–|—|,)\s*([A-Za-zÀ-ÿ]{2,30})\s*$/);
  if (pair) {
    const uf = normalizeUf(pair[2]);
    if (uf) {
      let cityPart = pair[1].trim();
      // Endereço completo: "Rua X, 123, Porto Alegre" -> último trecho não numérico.
      const pieces = cityPart.split(",").map((p) => p.trim()).filter(Boolean);
      if (pieces.length > 1) {
        const last = pieces[pieces.length - 1];
        if (looksLikeCity(last)) cityPart = last;
      }
      cityPart = cityPart.replace(/^.*?\b(?:apto|apartamento|casa|bloco|sala)\b[^,]*,\s*/i, "");
      const cityWords = cityPart.split(/\s+/).filter((w) => !isAddressToken(w) && !/^\d+$/.test(w));
      cityPart = cityWords.join(" ").trim();
      if (looksLikeCity(cityPart)) return { cidade: cityPart, estado: uf };
    }
  }

  // 2) Formato "Cidade, Estado por extenso".
  const fullState = line.match(/(.+?)\s*,\s*([A-Za-zÀ-ÿ ]{3,40})\s*$/);
  if (fullState) {
    const uf = normalizeUf(fullState[2]);
    if (uf && looksLikeCity(fullState[1])) return { cidade: fullState[1].trim(), estado: uf };
  }

  // 3) "Rua X, número, Cidade" sem UF. Usamos o último trecho plausível.
  if (line.includes(",")) {
    const parts = line.split(",").map((p) => p.trim()).filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (looksLikeCity(parts[i])) return { cidade: parts[i], estado: "" };
    }
  }

  // 4) "Cidade - Estado" ou "Cidade Estado" em linhas curtas.
  const tokens = line.split(/\s+/);
  if (tokens.length <= 8) {
    for (let i = tokens.length - 1; i >= 1; i--) {
      const uf = normalizeUf(tokens.slice(i).join(" "));
      if (uf) {
        const city = tokens.slice(0, i).join(" ").replace(/[,;]+$/, "").trim();
        if (looksLikeCity(city)) return { cidade: city, estado: uf };
      }
    }
  }

  return null;
}

/**
 * Extrai a cidade priorizando linhas de localização e pares cidade/UF.
 * Não usa a primeira UF isolada do currículo, pois ela pode pertencer a
 * emprego, faculdade, vaga ou outra informação sem relação com residência.
 */
export function extractCity(text: string): string {
  if (!text) return "";
  const lines = normalizeLines(text);

  // Rótulos explícitos têm prioridade máxima.
  for (const line of lines) {
    const m = line.match(/^\s*(?:cidade|localiza[cç][aã]o|resid[eê]ncia|residente em)\s*[:\-]\s*(.+)$/i);
    if (m) {
      const parsed = cityFromLocationLine(m[1]);
      if (parsed?.cidade) return parsed.cidade;
      const raw = cleanLocationText(m[1]);
      if (looksLikeCity(raw)) return raw;
    }
  }

  // Linhas que explicitamente parecem endereço/localização.
  for (const line of lines) {
    if (/\b(?:endere[cç]o|resid[eê]ncia|residente em|localiza[cç][aã]o|moro em)\b/i.test(line)) {
      const parsed = cityFromLocationLine(line);
      if (parsed?.cidade) return parsed.cidade;
    }
  }

  // Primeiro procura pares cidade/UF no bloco inicial do currículo.
  for (const line of lines.slice(0, 45)) {
    const parsed = cityFromLocationLine(line);
    if (parsed?.cidade && parsed.estado) return parsed.cidade;
  }

  // Depois procura cidade/UF no documento inteiro.
  for (const line of lines) {
    const parsed = cityFromLocationLine(line);
    if (parsed?.cidade && parsed.estado) return parsed.cidade;
  }

  // Último recurso: linha curta que seja apenas uma cidade conhecida pelo
  // padrão textual. A validação IBGE posterior decide se ela é inequívoca.
  for (const line of lines.slice(0, 45)) {
    const clean = cleanLocationText(line);
    if (looksLikeCity(clean) && !FORBIDDEN_NAME_WORDS.has(normKey(clean))) {
      if (/^s[aã]o paulo$/i.test(clean) || /^rio de janeiro$/i.test(clean) || /^belo horizonte$/i.test(clean)) return clean;
    }
  }

  return "";
}

export function extractUf(text: string): string {
  if (!text) return "";
  const lines = normalizeLines(text);

  // Rótulos explícitos.
  for (const line of lines) {
    const m = line.match(/^\s*(?:estado|uf)\s*[:\-]\s*(.+)$/i);
    if (m) {
      const uf = normalizeUf(m[1]);
      if (uf) return uf;
    }
  }

  // UF sempre pareada a uma cidade/localização. Isso evita pegar a UF de uma
  // empresa, faculdade ou vaga que apareça antes do endereço residencial.
  for (const line of lines.slice(0, 60)) {
    const parsed = cityFromLocationLine(line);
    if (parsed?.estado) return parsed.estado;
  }
  for (const line of lines) {
    const parsed = cityFromLocationLine(line);
    if (parsed?.estado) return parsed.estado;
  }

  // Nome de estado por extenso só quando a linha inteira é o estado.
  for (const line of lines.slice(0, 60)) {
    const uf = normalizeUf(line);
    if (uf && normKey(line) in UF_NAMES) return uf;
  }
  return "";
}

// -------- NOME --------
function cleanName(value: string): string {
  return value.trim().replace(/[,.;:|]+$/g, "").replace(/,?\s*\d{1,3}\s*$/, "").trim();
}

function isValidName(value: string): boolean {
  const s = cleanName(value);
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  if (s.includes("@") || /\d/.test(s) || /https?:\/\//i.test(s)) return false;
  if (isBlockedNameLine(s)) return false;
  return words.every((w) => {
    const k = normKey(w);
    return /^[A-Za-zÀ-ÿ'-]{2,}$/.test(w) && !FORBIDDEN_NAME_WORDS.has(k);
  });
}

export function calculateNameScore(line: string): number {
  const s = cleanName(line);
  if (!isValidName(s)) return 0;
  let score = 10;
  const words = s.split(/\s+/);
  if (words.every((w) => w === w.toUpperCase()) || words.every((w) => /^[A-ZÀ-Ý]/.test(w))) score += 5;
  return score;
}

// Conectores comuns em nomes compostos em português. Quando um PDF (ex.:
// export do LinkedIn) quebra o nome em duas linhas por falta de espaço, a
// primeira linha costuma terminar em um desses conectores.
const NAME_CONNECTORS = new Set(["de", "da", "do", "dos", "das", "e"]);

/**
 * Junta duas linhas quando tudo indica que são a mesma linha de nome
 * quebrada pelo layout do PDF: a primeira termina em conector ("de", "da"...)
 * e a segunda é uma única palavra capitalizada (o sobrenome que continua).
 */
function mergeBrokenNameLines(lines: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    if (next) {
      const words = line.split(/\s+/).filter(Boolean);
      const lastWord = words[words.length - 1];
      const nextWords = next.split(/\s+/).filter(Boolean);
      if (
        words.length >= 2 &&
        words.length <= 4 &&
        lastWord &&
        NAME_CONNECTORS.has(normKey(lastWord)) &&
        nextWords.length === 1 &&
        /^[A-ZÀ-Ý][a-zà-ÿ'-]+$/.test(nextWords[0]) &&
        !FORBIDDEN_NAME_WORDS.has(normKey(nextWords[0]))
      ) {
        result.push(`${line} ${next}`);
        i++; // já consumiu a linha seguinte
        continue;
      }
    }
    result.push(line);
  }
  return result;
}

export function extractName(text: string): string {
  if (!text) return "";
  const lines = mergeBrokenNameLines(normalizeLines(text).slice(0, 60));

  for (const line of lines) {
    const m = line.match(/^\s*nome(?:\s+completo)?\s*[:\-]\s*(.+)$/i);
    if (m && isValidName(m[1])) return cleanName(m[1]);
  }

  let best = "";
  let bestScore = 0;
  lines.forEach((line, index) => {
    let score = calculateNameScore(line) + Math.max(0, 6 - Math.floor(index / 5));
    // Sinal forte: em currículos de LinkedIn, o nome vem imediatamente
    // seguido pela linha "Cargo | Especialidade | ...".
    if (score > 0 && lines[index + 1] && /\|/.test(lines[index + 1])) score += 8;
    if (score > bestScore) {
      bestScore = score;
      best = cleanName(line);
    }
  });
  return best;
}

const HEADER_KEYWORDS = [
  "experiencia","experiência","formacao","formação","educacao","educação","habilidades","competencias",
  "competências","idiomas","objetivo","resumo","cursos","atividades","perfil profissional",
];

export function findHeaderEnd(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const k = normKey(lines[i]);
    if (HEADER_KEYWORDS.some((kw) => k === kw || k.startsWith(`${kw} `))) return i;
  }
  return Math.min(lines.length, 50);
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
