// Validação determinística de cidade+UF usando a base oficial IBGE (bundle estático).
// Sem chamadas externas.
import ibgeData from "@/data/ibge-municipios.json";

interface IbgeEntry { id: string; n: string; k: string; uf: string }

const IBGE: IbgeEntry[] = ibgeData as IbgeEntry[];

// Índice cidade_normalizada|UF -> entrada
const byKeyUf = new Map<string, IbgeEntry>();
// Índice cidade_normalizada -> entradas (para tentativa sem UF)
const byKey = new Map<string, IbgeEntry[]>();
for (const m of IBGE) {
  byKeyUf.set(`${m.k}|${m.uf}`, m);
  const arr = byKey.get(m.k);
  if (arr) arr.push(m); else byKey.set(m.k, [m]);
}

const UF_SET = new Set(IBGE.map((m) => m.uf));

const UF_NAMES: Record<string, string> = {
  "acre":"AC","alagoas":"AL","amapa":"AP","amazonas":"AM","bahia":"BA",
  "ceara":"CE","distrito federal":"DF","espirito santo":"ES","goias":"GO",
  "maranhao":"MA","mato grosso":"MT","mato grosso do sul":"MS","minas gerais":"MG",
  "para":"PA","paraiba":"PB","parana":"PR","pernambuco":"PE","piaui":"PI",
  "rio de janeiro":"RJ","rio grande do norte":"RN","rio grande do sul":"RS",
  "rondonia":"RO","roraima":"RR","santa catarina":"SC","sao paulo":"SP",
  "sergipe":"SE","tocantins":"TO",
};

function strip(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const ADDRESS_TOKENS = /^(rua|r\.|av|av\.|avenida|alameda|al\.|travessa|tv\.|rodovia|rod\.|praca|praça|estrada|est\.|via|viela|beco|largo|servidao|servidão|quadra|q\.|lote|lt\.|apto|apt\.|apartamento|bloco|bl\.|sala|casa|cs|edif|edifício|edificio|cep|n[oº]?\.?)$/i;

function normalizeUf(input: string | null | undefined): string {
  if (!input) return "";
  const s = input.trim();
  const up = s.toUpperCase();
  if (up.length === 2 && UF_SET.has(up)) return up;
  const named = UF_NAMES[strip(s)];
  return named || "";
}

/**
 * Limpa o texto bruto extraído, removendo endereço/CEP/número, e retorna
 * o candidato mais provável a "cidade" (último trecho antes da UF).
 */
export function cleanCityText(raw: string): string {
  if (!raw) return "";
  let s = raw.replace(/\r/g, " ").replace(/\n/g, " ");
  // remove CEP
  s = s.replace(/\bCEP\s*\d{5}-?\d{3}\b/gi, " ");
  s = s.replace(/\b\d{5}-?\d{3}\b/g, " ");
  // remove ", Brasil"
  s = s.replace(/,\s*bra[sz]il\s*$/i, "");
  // "(3,5 Km da vaga)"
  s = s.replace(/\(\s*\d+[,.]?\d*\s*Km[^)]*\)/gi, " ");
  s = s.replace(/\s{2,}/g, " ").trim();

  // Padrões prioritários: "Cidade - UF", "Cidade/UF", "Cidade, UF"
  const sepMatch = s.match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.\-]{1,80})\s*[-–\/,]\s*([A-Z]{2})\b/);
  if (sepMatch && UF_SET.has(sepMatch[2])) {
    let cityPart = sepMatch[1].trim();
    // Se tem vírgulas (endereço completo), pega o último trecho antes da UF
    if (cityPart.includes(",")) {
      const tail = cityPart.split(",").map((p) => p.trim()).filter(Boolean).pop() || "";
      cityPart = tail;
    }
    // Remove tokens de endereço no início do trecho
    const tokens = cityPart.split(/\s+/).filter((t) => !ADDRESS_TOKENS.test(t) && !/^\d+$/.test(t));
    // corta em número (ex: "Rua X 205 Várzea Paulista" -> pega após o último número)
    return tokens.join(" ").trim();
  }

  // Sem separador: pega a última parte antes de vírgula
  if (s.includes(",")) {
    return s.split(",").map((p) => p.trim()).filter(Boolean).pop() || s.trim();
  }
  return s.trim();
}

export interface CityValidationResult {
  cidade: string | null;
  estado: string | null;
  codigo_ibge: string | null;
  cidade_validada: boolean;
  cidade_original_extraida: string | null;
}

/**
 * Valida cidade+UF contra o cadastro oficial IBGE.
 * - Prioridade 1: match direto cidade+UF
 * - Prioridade 2: match sem UF quando existe apenas um município com esse nome
 */
export function validateCity(cidadeBruta: string | null | undefined, estadoBruto: string | null | undefined): CityValidationResult {
  const originalRaw = (cidadeBruta ?? "").trim();
  const original = originalRaw || null;
  if (!originalRaw) {
    return { cidade: null, estado: normalizeUf(estadoBruto) || null, codigo_ibge: null, cidade_validada: false, cidade_original_extraida: null };
  }

  const cleaned = cleanCityText(originalRaw);
  const key = strip(cleaned);
  const uf = normalizeUf(estadoBruto);

  if (key && uf) {
    const hit = byKeyUf.get(`${key}|${uf}`);
    if (hit) {
      return { cidade: hit.n, estado: hit.uf, codigo_ibge: hit.id, cidade_validada: true, cidade_original_extraida: null };
    }
  }
  if (key) {
    const matches = byKey.get(key);
    if (matches && matches.length === 1) {
      const hit = matches[0];
      return { cidade: hit.n, estado: hit.uf, codigo_ibge: hit.id, cidade_validada: true, cidade_original_extraida: null };
    }
  }

  return {
    cidade: null,
    estado: uf || null,
    codigo_ibge: null,
    cidade_validada: false,
    cidade_original_extraida: original,
  };
}

export type OrigemCurriculo = "LINKEDIN" | "PANDAPE" | "INDICACAO" | "SITE" | "OUTROS";
export const ORIGEM_VALUES: OrigemCurriculo[] = ["LINKEDIN", "PANDAPE", "INDICACAO", "SITE", "OUTROS"];
export const ORIGEM_LABELS: Record<OrigemCurriculo, string> = {
  LINKEDIN: "LinkedIn",
  PANDAPE: "Pandapé",
  INDICACAO: "Indicação",
  SITE: "Site",
  OUTROS: "Outros",
};

export function normalizeOrigem(v: string | null | undefined): OrigemCurriculo {
  const up = (v || "").toUpperCase();
  return (ORIGEM_VALUES as string[]).includes(up) ? (up as OrigemCurriculo) : "OUTROS";
}
