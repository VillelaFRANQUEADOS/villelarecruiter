import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const ATS_QUERY_KEYS = {
  candidatos: ["candidatos"] as const,
  candidatosOptions: ["candidatos-options"] as const,
  profilesLite: ["profiles-lite"] as const,
  latestStatusChanges: ["latest-status-changes"] as const,
  dashboard: ["dashboard"] as const,
  agendamentos: ["agendamentos"] as const,
};

type CandidatoStatus = "aguardando_contato" | "aguardando_retorno" | "sem_interesse" | "agendado";

export interface CandidatoRow {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  cidade: string | null;
  estado: string | null;
  unidade_nome: string | null;
  entrevistador: string | null;
  vaga: string | null;
  origem_curriculo: string | null;
  observacoes: string | null;
  curriculo_url: string | null;
  recrutador_id: string | null;
  status: CandidatoStatus;
  data_entrevista: string | null;
  hora_entrevista: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileLite { id: string; nome: string; ativo: boolean; }
export interface LatestStatusChange { candidato_id: string; changed_by_nome: string | null; created_at: string; }
export interface DashboardRow extends CandidatoRow {}
export interface CandidatosFilters {
  status?: string[];
  estados?: string[];
  cidades?: string[];
  origens?: string[];
  unidade?: string[];
  recrutadores?: string[];
  entrevistador?: string[];
  vaga?: string;
  dateFrom?: string;
  dateTo?: string;
  entrevistaQuando?: string;
}

export interface CidadeOption { value: string; label: string }
export interface CandidatosOptions { cidades: CidadeOption[]; entrevistadores: string[] }

async function fetchCandidatos(page: number, pageSize: number, filters: CandidatosFilters): Promise<{ data: CandidatoRow[]; count: number }> {
  let q = supabase.from("candidatos").select("*", { count: "exact" });
  if (filters.status?.length) q = q.in("status", filters.status as CandidatoStatus[]);
  if (filters.estados?.length) q = q.in("estado", filters.estados);
  if (filters.cidades?.length) q = q.in("cidade", filters.cidades);
  if (filters.origens?.length) q = q.in("origem_curriculo", filters.origens);
  if (filters.recrutadores?.length) q = q.in("recrutador_id", filters.recrutadores);
  if (filters.entrevistador?.length) q = q.in("entrevistador", filters.entrevistador);
  if (filters.vaga?.trim()) q = q.ilike("vaga", `%${filters.vaga.trim()}%`);
  if (filters.dateFrom) q = q.gte("created_at", `${filters.dateFrom}T00:00:00`);
  if (filters.dateTo) q = q.lt("created_at", `${filters.dateTo}T23:59:59.999`);
  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await q.order("created_at", { ascending: false }).range(from, to);
  if (error) throw error;
  return { data: (data ?? []) as CandidatoRow[], count: count ?? 0 };
}

async function fetchProfilesLite() {
  const { data, error } = await supabase.from("profiles").select("id,nome,ativo");
  if (error) throw error;
  return (data ?? []) as ProfileLite[];
}

async function fetchAgendamentoProfiles(): Promise<{ id: string; nome: string }[]> {
  const { data: roles, error } = await supabase.from("user_roles").select("user_id").eq("role", "agendamento");
  if (error) throw error;
  const ids = (roles ?? []).map((r) => r.user_id);
  if (!ids.length) return [];
  const { data: profs, error: e2 } = await supabase.from("profiles").select("id,nome,ativo").in("id", ids).eq("ativo", true);
  if (e2) throw e2;
  return (profs ?? []).map((p) => ({ id: p.id, nome: p.nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function useAgendamentoProfilesQuery() {
  return useQuery({ queryKey: ATS_QUERY_KEYS.agendamentos, queryFn: fetchAgendamentoProfiles, staleTime: 10 * 60000, gcTime: 30 * 60000, refetchOnWindowFocus: false });
}

async function fetchCandidatosOptions(): Promise<CandidatosOptions> {
  const { data, error } = await supabase.from("candidatos").select("cidade,estado,codigo_ibge,cidade_validada,entrevistador").eq("cidade_validada", true).not("cidade", "is", null).not("estado", "is", null).not("codigo_ibge", "is", null).limit(50000);
  if (error) throw error;
  const { data: ents } = await supabase.from("candidatos").select("entrevistador").not("entrevistador", "is", null).limit(50000);
  const cidadesMap = new Map<string, CidadeOption>();
  for (const r of (data ?? []) as { cidade: string | null; estado: string | null }[]) {
    const c = (r.cidade || "").trim(), uf = (r.estado || "").trim();
    if (c && uf) cidadesMap.set(c, { value: c, label: `${c} - ${uf}` });
  }
  const entSet = new Set<string>();
  for (const r of (ents ?? []) as { entrevistador: string | null }[]) {
    const e = (r.entrevistador || "").trim();
    if (e) entSet.add(e);
  }
  return {
    cidades: [...cidadesMap.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    entrevistadores: [...entSet].sort((a, b) => a.localeCompare(b, "pt-BR")),
  };
}

export function useCandidatosQuery(page: number, pageSize: number, filters: CandidatosFilters) {
  return useQuery({ queryKey: [...ATS_QUERY_KEYS.candidatos, page, pageSize, filters], queryFn: () => fetchCandidatos(page, pageSize, filters), placeholderData: keepPreviousData, staleTime: 30000, gcTime: 10 * 60000, refetchOnWindowFocus: false });
}
export function useCandidatosOptionsQuery() {
  return useQuery({ queryKey: ATS_QUERY_KEYS.candidatosOptions, queryFn: fetchCandidatosOptions, staleTime: 5 * 60000, gcTime: 30 * 60000, refetchOnWindowFocus: false });
}
export function useProfilesLiteQuery() {
  return useQuery({ queryKey: ATS_QUERY_KEYS.profilesLite, queryFn: fetchProfilesLite, staleTime: 10 * 60000, gcTime: 30 * 60000, refetchOnWindowFocus: false });
}

export function useLatestStatusChangesQuery(candidatoIds: string[]) {
  const idsKey = [...candidatoIds].sort().join(",");
  return useQuery({
    queryKey: [...ATS_QUERY_KEYS.latestStatusChanges, idsKey],
    enabled: candidatoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as {
        from: (table: "candidato_status_log") => {
          select: (columns: string) => {
            in: (column: "candidato_id", ids: string[]) => {
              order: (column: "created_at", options: { ascending: boolean }) => {
                limit: (count: number) => Promise<{ data: LatestStatusChange[] | null; error: unknown }>;
              };
            };
          };
        };
      })
        .from("candidato_status_log")
        .select("candidato_id,changed_by_nome,created_at")
        .in("candidato_id", candidatoIds)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const map = new Map<string, LatestStatusChange>();
      for (const row of data ?? []) if (!map.has(row.candidato_id)) map.set(row.candidato_id, row);
      return map;
    },
    staleTime: 30000,
    gcTime: 10 * 60000,
    refetchOnWindowFocus: false,
  });
}

export async function fetchDashboardCandidatos(filters: CandidatosFilters): Promise<DashboardRow[]> {
  let q = supabase.from("candidatos").select("*");
  if (filters.status?.length) q = q.in("status", filters.status as CandidatoStatus[]);
  if (filters.estados?.length) q = q.in("estado", filters.estados);
  if (filters.cidades?.length) q = q.in("cidade", filters.cidades);
  if (filters.origens?.length) q = q.in("origem_curriculo", filters.origens);
  if (filters.recrutadores?.length) q = q.in("recrutador_id", filters.recrutadores);
  if (filters.vaga?.trim()) q = q.ilike("vaga", `%${filters.vaga.trim()}%`);
  if (filters.dateFrom) q = q.gte("created_at", `${filters.dateFrom}T00:00:00`);
  if (filters.dateTo) q = q.lt("created_at", `${filters.dateTo}T23:59:59.999`);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(50000);
  if (error) throw error;
  return (data ?? []) as DashboardRow[];
}

export function useDashboardCandidatosQuery(filters: CandidatosFilters) {
  return useQuery({ queryKey: [...ATS_QUERY_KEYS.dashboard, filters], queryFn: () => fetchDashboardCandidatos(filters), staleTime: 30000, gcTime: 10 * 60000, refetchOnWindowFocus: false });
}

export function useCandidatosRealtime() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.candidatos });
        void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.candidatosOptions });
        void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.dashboard });
        void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.latestStatusChanges });
        void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.agendamentos });
      }, 500);
    };
    const channel = supabase
      .channel("candidatos-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "candidatos" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "candidato_status_log" }, schedule)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

export function invalidateAtsQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.candidatos });
  void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.candidatosOptions });
  void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.profilesLite });
  void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.latestStatusChanges });
  void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.dashboard });
  void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.agendamentos });
}
