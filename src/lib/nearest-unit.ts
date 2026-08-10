// Calcula a unidade Grupo Villela mais próxima de um candidato, usando
// distância real (fórmula de Haversine) entre as coordenadas do município
// do candidato (via código IBGE) e as coordenadas de cada unidade.
import unidadesData from "@/data/unidades-villela.json";
import municipiosCoords from "@/data/municipios-coordenadas.json";
import { validateCity } from "@/lib/city-validation";

export interface Unidade {
  nome: string;
  lat: number;
  lon: number;
  endereco?: string | null;
}

// Fonte oficial das unidades: tabela `unidades` no backend (carregada em runtime
// via setUnidades). O JSON local segue apenas como fallback inicial.
let UNIDADES: Unidade[] = unidadesData as Unidade[];
const MUNICIPIOS_COORDS: Record<string, number[]> = municipiosCoords as Record<string, number[]>;

/** Substitui a base de unidades em memória (chamada após carregar do backend). */
export function setUnidades(list: Unidade[]) {
  UNIDADES = list;
  cache.clear();
  unitToIbgeIndex = null;
}

export function getUnidadeByNome(nome: string): Unidade | undefined {
  return UNIDADES.find((u) => u.nome === nome);
}


const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export interface NearestUnitResult {
  nome: string;
  distanciaKm: number;
  endereco?: string | null;
}

// Cache simples em memória: mesma cidade/UF/ibge não recalcula toda vez.
const cache = new Map<string, NearestUnitResult | null>();

/**
 * Retorna a unidade Villela mais próxima do candidato, com a distância em km.
 * Prioriza o código IBGE já validado; se ausente, tenta validar cidade+UF na hora.
 * Retorna null quando não é possível localizar as coordenadas do município.
 */
export function getNearestUnit(
  cidade: string | null | undefined,
  estado: string | null | undefined,
  codigoIbge?: string | null,
): NearestUnitResult | null {
  const cacheKey = `${codigoIbge || ""}|${cidade || ""}|${estado || ""}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  let ibge = codigoIbge || null;
  if (!ibge && cidade) {
    const v = validateCity(cidade, estado);
    ibge = v.codigo_ibge;
  }

  let result: NearestUnitResult | null = null;
  if (ibge) {
    const coords = MUNICIPIOS_COORDS[ibge];
    if (coords && coords.length === 2) {
      const [lat, lon] = coords;
      for (const u of UNIDADES) {
        const d = haversineKm(lat, lon, u.lat, u.lon);
        if (!result || d < result.distanciaKm) {
          result = { nome: u.nome, distanciaKm: d, endereco: u.endereco ?? null };
        }
      }
    }
  }

  cache.set(cacheKey, result);
  return result;
}

export function formatDistanciaKm(km: number): string {
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

// ---------------------------------------------------------------------------
// Índice reverso: para cada unidade Villela, quais códigos IBGE de município
// têm ELA como a mais próxima. Usado para filtrar candidatos no servidor
// (Supabase) por "unidade mais próxima" sem precisar de coluna no banco.
// Calculado uma única vez (memoizado) a partir de todos os municípios do
// arquivo municipios-coordenadas.json (~5.500 municípios x 39 unidades).
// ---------------------------------------------------------------------------
let unitToIbgeIndex: Map<string, string[]> | null = null;

function buildUnitToIbgeIndex(): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const nome of UNIDADES.map((u) => u.nome)) index.set(nome, []);

  for (const ibge of Object.keys(MUNICIPIOS_COORDS)) {
    const coords = MUNICIPIOS_COORDS[ibge];
    if (!coords || coords.length !== 2) continue;
    const [lat, lon] = coords;
    let nearest: { nome: string; d: number } | null = null;
    for (const u of UNIDADES) {
      const d = haversineKm(lat, lon, u.lat, u.lon);
      if (!nearest || d < nearest.d) nearest = { nome: u.nome, d };
    }
    if (nearest) index.get(nearest.nome)?.push(ibge);
  }
  return index;
}

/** Lista de nomes de todas as unidades Villela (para opções de filtro). */
export function getAllUnitNames(): string[] {
  return UNIDADES.map((u) => u.nome).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/**
 * Dado um conjunto de nomes de unidades selecionadas no filtro, retorna a
 * lista combinada de códigos IBGE dos municípios cuja unidade mais próxima
 * é uma delas. Usar com `.in("codigo_ibge", codigos)` no Supabase.
 */
export function getIbgeCodesForUnits(unitNames: string[]): string[] {
  if (!unitNames.length) return [];
  if (!unitToIbgeIndex) unitToIbgeIndex = buildUnitToIbgeIndex();
  const out: string[] = [];
  for (const nome of unitNames) {
    const codes = unitToIbgeIndex.get(nome);
    if (codes) out.push(...codes);
  }
  return out;
}
