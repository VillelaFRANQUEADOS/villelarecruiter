import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCurriculoContent } from "@/lib/curriculos.functions";
import { reprocessCandidato } from "@/lib/cv-parser.functions";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, FileText, Pencil, Trash2, RefreshCw, Plus, Calendar, Clock, User, ArrowUp, ArrowDown, ArrowUpDown, Users, MoreVertical, StickyNote, AlertTriangle } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useAuth, STATUS_LABELS, STATUS_ORDER, STATUS_TONE, UF_LIST,
  type CandidatoRow, type CandidatoStatus,
} from "@/lib/auth";
import { MultiSelect } from "@/components/MultiSelect";
import { ORIGEM_VALUES, ORIGEM_LABELS, normalizeOrigem } from "@/lib/city-validation";

import {
  invalidateAtsQueries,
  useCandidatosQuery,
  useCandidatosOptionsQuery,
  useCandidatosRealtime,
  useLatestStatusChangesQuery,
  useProfilesLiteQuery,
  type CandidatosFilters,
} from "@/lib/ats-data";
import { toast } from "sonner";

const BulkUpload = lazy(async () => import("@/components/BulkUpload").then((mod) => ({ default: mod.BulkUpload })));
const CandidatoEditDialog = lazy(async () => import("@/components/CandidatoEditDialog").then((mod) => ({ default: mod.CandidatoEditDialog })));
const AgendarEntrevistaDialog = lazy(async () => import("@/components/AgendarEntrevistaDialog").then((mod) => ({ default: mod.AgendarEntrevistaDialog })));

function toArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v) return v.split(",").filter(Boolean);
  return [];
}
function toStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export interface CandidatosSearch {
  status: string[];
  estado: string[];
  cidade: string[];
  origem: string[];
  recrutador: string[];
  entrevistador: string[];
  vaga: string;
  dateFrom: string;
  dateTo: string;
  entrevistaQuando: string;
}

export const Route = createFileRoute("/_authenticated/candidatos")({
  validateSearch: (s: Record<string, unknown>): CandidatosSearch => ({
    status: toArr(s.status),
    estado: toArr(s.estado),
    cidade: toArr(s.cidade),
    origem: toArr(s.origem),
    recrutador: toArr(s.recrutador),
    entrevistador: toArr(s.entrevistador),
    vaga: toStr(s.vaga),
    dateFrom: toStr(s.dateFrom),
    dateTo: toStr(s.dateTo),
    entrevistaQuando: toStr(s.entrevistaQuando),
  }),
  component: CandidatosPage,
});

