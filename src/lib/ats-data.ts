import { useEffect } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CandidatoRow } from "@/lib/auth";
import { getIbgeCodesForUnits } from "@/lib/nearest-unit";

export interface ProfileLite { id: string; nome: string; ativo?: boolean; }
export interface AgendamentoProfile { id: string; nome: string; }
export interface LatestStatusChange { candidato_id: string; changed_by_nome: string | null; created_at: string; }

export interface CandidatosFilters {
  nome?: string; telefone?: string; email?: string; vaga?: string; status?: string[]; recrutadores?: string[]; estados?: string[]; cidades?: string[]; origens?: string[]; unidades?: string[]; dateFrom?: string; dateTo?: string; entrevistaData?: string; entrevistadores?: string[]; entrevistaQuando?: "" | "hoje" | "semana"; dadosFaltantes?: string[]; obs?: "" | "com" | "sem"; obsSort?: "none" | "asc" | "desc"; todayStr?: string; weekStart?: string; weekEnd?: string;
}

export interface AgendamentosFilters { dateFrom?: string; dateTo?: string; recrutadores?: string[]; origens?: string[]; vaga?: string; }

export const ATS_QUERY_KEYS = {
  candidatos: ["candidatos"] as const,
  candidatosOptions: ["candidatos-options"] as const,
  profilesLite: ["profiles-lite"] as const,
  agendamentoProfiles: ["agendamento-profiles"] as const,
  latestStatusChanges: ["latest-status-changes"] as const,
  dashboard: ["dashboard-candidatos"] as const,
  agendamentos: ["agendamentos"] as const,
};

const CANDIDATOS_SELECT = [
  "id","nome","telefone","cidade","estado","regiao","vaga","email","experiencias","observacoes","observacoes_updated_at","observacoes_updated_by","observacoes_updated_by_nome","status","curriculo_url","recrutador_id","created_at","data_entrevista","horario_entrevista","entrevistador","agendado_por_id","agendado_por_nome","agendado_em","ultimo_reprocessamento_at","origem_curriculo","cidade_validada","codigo_ibge","cidade_original_extraida",
].join(",");

export interface CandidatosPage { candidatos: CandidatoRow[]; total: number; }
function escapeIlike(s: string) { return s.replace(/[%_]/g, (m) => `\\${m}`); }
type SupaQuery = ReturnType<ReturnType<typeof supabase.from>["select"]>;
function applyFilters(qb: SupaQuery, f: CandidatosFilters): SupaQuery {
  let q = qb;
  if (f.status?.length) q = q.in("status", f.status);
  if (f.recrutadores?.length) q = q.in("recrutador_id", f.recrutadores);
  if (f.estados?.length) q = q.in("estado", f.estados);
  if (f.cidades?.length) q = q.in("cidade", f.cidades);
  if (f.origens?.length) q = q.in("origem_curriculo", f.origens);
  if (f.unidades?.length) { const codes = getIbgeCodesForUnits(f.unidades); q = q.in("codigo_ibge", codes.length ? codes : ["__none__"]); }
  if (f.dateFrom) q = q.gte("created_at", `${f.dateFrom}T00:00:00`);
  if (f.dateTo) q = q.lte("created_at", `${f.dateTo}T23:59:59`);
  if (f.entrevistaData) q = q.eq("data_entrevista", f.entrevistaData);
  if (f.entrevistadores?.length) q = q.in("entrevistador", f.entrevistadores);
  if (f.entrevistaQuando === "hoje" && f.todayStr) q = q.eq("data_entrevista", f.todayStr);
  else if (f.entrevistaQuando === "semana" && f.weekStart && f.weekEnd) q = q.gte("data_entrevista", f.weekStart).lte("data_entrevista", f.weekEnd);
  if (f.obs === "com") q = q.not("observacoes", "is", null).neq("observacoes", "");
  else if (f.obs === "sem") q = q.or("observacoes.is.null,observacoes.eq.");
  if (f.nome?.trim()) q = q.ilike("nome", `%${escapeIlike(f.nome.trim())}%`);
  if (f.telefone?.trim()) q = q.ilike("telefone", `%${escapeIlike(f.telefone.trim())}%`);
  if (f.email?.trim()) q = q.ilike("email", `%${escapeIlike(f.email.trim())}%`);
  if (f.vaga?.trim()) q = q.ilike("vaga", `%${escapeIlike(f.vaga.trim())}%`);
  return q;
}

async function fetchCandidatos(page: number, pageSize: number, filters: CandidatosFilters): Promise<CandidatosPage> {
  const from = (page - 1) * pageSize, to = from + pageSize - 1;
  let qb = supabase.from("candidatos").select(CANDIDATOS_SELECT, { count: "exact" });
  qb = applyFilters(qb, filters);
  if (filters.obsSort && filters.obsSort !== "none") qb = qb.order("observacoes", { ascending: filters.obsSort === "asc", nullsFirst: false }); else qb = qb.order("created_at", { ascending: false });
  if (filters.dadosFaltantes?.length) { const m = new Set(filters.dadosFaltantes); const c: string[] = []; if (m.has("cidade")) c.push("cidade.is.null", "cidade.eq."); if (m.has("uf")) c.push("estado.is.null", "estado.eq."); if (m.has("telefone")) c.push("telefone.is.null", "telefone.eq."); if (c.length) qb = qb.or(c.join(",")); }
  qb = qb.range(from, to);
  const { data, error, count } = await qb; if (error) throw error;
  return { candidatos: ((data ?? []) as unknown) as CandidatoRow[], total: count ?? 0 };
}

