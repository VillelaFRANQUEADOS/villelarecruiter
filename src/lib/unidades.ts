import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setUnidades } from "@/lib/nearest-unit";

export interface UnidadeRow {
  id: string;
  nome: string;
  cidade: string;
  estado: string;
  endereco: string | null;
  latitude: number;
  longitude: number;
  ativa: boolean;
}

export const UNIDADES_QUERY_KEY = ["unidades"] as const;

type SupabaseResult<T> = Promise<{ data: T | null; error: unknown }>;

type AnyClient = {
  from: (t: string) => {
    select: (s: string) => {
      order: (c: string) => SupabaseResult<UnidadeRow[]>;
    };
    update: (payload: object) => {
      eq: (c: string, v: string) => SupabaseResult<null>;
    };
    insert: (payload: object | object[]) => SupabaseResult<null>;
  };
};

export async function fetchUnidades(): Promise<UnidadeRow[]> {
  const { data, error } = await (supabase as unknown as AnyClient)
    .from("unidades")
    .select("id,nome,cidade,estado,endereco,latitude,longitude,ativa")
    .order("nome");
  if (error) throw error;
  return (data ?? []).map((u: UnidadeRow) => ({
    ...u,
    latitude: Number(u.latitude),
    longitude: Number(u.longitude),
  }));
}

/**
 * Carrega as unidades do backend uma única vez por sessão e alimenta o
 * cálculo de "unidade mais próxima" (apenas unidades ativas participam).
 */
export function useUnidadesSync() {
  const q = useQuery({
    queryKey: UNIDADES_QUERY_KEY,
    queryFn: fetchUnidades,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!q.data) return;
    setUnidades(
      q.data
        .filter((u) => u.ativa)
        .map((u) => ({ nome: u.nome, lat: u.latitude, lon: u.longitude, endereco: u.endereco })),
    );
  }, [q.data]);

  return q;
}

export async function upsertUnidade(u: Partial<UnidadeRow> & { nome: string; cidade: string; estado: string; latitude: number; longitude: number }) {
  const payload = {
    nome: u.nome.trim(),
    cidade: u.cidade.trim(),
    estado: u.estado.trim().toUpperCase(),
    endereco: u.endereco?.trim() || null,
    latitude: u.latitude,
    longitude: u.longitude,
    ativa: u.ativa ?? true,
  };
  const client = supabase as unknown as AnyClient;
  if (u.id) {
    const { error } = await client.from("unidades").update(payload).eq("id", u.id);
    if (error) throw error;
    return;
  }
  const existing = (await fetchUnidades()).find((e) => keyOf(e) === keyOf(payload));
  if (existing) {
    const { error } = await client.from("unidades").update(payload).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await client.from("unidades").insert(payload);
    if (error) throw error;
  }
}

export async function setUnidadeAtiva(id: string, ativa: boolean) {
  const { error } = await (supabase as unknown as AnyClient)
    .from("unidades")
    .update({ ativa })
    .eq("id", id);
  if (error) throw error;
}

export interface CsvUnidade {
  nome: string;
  cidade: string;
  estado: string;
  endereco: string | null;
  latitude: number;
  longitude: number;
  ativa: boolean;
}

/** Parser CSV simples (vírgula, com suporte a aspas duplas). */
export function parseUnidadesCsv(text: string): { rows: CsvUnidade[]; errors: string[] } {
  const errors: string[] = [];
  const rows: CsvUnidade[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { rows, errors: ["Arquivo vazio"] };

  const splitLine = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted;
      } else if (c === "," && !quoted) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const header = splitLine(lines[0]!).map((h) => h.toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const iNome = idx("nome"), iCidade = idx("cidade"), iEstado = idx("estado");
  const iEnd = idx("endereco"), iLat = idx("latitude"), iLon = idx("longitude"), iAtiva = idx("ativa");
  if (iNome < 0 || iCidade < 0 || iEstado < 0 || iLat < 0 || iLon < 0) {
    return { rows, errors: ["Cabeçalho inválido. Use: nome,cidade,estado,endereco,latitude,longitude,ativa"] };
  }

  for (let i = 1; i < lines.length; i++) {
    const c = splitLine(lines[i]!);
    const nome = c[iNome] ?? "";
    const cidade = c[iCidade] ?? "";
    const estado = (c[iEstado] ?? "").toUpperCase();
    const lat = Number((c[iLat] ?? "").replace(",", "."));
    const lon = Number((c[iLon] ?? "").replace(",", "."));
    const problems: string[] = [];
    if (!nome) problems.push("nome");
    if (!cidade) problems.push("cidade");
    if (estado.length !== 2) problems.push("estado");
    if (!Number.isFinite(lat)) problems.push("latitude");
    if (!Number.isFinite(lon)) problems.push("longitude");
    if (problems.length) { errors.push(`Linha ${i + 1}: campos inválidos (${problems.join(", ")})`); continue; }
    const ativaRaw = (c[iAtiva] ?? "true").toLowerCase();
    rows.push({
      nome, cidade, estado,
      endereco: (iEnd >= 0 ? c[iEnd] : "") || null,
      latitude: lat, longitude: lon,
      ativa: !["false", "0", "nao", "não", "inativa"].includes(ativaRaw),
    });
  }
  return { rows, errors };
}

/** Chave de deduplicação: nome + cidade + estado (case-insensitive). */
function keyOf(u: { nome: string; cidade: string; estado: string }) {
  return `${u.nome.trim().toLowerCase()}|${u.cidade.trim().toLowerCase()}|${u.estado.trim().toUpperCase()}`;
}

export async function importUnidades(rows: CsvUnidade[]) {
  const client = supabase as unknown as AnyClient;
  const existing = await fetchUnidades();
  const byKey = new Map(existing.map((e) => [keyOf(e), e.id]));
  const toInsert: CsvUnidade[] = [];
  let updated = 0;
  for (const r of rows) {
    const id = byKey.get(keyOf(r));
    if (id) {
      const { error } = await client.from("unidades").update(r).eq("id", id);
      if (error) throw error;
      updated++;
    } else {
      toInsert.push(r);
    }
  }
  if (toInsert.length) {
    const { error } = await client.from("unidades").insert(toInsert);
    if (error) throw error;
  }
  return { inserted: toInsert.length, updated };
}

export const CSV_TEMPLATE =
  "nome,cidade,estado,endereco,latitude,longitude,ativa\n" +
  "Campinas - SP,Campinas,SP,\"Av. Exemplo, 1234 - Centro\",-22.9533819,-47.0619704,true\n";