function CandidatosPage() {
  const { role, user } = useAuth();
  const search = Route.useSearch();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const { data: profiles = [] } = useProfilesLiteQuery();
  const { data: latestStatusMap } = useLatestStatusChangesQuery();
  const { data: options } = useCandidatosOptionsQuery();
  const fetchCv = useServerFn(getCurriculoContent);
  const reprocessFn = useServerFn(reprocessCandidato);
  const [reprocessing, setReprocessing] = useState<Set<string>>(new Set());
  const [bulkReprocessing, setBulkReprocessing] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CandidatoRow | null>(null);
  const [fNome, setFNome] = useState("");
  const [fTelefone, setFTelefone] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fVaga, setFVaga] = useState(search.vaga);

  // Filtros multi-select
  const [fStatus, setFStatus] = useState<string[]>(search.status);
  const [fRecrutadores, setFRecrutadores] = useState<string[]>(search.recrutador);
  const [fEstados, setFEstados] = useState<string[]>(search.estado);
  const [fCidades, setFCidades] = useState<string[]>(search.cidade);
  const [fOrigens, setFOrigens] = useState<string[]>(search.origem);

  // Período (created_at) – combinável com os demais
  const [fDateFrom, setFDateFrom] = useState<string>(search.dateFrom);
  const [fDateTo, setFDateTo] = useState<string>(search.dateTo);

  // Filtros de entrevista
  const [fEntrevistaData, setFEntrevistaData] = useState<string>("");
  const [fEntrevistadores, setFEntrevistadores] = useState<string[]>(search.entrevistador);
  const [fEntrevistaQuando, setFEntrevistaQuando] = useState<"" | "hoje" | "semana">(
    search.entrevistaQuando === "hoje" || search.entrevistaQuando === "semana" ? search.entrevistaQuando : "",
  );

  // Sincroniza filtros quando a URL muda (ex.: clique num card do Dashboard).
  const searchKey = JSON.stringify(search);
  useEffect(() => {
    setFStatus(search.status);
    setFRecrutadores(search.recrutador);
    setFEstados(search.estado);
    setFCidades(search.cidade);
    setFOrigens(search.origem);
    setFEntrevistadores(search.entrevistador);
    setFVaga(search.vaga);
    setFDateFrom(search.dateFrom);
    setFDateTo(search.dateTo);
    setFEntrevistaQuando(
      search.entrevistaQuando === "hoje" || search.entrevistaQuando === "semana" ? search.entrevistaQuando : "",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey]);

  // Filtro de observação
  const [fObs, setFObs] = useState<"" | "com" | "sem">("");
  // Ordenação por observação
  const [obsSort, setObsSort] = useState<"none" | "asc" | "desc">("none");

  // Edição inline de observação
  const [editingObsId, setEditingObsId] = useState<string | null>(null);
  const [editingObsValue, setEditingObsValue] = useState<string>("");
  const [savingObsId, setSavingObsId] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [agendarOpen, setAgendarOpen] = useState(false);
  const [agendarTarget, setAgendarTarget] = useState<{
    ids: string[];
    nome: string | null;
    initial?: { data_entrevista: string; horario_entrevista: string; entrevistador: string };
  } | null>(null);
  useCandidatosRealtime();

  const profMap = useMemo(() => new Map(profiles.map(p => [p.id, p.nome])), [profiles]);

  const cidadeOptions = options?.cidades ?? [];
  const entrevistadorOptions = options?.entrevistadores ?? [];

  // Janela hoje / semana (segunda a domingo, horário local)
  const { weekStart, weekEnd, todayStr } = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = today.getDay(); // 0=dom
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const ws = new Date(today); ws.setDate(today.getDate() + diffToMonday);
    const we = new Date(ws); we.setDate(ws.getDate() + 6);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { weekStart: fmt(ws), weekEnd: fmt(we), todayStr: fmt(today) };
  }, []);

  // Debounce dos filtros de texto para evitar consulta a cada tecla.
  const [debNome, setDebNome] = useState(fNome);
  const [debTelefone, setDebTelefone] = useState(fTelefone);
  const [debEmail, setDebEmail] = useState(fEmail);
  const [debVaga, setDebVaga] = useState(fVaga);
  useEffect(() => { const t = setTimeout(() => setDebNome(fNome), 300); return () => clearTimeout(t); }, [fNome]);
  useEffect(() => { const t = setTimeout(() => setDebTelefone(fTelefone), 300); return () => clearTimeout(t); }, [fTelefone]);
  useEffect(() => { const t = setTimeout(() => setDebEmail(fEmail), 300); return () => clearTimeout(t); }, [fEmail]);
  useEffect(() => { const t = setTimeout(() => setDebVaga(fVaga), 300); return () => clearTimeout(t); }, [fVaga]);

  const filters: CandidatosFilters = useMemo(() => ({
    nome: debNome,
    telefone: debTelefone,
    email: debEmail,
    vaga: debVaga,
    status: fStatus,
    recrutadores: fRecrutadores,
    estados: fEstados,
    cidades: fCidades,
    origens: fOrigens,
    dateFrom: fDateFrom,
    dateTo: fDateTo,
    entrevistaData: fEntrevistaData,
    entrevistadores: fEntrevistadores,
    entrevistaQuando: fEntrevistaQuando,
    obs: fObs,
    obsSort,
    todayStr,
    weekStart,
    weekEnd,
  }), [debNome, debTelefone, debEmail, debVaga, fStatus, fRecrutadores, fEstados, fCidades, fOrigens, fDateFrom, fDateTo, fEntrevistaData, fEntrevistadores, fEntrevistaQuando, fObs, obsSort, todayStr, weekStart, weekEnd]);

  const { data: candidatosPage, isFetching } = useCandidatosQuery(page, pageSize, filters);
  const rows = useMemo(() => candidatosPage?.candidatos ?? [], [candidatosPage]);
  const total = candidatosPage?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Voltar para a página 1 sempre que filtros, ordenação ou tamanho mudarem.
  useEffect(() => { setPage(1); }, [filters, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const filtered = rows;

  const hasFilters =
    !!(fNome || fTelefone || fEmail || fVaga || fDateFrom || fDateTo || fEntrevistaData || fEntrevistaQuando || fObs) ||
    fStatus.length > 0 || fRecrutadores.length > 0 || fEstados.length > 0 || fCidades.length > 0 ||
    fEntrevistadores.length > 0 || fOrigens.length > 0;


  function clearFilters() {
    setFNome(""); setFTelefone(""); setFEmail(""); setFVaga("");
    setFStatus([]); setFRecrutadores([]); setFEstados([]); setFCidades([]); setFOrigens([]);
    setFDateFrom(""); setFDateTo("");
    setFEntrevistaData(""); setFEntrevistadores([]); setFEntrevistaQuando("");
    setFObs("");
  }

  async function saveObservacao(id: string, value: string) {
    setSavingObsId(id);
    const newVal = value.trim() ? value : null;
    const { error } = await supabase.from("candidatos").update({ observacoes: newVal }).eq("id", id);
    setSavingObsId(null);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Observação atualizada");
setEditingObsId(null);
    }
  }



  async function handleDelete(id: string) {
    if (!confirm("Excluir este candidato?")) return;
    const { error } = await supabase.from("candidatos").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Excluído");
      invalidateAtsQueries(queryClient);
    }
  }

  async function handleDeleteAll() {
    const txt = prompt(`Excluir TODOS os ${total} candidatos? Digite EXCLUIR para confirmar.`);
    if (txt !== "EXCLUIR") return;
    const { error } = await supabase.from("candidatos").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) toast.error(error.message);
    else {
      toast.success("Todos os candidatos foram excluídos");
      setSelected(new Set());
      invalidateAtsQueries(queryClient);
    }
  }

  async function openCurriculo(ref: string) {
    const toastId = toast.loading("Abrindo currículo...");
    try {
      let url: string;
      let revokeAfterMs = 5 * 60_000;
      if (ref.startsWith("drive:")) {
        const fileId = ref.slice(6);
        const { base64, mimeType } = await fetchCv({ data: { fileId } });
        // Decodificação eficiente sem loop char-a-char
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: mimeType });
        url = URL.createObjectURL(blob);
      } else {
        // legado: storage Lovable Cloud
        const { data, error } = await supabase.storage.from("curriculos").createSignedUrl(ref, 300);
        if (error) throw error;
        url = data.signedUrl;
        revokeAfterMs = 0;
      }
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        toast.error("Bloqueado pelo navegador. Permita pop-ups para visualizar o currículo.", { id: toastId });
        return;
      }
      toast.success("Currículo aberto", { id: toastId });
      if (revokeAfterMs > 0) setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao abrir currículo", { id: toastId });
    }
  }

  async function handleReprocess(id: string) {
    if (reprocessing.has(id)) return;
    setReprocessing((s) => new Set(s).add(id));
    const toastId = toast.loading("Reprocessando currículo (análise profunda)...");
    try {
      const res = await reprocessFn({ data: { candidatoId: id } });
      const n = res.updatedFields.length;
      if (n > 0) {
        toast.success(`Reprocessado: ${n} campo(s) preenchido(s) (${res.updatedFields.join(", ")})`, { id: toastId });
      } else {
        toast.success("Reprocessado. Nenhum campo vazio para preencher.", { id: toastId });
      }
      invalidateAtsQueries(queryClient);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao reprocessar", { id: toastId });
    } finally {
      setReprocessing((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }

  async function handleBulkReprocess() {
    if (bulkReprocessing) return;
    const ids = Array.from(selected);
    if (!ids.length) return;
    const ok = window.confirm(`Reprocessar ${ids.length} currículo(s) com IA? Isso pode levar alguns minutos e consumir créditos.`);
    if (!ok) return;
    setBulkReprocessing(true);
    const toastId = toast.loading(`Reprocessando 0/${ids.length}...`);
    let done = 0, updated = 0, failed = 0;
    const CONCURRENCY = 2;
    let idx = 0;
    async function worker() {
      while (idx < ids.length) {
        const i = idx++;
        const id = ids[i];
        setReprocessing((s) => new Set(s).add(id));
        try {
          const res = await reprocessFn({ data: { candidatoId: id } });
          if (res.updatedFields.length > 0) updated++;
        } catch {
          failed++;
        } finally {
          setReprocessing((s) => { const n = new Set(s); n.delete(id); return n; });
          done++;
          toast.loading(`Reprocessando ${done}/${ids.length}...`, { id: toastId });
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
    invalidateAtsQueries(queryClient);
    setBulkReprocessing(false);
    if (failed === 0) {
      toast.success(`Reprocessamento concluído: ${updated} candidato(s) atualizado(s) de ${ids.length}.`, { id: toastId });
    } else {
      toast.error(`Concluído com ${failed} erro(s). ${updated} atualizado(s) de ${ids.length}.`, { id: toastId });
    }
  }


  async function changeStatus(id: string, status: CandidatoStatus) {
    if (status === "agendado") {
      const row = rows.find((r) => r.id === id) ?? null;
      setAgendarTarget({ ids: [id], nome: row?.nome ?? null, initial: row ? {
        data_entrevista: row.data_entrevista ?? "",
        horario_entrevista: row.horario_entrevista ?? "",
        entrevistador: row.entrevistador ?? "",
      } : undefined });
      setAgendarOpen(true);
      return;
    }
    const { error } = await supabase.from("candidatos").update({
      status,
      data_entrevista: null,
      horario_entrevista: null,
      entrevistador: null,
    }).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function bulkChange(status: CandidatoStatus) {
    if (!selected.size) return;
    const ids = [...selected];
    if (status === "agendado") {
      setAgendarTarget({ ids, nome: ids.length === 1 ? rows.find((r) => r.id === ids[0])?.nome ?? null : `${ids.length} candidatos` });
      setAgendarOpen(true);
      return;
    }
    const { error } = await supabase.from("candidatos").update({
      status,
      data_entrevista: null,
      horario_entrevista: null,
      entrevistador: null,
    }).in("id", ids);
    if (error) toast.error(error.message);
    else { toast.success(`${ids.length} candidato(s) movidos`); setSelected(new Set()); }
  }

  async function confirmAgendamento(data: { data_entrevista: string; horario_entrevista: string; entrevistador: string }) {
    if (!agendarTarget) return;
    const { error } = await supabase.from("candidatos").update({
      status: "agendado",
      data_entrevista: data.data_entrevista,
      horario_entrevista: data.horario_entrevista,
      entrevistador: data.entrevistador,
    }).in("id", agendarTarget.ids);
    if (error) { toast.error(error.message); return; }
    toast.success(agendarTarget.ids.length > 1 ? `${agendarTarget.ids.length} candidato(s) agendados` : "Entrevista agendada");
    if (agendarTarget.ids.length > 1) setSelected(new Set());
    setAgendarTarget(null);
  }

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  return (
    <div className="p-4 lg:p-8 max-w-[1400px] mx-auto">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 mb-6 sm:flex sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Candidatos</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
              <Users className="size-3" />
              {total} no total
            </span>
            <span className="text-xs">Exibindo {filtered.length}{hasFilters ? " (filtrado)" : ""}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {role === "admin" && total > 0 && (
            <Button size="sm" variant="outline" className="h-9 text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive" onClick={handleDeleteAll}>
              <Trash2 className="size-4 mr-1.5" /> Excluir todos
            </Button>
          )}
          <Button size="sm" className="h-9 px-4 shadow-sm" onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="size-4 mr-1.5" /> Novo candidato
          </Button>
        </div>
      </header>

      <Card className="p-5 mb-6 rounded-2xl shadow-sm">
        <Suspense fallback={<div className="h-36 rounded-2xl border border-dashed bg-accent/20 animate-pulse" />}>
          <BulkUpload onCreated={() => invalidateAtsQueries(queryClient)} />
        </Suspense>
      </Card>

      <Card className="p-4 mb-5 space-y-3 rounded-2xl shadow-sm">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input className="pl-9 h-9 bg-background" placeholder="Nome" value={fNome} onChange={(e) => setFNome(e.target.value)} />
          </div>
          <Input className="h-9" placeholder="Telefone" value={fTelefone} onChange={(e) => setFTelefone(e.target.value)} />
          <Input className="h-9" placeholder="Email" value={fEmail} onChange={(e) => setFEmail(e.target.value)} />
          <Input className="h-9" placeholder="Vaga" value={fVaga} onChange={(e) => setFVaga(e.target.value)} />
          <MultiSelect
            className="w-full"
            placeholder="Status"
            value={fStatus}
            onChange={setFStatus}
            options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
            searchable={false}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <MultiSelect
            className="w-56"
            placeholder="Recrutadores"
            value={fRecrutadores}
            onChange={setFRecrutadores}
            options={profiles.map((p) => ({ value: p.id, label: p.nome }))}
          />
          <MultiSelect
            className="w-40"
            placeholder="UFs"
            value={fEstados}
            onChange={setFEstados}
            options={UF_LIST.map((uf) => ({ value: uf, label: uf }))}
          />
          <MultiSelect
            className="w-56"
            placeholder="Cidades"
            value={fCidades}
            onChange={setFCidades}
            options={cidadeOptions}
            emptyLabel="Sem cidades validadas"
          />
          <MultiSelect
            className="w-44"
            placeholder="Origem"
            value={fOrigens}
            onChange={setFOrigens}
            options={ORIGEM_VALUES.map((v) => ({ value: v, label: ORIGEM_LABELS[v] }))}
            searchable={false}
          />
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Período:</span>
            <Input
              type="date"
              className="h-9 w-[140px]"
              value={fDateFrom}
              onChange={(e) => setFDateFrom(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">→</span>
            <Input
              type="date"
              className="h-9 w-[140px]"
              value={fDateTo}
              onChange={(e) => setFDateTo(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border/70">
          <span className="text-xs font-medium text-muted-foreground mr-1">Entrevistas:</span>
          <Button
            size="sm"
            variant={fEntrevistaQuando === "hoje" ? "default" : "outline"}
            className="h-8 rounded-full px-3.5 text-xs"
            onClick={() => setFEntrevistaQuando(fEntrevistaQuando === "hoje" ? "" : "hoje")}
          >
            Hoje
          </Button>
          <Button
            size="sm"
            variant={fEntrevistaQuando === "semana" ? "default" : "outline"}
            className="h-8 rounded-full px-3.5 text-xs"
            onClick={() => setFEntrevistaQuando(fEntrevistaQuando === "semana" ? "" : "semana")}
          >
            Esta semana
          </Button>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Data:</span>
            <Input
              type="date"
              className="h-9 w-[150px]"
              value={fEntrevistaData}
              onChange={(e) => setFEntrevistaData(e.target.value)}
            />
          </div>
          <MultiSelect
            className="w-56"
            placeholder="Entrevistador"
            value={fEntrevistadores}
            onChange={setFEntrevistadores}
            options={entrevistadorOptions.map((e) => ({ value: e, label: e }))}
            emptyLabel="Sem entrevistadores"
          />
          <span className="text-xs font-medium text-muted-foreground ml-2">Observação:</span>
          <Button
            size="sm"
            variant={fObs === "com" ? "default" : "outline"}
            className="h-8 rounded-full px-3.5 text-xs"
            onClick={() => setFObs(fObs === "com" ? "" : "com")}
          >
            Com observação
          </Button>
          <Button
            size="sm"
            variant={fObs === "sem" ? "default" : "outline"}
            className="h-8 rounded-full px-3.5 text-xs"
            onClick={() => setFObs(fObs === "sem" ? "" : "sem")}
          >
            Sem observação
          </Button>
          {hasFilters && (
            <Button size="sm" variant="ghost" onClick={clearFilters}>Limpar filtros</Button>
          )}

          {selected.size > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{selected.size} selecionado(s)</span>
              <Select onValueChange={(v) => bulkChange(v as CandidatoStatus)}>
                <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Mover para..." /></SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              {role === "admin" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBulkReprocess}
                  disabled={bulkReprocessing}
                  className="gap-1.5"
                >
                  <RefreshCw className={`size-3.5 ${bulkReprocessing ? "animate-spin" : ""}`} />
                  {bulkReprocessing ? "Reprocessando..." : "Reprocessar"}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={bulkReprocessing}>Limpar seleção</Button>
            </div>
          )}
        </div>
      </Card>


      <Card className="overflow-hidden relative rounded-2xl shadow-sm">
        {isFetching && (
          <div className="absolute inset-x-0 top-0 z-10 h-0.5 bg-primary/20 overflow-hidden">
            <div className="h-full w-1/3 bg-primary animate-pulse" />
          </div>
        )}
        <div className={`overflow-x-auto transition-opacity ${isFetching ? "opacity-60" : ""}`}>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-3 w-8">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={(c) => {
                      setSelected((s) => {
                        const n = new Set(s);
                        if (c) filtered.forEach((r) => n.add(r.id));
                        else filtered.forEach((r) => n.delete(r.id));
                        return n;
                      });
                    }}
                  />
                </th>
                <th className="text-left px-3 py-3 font-medium">Nome</th>
                <th className="text-left px-3 py-3 font-medium">Telefone</th>
                <th className="text-left px-3 py-3 font-medium">Cidade</th>
                <th className="text-left px-3 py-3 font-medium">UF</th>

                <th className="text-left px-3 py-3 font-medium">Recrutador</th>
                <th className="text-left px-3 py-3 font-medium">Status</th>
                <th className="text-left px-3 py-3 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    onClick={() => setObsSort(obsSort === "none" ? "asc" : obsSort === "asc" ? "desc" : "none")}
                    title="Ordenar por observação"
                  >
                    Observação
                    {obsSort === "asc" ? <ArrowUp className="size-3" /> : obsSort === "desc" ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-60" />}
                  </button>
                </th>
                <th className="text-left px-3 py-3 font-medium">Origem</th>
                <th className="text-left px-3 py-3 font-medium">CV</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-t border-border/70 transition-colors hover:bg-muted/50">
                  <td className="px-3 py-3.5">
                    <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                  </td>
                  <td className="px-3 py-3.5 font-semibold text-foreground">
  {(r.nome || "").toUpperCase()}
</td>
                 <td
  className="px-3 py-3.5 text-muted-foreground cursor-pointer hover:text-primary transition-colors"
  onClick={() => {
    if (!r.telefone) return;
    navigator.clipboard.writeText(r.telefone);
    toast.success("Telefone copiado");
  }}
  title={r.telefone ? "Clique para copiar" : "Telefone não informado"}
>
  {r.telefone ? r.telefone : (
    <AlertTriangle className="size-3.5 text-warning" aria-label="Telefone não informado" />
  )}
</td>
                  <td className="px-3 py-3.5 text-muted-foreground">
                    {r.cidade ? r.cidade : (
                      <AlertTriangle className="size-3.5 text-muted-foreground/60" aria-label="Cidade não informada" />
                    )}
                  </td>
                  <td className="px-3 py-3.5 text-muted-foreground">{r.estado || "—"}</td>

                  <td className="px-3 py-3.5 text-muted-foreground">{r.recrutador_id ? profMap.get(r.recrutador_id) ?? "—" : "—"}</td>
                  <td className="px-3 py-3.5">
                    <Select value={r.status} onValueChange={(v) => changeStatus(r.id, v as CandidatoStatus)}>
                      <SelectTrigger className="h-8 w-44 text-xs rounded-lg">
                        <Badge variant="outline" className={`${STATUS_TONE[r.status]} font-medium`}>{STATUS_LABELS[r.status]}</Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {(() => {
                      const last = latestStatusMap?.get(r.id);
                      if (!last) return null;
                      const d = new Date(last.created_at);
                      const when = d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
                      return (
                        <div className="mt-1 text-[10px] leading-tight text-muted-foreground">
                          {last.changed_by_nome ? `por ${last.changed_by_nome} · ` : ""}{when}
                        </div>
                      );
                    })()}
                    {r.status === "agendado" && r.data_entrevista && (
                      <div className="mt-1.5 space-y-1 text-[11px] leading-tight text-primary font-medium">
                        <div className="flex items-center gap-1.5"><Calendar className="size-3" /> {(() => { const [y, m, d] = r.data_entrevista!.split("-"); return `${d}/${m}/${y}`; })()}</div>
                        {r.horario_entrevista && <div className="flex items-center gap-1.5"><Clock className="size-3" /> {r.horario_entrevista.slice(0, 5)}</div>}
                        {r.entrevistador && <div className="flex items-center gap-1.5"><User className="size-3" /> {r.entrevistador}</div>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3.5 align-top max-w-[260px]">
                    {(() => {
                      const obs = (r.observacoes ?? "").trim();
                      const isEditing = editingObsId === r.id;
                      const updatedAt = r.observacoes_updated_at ? new Date(r.observacoes_updated_at) : null;

                      
                      if (isEditing) {
                        return (
                          <div className="flex flex-col gap-1">
                            <textarea
                              autoFocus
                              rows={3}
                              className="w-full text-xs rounded border border-input bg-background p-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                              value={editingObsValue}
                              onChange={(e) => setEditingObsValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") { setEditingObsId(null); }
                                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { void saveObservacao(r.id, editingObsValue); }
                              }}
                              disabled={savingObsId === r.id}
                            />
                            <div className="flex gap-1">
                              <Button size="sm" className="h-6 px-2 text-[11px]" onClick={() => saveObservacao(r.id, editingObsValue)} disabled={savingObsId === r.id}>
                                {savingObsId === r.id ? "Salvando..." : "Salvar"}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setEditingObsId(null)} disabled={savingObsId === r.id}>
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div className={`group rounded px-1.5 py-1 -mx-1.5 ${obs ? "bg-info/10 border-l-2 border-info" : ""}`}>
                          <div className="flex items-start gap-1.5">
                             {obs && <StickyNote className="size-3.5 mt-0.5 shrink-0 text-info" aria-label="Possui observação" />}
                             <span
                               className={`text-xs leading-relaxed flex-1 line-clamp-2 ${obs ? "" : "text-muted-foreground italic"}`}
                               title={obs || "Sem observações"}
                             >
                               {obs || "Sem observações"}
                             </span>
                            <button
                              type="button"
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary shrink-0"
                              title="Editar observação"
                              onClick={() => { setEditingObsId(r.id); setEditingObsValue(obs); }}
                            >
                              <Pencil className="size-3" />
                            </button>
                          </div>
                          {updatedAt && (
                            <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                              {r.observacoes_updated_by_nome ? `${r.observacoes_updated_by_nome} · ` : ""}
                              {updatedAt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                   <td className="px-3 py-3.5 text-muted-foreground text-xs">
                     {ORIGEM_LABELS[normalizeOrigem(r.origem_curriculo)]}
                   </td>
                   <td className="px-3 py-3.5">
                    {r.curriculo_url ? (
                      <div className="flex flex-col gap-1">
                         <div className="flex items-center gap-3">
                           <button
                             onClick={() => openCurriculo(r.curriculo_url!)}
                             className="text-primary hover:underline inline-flex items-center gap-1"
                             title="Abrir currículo (PDF)"
                           >
                             <FileText className="size-3.5" /> PDF
                           </button>
                         </div>
                        {r.ultimo_reprocessamento_at && (
                          <span className="text-[10px] text-muted-foreground">
                            Reprocessado em {new Date(r.ultimo_reprocessamento_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                    <td className="px-3 py-3.5">
                      <div className="flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              aria-label="Mais opções"
                              title="Mais opções"
                            >
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            {role === "admin" && r.curriculo_url && (
                              <DropdownMenuItem
                                disabled={reprocessing.has(r.id)}
                                onSelect={() => handleReprocess(r.id)}
                              >
                                <RefreshCw className={`size-3.5 ${reprocessing.has(r.id) ? "animate-spin" : ""}`} />
                                {reprocessing.has(r.id) ? "Reprocessando..." : "Reprocessar currículo"}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onSelect={() => {
                                setEditing(r);
                                setOpen(true);
                              }}
                            >
                              <Pencil className="size-3.5" />
                              Editar candidato
                            </DropdownMenuItem>
                            {(
                              role === "admin" ||
                              (role === "recrutador" && r.recrutador_id === user?.id)
                            ) && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={() => handleDelete(r.id)}
                              >
                                <Trash2 className="size-3.5" />
                                Excluir
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                   </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td
                    colSpan={11}
                    className="px-4 py-14 text-center text-sm text-muted-foreground"
                  >
                    Nenhum candidato. Arraste PDFs acima para começar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            {total > 0
              ? `Exibindo ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} de ${total}`
              : "Nenhum candidato"}
          </p>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Itens por página:</span>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="h-8 w-[76px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page === 1 || isFetching}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Anterior
          </Button>
          <span className="min-w-28 text-center text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page >= totalPages || isFetching}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            Próximo
          </Button>
        </div>
      </div>

      <Suspense fallback={null}>
        <CandidatoEditDialog
          open={open}
          onOpenChange={setOpen}
          candidato={editing}
          onSaved={() => invalidateAtsQueries(queryClient)}
        />
        <AgendarEntrevistaDialog
          open={agendarOpen}
          onOpenChange={(o) => { setAgendarOpen(o); if (!o) setAgendarTarget(null); }}
          candidatoNome={agendarTarget?.nome ?? undefined}
          profiles={profiles}
          initial={agendarTarget?.initial}
          onConfirm={confirmAgendamento}
        />
      </Suspense>
    </div>
  );
}
