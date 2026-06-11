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

export const ATS_QUERY_KEYS = {
  candidatos: ["candidatos"] as const,
  profilesLite: ["profiles-lite"] as const,
  latestStatusChanges: ["latest-status-changes"] as const,
};

const CANDIDATOS_SELECT = [
  "id",
  "nome",
  "telefone",
  "cidade",
  "estado",
  "regiao",

  "vaga",
  "email",
  "experiencias",
  "observacoes",
  "observacoes_updated_at",
  "observacoes_updated_by",
  "observacoes_updated_by_nome",
  "status",
  "curriculo_url",
  "recrutador_id",
  "created_at",
  "data_entrevista",
  "horario_entrevista",
  "entrevistador",
  "ultimo_reprocessamento_at",
].join(",");

export interface CandidatosPage {
  candidatos: CandidatoRow[];
  total: number;
}

async function fetchCandidatos(page: number, pageSize: number): Promise<CandidatosPage> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await supabase
    .from("candidatos")
    .select(CANDIDATOS_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;
  return {
    candidatos: ((data ?? []) as unknown) as CandidatoRow[],
    total: count ?? 0,
  };
}

async function fetchProfilesLite() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,nome");

  if (error) throw error;
  return (data ?? []) as ProfileLite[];
}

export function useCandidatosQuery(page: number, pageSize: number) {
  return useQuery({
    queryKey: [...ATS_QUERY_KEYS.candidatos, page, pageSize],
    queryFn: () => fetchCandidatos(page, pageSize),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useProfilesLiteQuery() {
  return useQuery({
    queryKey: ATS_QUERY_KEYS.profilesLite,
    queryFn: fetchProfilesLite,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useLatestStatusChangesQuery() {
  return useQuery({
    queryKey: ATS_QUERY_KEYS.latestStatusChanges,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            order: (c: string, o: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: LatestStatusChange[] | null; error: unknown }>;
            };
          };
        };
      })
        .from("candidato_status_log")
        .select("candidato_id,changed_by_nome,created_at")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const map = new Map<string, LatestStatusChange>();
      for (const row of data ?? []) {
        if (!map.has(row.candidato_id)) map.set(row.candidato_id, row);
      }
      return map;
    },
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useCandidatosRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("candidatos-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "candidatos" }, () => {
        void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.candidatos });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "candidato_status_log" }, () => {
        void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.latestStatusChanges });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

export function invalidateAtsQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.candidatos });
  void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.profilesLite });
  void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.latestStatusChanges });
}