const DASHBOARD_SELECT = "id,nome,status,estado,cidade,vaga,origem_curriculo,recrutador_id,created_at,updated_at,data_entrevista,entrevistador";
const DASHBOARD_CHUNK = 1000;
export interface DashboardRow { id:string; nome:string; status:string; estado:string|null; cidade:string|null; vaga:string|null; origem_curriculo:string; recrutador_id:string|null; created_at:string; updated_at:string|null; data_entrevista:string|null; entrevistador:string|null; }
export async function fetchAllCandidatos(filters:CandidatosFilters):Promise<DashboardRow[]> { const all:DashboardRow[]=[]; for(let page=0;;page++){ const from=page*DASHBOARD_CHUNK; let qb=supabase.from("candidatos").select(DASHBOARD_SELECT); qb=applyFilters(qb,filters); qb=qb.order("created_at",{ascending:false}).range(from,from+DASHBOARD_CHUNK-1); const {data,error}=await qb; if(error)throw error; const chunk=((data??[]) as unknown) as DashboardRow[]; all.push(...chunk); if(chunk.length<DASHBOARD_CHUNK)break; if(page>500)break;} return all; }
export function useDashboardCandidatosQuery(filters:CandidatosFilters){ return useQuery({queryKey:[...ATS_QUERY_KEYS.dashboard,filters],queryFn:()=>fetchAllCandidatos(filters),placeholderData:keepPreviousData,staleTime:30000,gcTime:10*60000,refetchOnWindowFocus:false}); }

export interface AgendamentoRow { id:string; nome:string; telefone:string|null; cidade:string|null; estado:string|null; vaga:string|null; origem_curriculo:string; recrutador_id:string|null; data_entrevista:string|null; horario_entrevista:string|null; agendado_por_id:string|null; agendado_por_nome:string|null; agendado_em:string|null; entrevistador:string|null; }
const AGENDAMENTOS_SELECT = "id,nome,telefone,cidade,estado,vaga,origem_curriculo,recrutador_id,data_entrevista,horario_entrevista,agendado_por_id,agendado_por_nome,agendado_em,entrevistador";
export async function fetchAgendamentos(filters:AgendamentosFilters = {}):Promise<AgendamentoRow[]> { const all:AgendamentoRow[]=[]; for(let page=0;;page++){ const from=page*DASHBOARD_CHUNK; let q=supabase.from("candidatos").select(AGENDAMENTOS_SELECT).eq("status","agendado"); if(filters.dateFrom)q=q.gte("data_entrevista",filters.dateFrom); if(filters.dateTo)q=q.lte("data_entrevista",filters.dateTo); if(filters.recrutadores?.length)q=q.in("recrutador_id",filters.recrutadores); if(filters.origens?.length)q=q.in("origem_curriculo",filters.origens); if(filters.vaga?.trim())q=q.ilike("vaga",`%${escapeIlike(filters.vaga.trim())}%`); const {data,error}=await q.order("data_entrevista",{ascending:true,nullsFirst:false}).order("horario_entrevista",{ascending:true,nullsFirst:false}).range(from,from+DASHBOARD_CHUNK-1); if(error)throw error; const chunk=((data??[]) as unknown) as AgendamentoRow[]; all.push(...chunk); if(chunk.length<DASHBOARD_CHUNK)break; if(page>500)break;} return all; }
export function useAgendamentosQuery(filters:AgendamentosFilters = {}){ return useQuery({queryKey:[...ATS_QUERY_KEYS.agendamentos,filters],queryFn:()=>fetchAgendamentos(filters),placeholderData:keepPreviousData,staleTime:15000,gcTime:10*60000,refetchOnWindowFocus:false}); }

