import { useEffect } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CandidatoRow } from "@/lib/auth";

export interface ProfileLite {
  id: string;
  nome: string;
}

export interface LatestStatusChange {
  candidato_id: string;
  changed_by_nome: string | null;
  created_at: string;
}

export interface CandidatosFilters {
  nome?: string;
  telefone?: string;
  email?: string;
  vaga?: string;
  status?: string[];
  recrutadores?: string[];
  estados?: string[];
  cidades?: string[];
  origens?: string[];
  dateFrom?: string;
  dateTo?: string;
  entrevistaData?: string;
  entrevistadores?: string[];
  entrevistaQuando?: "" | "hoje" | "semana";
  obs?: "" | "com" | "sem";
  obsSort?: "none" | "asc" | "desc";
  todayStr?: string;
  weekStart?: string;
  weekEnd?: string;
}

export const ATS_QUERY_KEYS = {
  candidatos: ["candidatos"] as const,
  candidatosOptions: ["candidatos-options"] as const,
  profilesLite: ["profiles-lite"] as const,
  latestStatusChanges: ["latest-status-changes"] as const,
};

const CANDIDATOS_SELECT = [
  "id","nome","telefone","cidade","estado","regiao","vaga","email","experiencias","observacoes","observacoes_updated_at","observacoes_updated_by","observacoes_updated_by_nome","status","curriculo_url","recrutador_id","created_at","data_entrevista","horario_entrevista","entrevistador","ultimo_reprocessamento_at","origem_curriculo","cidade_validada","codigo_ibge","cidade_original_extraida",
].join(",");

export interface CandidatosPage { candidatos: CandidatoRow[]; total: number; }

function escapeIlike(s: string) {
  return s.replace(/[%_]/g, (m) => `\\${m}`);
}

type SupaQuery = ReturnType<ReturnType<typeof supabase.from>["select"]>;

function applyFilters(qb: SupaQuery, f: CandidatosFilters): SupaQuery {
  let q = qb;
  if (f.status?.length) q = q.in("status", f.status);
  if (f.recrutadores?.length) q = q.in("recrutador_id", f.recrutadores);
  if (f.estados?.length) q = q.in("estado", f.estados);
  if (f.cidades?.length) q = q.in("cidade", f.cidades);
  if (f.dateFrom) q = q.gte("created_at", `${f.dateFrom}T00:00:00`);
  if (f.dateTo) q = q.lte("created_at", `${f.dateTo}T23:59:59`);
  if (f.entrevistaData) q = q.eq("data_entrevista", f.entrevistaData);
  if (f.entrevistadores?.length) q = q.in("entrevistador", f.entrevistadores);
  if (f.entrevistaQuando === "hoje" && f.todayStr) {
    q = q.eq("data_entrevista", f.todayStr);
  } else if (f.entrevistaQuando === "semana" && f.weekStart && f.weekEnd) {
    q = q.gte("data_entrevista", f.weekStart).lte("data_entrevista", f.weekEnd);
  }
  if (f.obs === "com") {
    q = q.not("observacoes", "is", null).neq("observacoes", "");
  } else if (f.obs === "sem") {
    q = q.or("observacoes.is.null,observacoes.eq.");
  }
  if (f.nome?.trim()) q = q.ilike("nome", `%${escapeIlike(f.nome.trim())}%`);
  if (f.telefone?.trim()) q = q.ilike("telefone", `%${escapeIlike(f.telefone.trim())}%`);
  if (f.email?.trim()) q = q.ilike("email", `%${escapeIlike(f.email.trim())}%`);
  if (f.vaga?.trim()) q = q.ilike("vaga", `%${escapeIlike(f.vaga.trim())}%`);
  return q;
}

async function fetchCandidatos(page: number, pageSize: number, filters: CandidatosFilters): Promise<CandidatosPage> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let qb = supabase.from("candidatos").select(CANDIDATOS_SELECT, { count: "exact" });
  qb = applyFilters(qb, filters);
  if (filters.obsSort && filters.obsSort !== "none") {
    qb = qb.order("observacoes", { ascending: filters.obsSort === "asc", nullsFirst: false });
  } else {
    qb = qb.order("created_at", { ascending: false });
  }
  qb = qb.range(from, to);
  const { data, error, count } = await qb;
  if (error) throw error;
  return { candidatos: ((data ?? []) as unknown) as CandidatoRow[], total: count ?? 0 };
}

async function fetchProfilesLite() {
  const { data, error } = await supabase.from("profiles").select("id,nome");
  if (error) throw error;
  return (data ?? []) as ProfileLite[];
}

export interface CandidatosOptions { cidades: string[]; entrevistadores: string[]; }

async function fetchCandidatosOptions(): Promise<CandidatosOptions> {
  const { data, error } = await supabase.from("candidatos").select("cidade,entrevistador").limit(50000);
  if (error) throw error;
  const cidades = new Set<string>();
  const ents = new Set<string>();
  for (const r of (data ?? []) as { cidade: string | null; entrevistador: string | null }[]) {
    const c = (r.cidade || "").trim(); if (c) cidades.add(c);
    const e = (r.entrevistador || "").trim(); if (e) ents.add(e);
  }
  return {
    cidades: [...cidades].sort((a, b) => a.localeCompare(b, "pt-BR")),
    entrevistadores: [...ents].sort((a, b) => a.localeCompare(b, "pt-BR")),
  };
}

export function useCandidatosQuery(page: number, pageSize: number, filters: CandidatosFilters) {
  return useQuery({
    queryKey: [...ATS_QUERY_KEYS.candidatos, page, pageSize, filters],
    queryFn: () => fetchCandidatos(page, pageSize, filters),
    placeholderData: keepPreviousData,
    staleTime: 30000,
    gcTime: 10 * 60000,
    refetchOnWindowFocus: false,
  });
}

export function useCandidatosOptionsQuery() {
  return useQuery({
    queryKey: ATS_QUERY_KEYS.candidatosOptions,
    queryFn: fetchCandidatosOptions,
    staleTime: 5 * 60000,
    gcTime: 30 * 60000,
    refetchOnWindowFocus: false,
  });
}

export function useProfilesLiteQuery() {
  return useQuery({ queryKey: ATS_QUERY_KEYS.profilesLite, queryFn: fetchProfilesLite, staleTime: 10 * 60000, gcTime: 30 * 60000, refetchOnWindowFocus: false });
}

export function useLatestStatusChangesQuery() {
  return useQuery({ queryKey: ATS_QUERY_KEYS.latestStatusChanges, queryFn: async () => {
    const { data, error } = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: LatestStatusChange[] | null; error: unknown }> } } } })
      .from("candidato_status_log").select("candidato_id,changed_by_nome,created_at").order("created_at", { ascending: false }).limit(2000);
    if (error) throw error;
    const map = new Map<string, LatestStatusChange>();
    for (const row of data ?? []) if (!map.has(row.candidato_id)) map.set(row.candidato_id, row);
    return map;
  }, staleTime: 30000, gcTime: 10 * 60000, refetchOnWindowFocus: false });
}

export function useCandidatosRealtime() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase.channel("candidatos-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "candidatos" }, () => {
        void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.candidatos });
        void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.candidatosOptions });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "candidato_status_log" }, () => { void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.latestStatusChanges }); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [queryClient]);
}

export function invalidateAtsQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.candidatos });
  void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.candidatosOptions });
  void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.profilesLite });
  void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.latestStatusChanges });
}
