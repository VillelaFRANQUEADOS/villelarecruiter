import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CandidatoRow } from "@/lib/auth";

export interface ProfileLite {
  id: string;
  nome: string;
}

export const ATS_QUERY_KEYS = {
  candidatos: ["candidatos"] as const,
  profilesLite: ["profiles-lite"] as const,
};

const CANDIDATOS_SELECT = [
  "id",
  "nome",
  "telefone",
  "cidade",
  "email",
  "observacoes",
  "status",
  "curriculo_url",
  "recrutador_id",
  "created_at",
].join(",");

async function fetchCandidatos() {
  const { data, error } = await supabase
    .from("candidatos")
    .select(CANDIDATOS_SELECT)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw error;
  return (data ?? []) as CandidatoRow[];
}

async function fetchProfilesLite() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,nome");

  if (error) throw error;
  return (data ?? []) as ProfileLite[];
}

export function useCandidatosQuery() {
  return useQuery({
    queryKey: ATS_QUERY_KEYS.candidatos,
    queryFn: fetchCandidatos,
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

export function useCandidatosRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("candidatos-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "candidatos" }, () => {
        void queryClient.invalidateQueries({ queryKey: ATS_QUERY_KEYS.candidatos });
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
}