async function fetchProfilesLite(){ const {data,error}=await supabase.from("profiles").select("id,nome,ativo"); if(error)throw error; return (data??[]) as ProfileLite[]; }
async function fetchAgendamentoProfiles():Promise<AgendamentoProfile[]>{ const {data:roles,error}=await supabase.from("user_roles").select("user_id").eq("role","agendamento"); if(error)throw error; const ids=(roles??[]).map(r=>(r as {user_id:string}).user_id); if(!ids.length)return[]; const {data:profs,error:e2}=await supabase.from("profiles").select("id,nome,ativo").in("id",ids).eq("ativo",true); if(e2)throw e2; return ((profs??[]) as {id:string;nome:string}[]).map(p=>({id:p.id,nome:p.nome})).sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR")); }
export function useAgendamentoProfilesQuery(){ return useQuery({queryKey:ATS_QUERY_KEYS.agendamentoProfiles,queryFn:fetchAgendamentoProfiles,staleTime:10*60000,gcTime:30*60000,refetchOnWindowFocus:false}); }
export interface CidadeOption { value:string; label:string }
export interface CandidatosOptions { cidades:CidadeOption[]; entrevistadores:string[] }
async function fetchCandidatosOptions():Promise<CandidatosOptions>{ const {data,error}=await supabase.from("candidatos").select("cidade,estado,codigo_ibge,cidade_validada,entrevistador").eq("cidade_validada",true).not("cidade","is",null).not("estado","is",null).not("codigo_ibge","is",null).limit(50000); if(error)throw error; const {data:ents}=await supabase.from("candidatos").select("entrevistador").not("entrevistador","is",null).limit(50000); const cidadesMap=new Map<string,CidadeOption>(); for(const r of (data??[]) as {cidade:string|null;estado:string|null}[]){const c=(r.cidade||"").trim(),uf=(r.estado||"").trim(); if(c&&uf)cidadesMap.set(c,{value:c,label:`${c} - ${uf}`});} const entSet=new Set<string>(); for(const r of (ents??[]) as {entrevistador:string|null}[]){const e=(r.entrevistador||"").trim(); if(e)entSet.add(e);} return {cidades:[...cidadesMap.values()].sort((a,b)=>a.label.localeCompare(b.label,"pt-BR")), entrevistadores:[...entSet].sort((a,b)=>a.localeCompare(b,"pt-BR"))}; }
export function useCandidatosQuery(page:number,pageSize:number,filters:CandidatosFilters){return useQuery({queryKey:[...ATS_QUERY_KEYS.candidatos,page,pageSize,filters],queryFn:()=>fetchCandidatos(page,pageSize,filters),placeholderData:keepPreviousData,staleTime:30000,gcTime:10*60000,refetchOnWindowFocus:false});}
export function useCandidatosOptionsQuery(){return useQuery({queryKey:ATS_QUERY_KEYS.candidatosOptions,queryFn:fetchCandidatosOptions,staleTime:5*60000,gcTime:30*60000,refetchOnWindowFocus:false});}
export function useProfilesLiteQuery(){return useQuery({queryKey:ATS_QUERY_KEYS.profilesLite,queryFn:fetchProfilesLite,staleTime:10*60000,gcTime:30*60000,refetchOnWindowFocus:false});}
export function useLatestStatusChangesQuery(candidatoIds:string[]){const idsKey=[...candidatoIds].sort().join(","); return useQuery({queryKey:[...ATS_QUERY_KEYS.latestStatusChanges,idsKey],enabled:candidatoIds.length>0,queryFn:async()=>{const {data,error}=await(supabase as unknown as {from:(t:string)=>{select:(s:string)=>{in:(c:string,ids:string[])=>{order:(c:string,o:{ascending:boolean})=>{limit:(n:number)=>Promise<{data:LatestStatusChange[]|null;error:unknown}>}}}}}}).from("candidato_status_log").select("candidato_id,changed_by_nome,created_at").in("candidato_id",candidatoIds).order("created_at",{ascending:false}).limit(500);if(error)throw error;const map=new Map<string,LatestStatusChange>();for(const row of data??[])if(!map.has(row.candidato_id))map.set(row.candidato_id,row);return map;},staleTime:30000,gcTime:10*60000,refetchOnWindowFocus:false});}
export function useCandidatosRealtime(){const queryClient=useQueryClient();useEffect(()=>{let timer:ReturnType<typeof setTimeout>|null=null;const schedule=()=>{if(timer)clearTimeout(timer);timer=setTimeout(()=>{timer=null;void queryClient.invalidateQueries({queryKey:ATS_QUERY_KEYS.candidatos});void queryClient.invalidateQueries({queryKey:ATS_QUERY_KEYS.candidatosOptions});void queryClient.invalidateQueries({queryKey:ATS_QUERY_KEYS.dashboard});void queryClient.invalidateQueries({queryKey:ATS_QUERY_KEYS.latestStatusChanges});void queryClient.invalidateQueries({queryKey:ATS_QUERY_KEYS.agendamentos});},500);};const channel=supabase.channel("candidatos-live").on("postgres_changes",{event:"*",schema:"public",table:"candidatos"},schedule).on("postgres_changes",{event:"*",schema:"public",table:"candidato_status_log"},schedule).subscribe();return()=>{if(timer)clearTimeout(timer);void supabase.removeChannel(channel);};},[queryClient]);}
export function invalidateAtsQueries(queryClient:ReturnType<typeof useQueryClient>){void queryClient.invalidateQueries({queryKey:ATS_QUERY_KEYS.candidatos});void queryClient.invalidateQueries({queryKey:ATS_QUERY_KEYS.candidatosOptions});void queryClient.invalidateQueries({queryKey:ATS_QUERY_KEYS.profilesLite});void queryClient.invalidateQueries({queryKey:ATS_QUERY_KEYS.latestStatusChanges});void queryClient.invalidateQueries({queryKey:ATS_QUERY_KEYS.dashboard});void queryClient.invalidateQueries({queryKey:ATS_QUERY_KEYS.agendamentos});}
