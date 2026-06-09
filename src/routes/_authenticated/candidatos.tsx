import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
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
import { Search, FileText, Pencil, Trash2, RefreshCw } from "lucide-react";
import {
  useAuth, STATUS_LABELS, STATUS_ORDER, STATUS_TONE, UF_LIST,
  type CandidatoRow, type CandidatoStatus,
} from "@/lib/auth";
import { MultiSelect } from "@/components/MultiSelect";

import {
  invalidateAtsQueries,
  useCandidatosQuery,
  useCandidatosRealtime,
  useLatestStatusChangesQuery,
  useProfilesLiteQuery,
} from "@/lib/ats-data";
import { toast } from "sonner";

const BulkUpload = lazy(async () => import("@/components/BulkUpload").then((mod) => ({ default: mod.BulkUpload })));
const CandidatoEditDialog = lazy(async () => import("@/components/CandidatoEditDialog").then((mod) => ({ default: mod.CandidatoEditDialog })));
const AgendarEntrevistaDialog = lazy(async () => import("@/components/AgendarEntrevistaDialog").then((mod) => ({ default: mod.AgendarEntrevistaDialog })));

export const Route = createFileRoute("/_authenticated/candidatos")({
  component: CandidatosPage,
});

function CandidatosPage() {
  const { role, user } = useAuth();
  const queryClient = useQueryClient();
  const { data: rows = [] } = useCandidatosQuery();
  const { data: profiles = [] } = useProfilesLiteQuery();
  const { data: latestStatusMap } = useLatestStatusChangesQuery();
  const fetchCv = useServerFn(getCurriculoContent);
  const reprocessFn = useServerFn(reprocessCandidato);
  const [reprocessing, setReprocessing] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CandidatoRow | null>(null);
  const [fNome, setFNome] = useState("");
  const [fTelefone, setFTelefone] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fVaga, setFVaga] = useState("");

  // Filtros multi-select
  const [fStatus, setFStatus] = useState<string[]>([]);
  const [fRecrutadores, setFRecrutadores] = useState<string[]>([]);
  const [fEstados, setFEstados] = useState<string[]>([]);
  const [fCidades, setFCidades] = useState<string[]>([]);

  // Período (created_at) – combinável com os demais
  const [fDateFrom, setFDateFrom] = useState<string>("");
  const [fDateTo, setFDateTo] = useState<string>("");

  // Filtros de entrevista
  const [fEntrevistaData, setFEntrevistaData] = useState<string>("");
  const [fEntrevistadores, setFEntrevistadores] = useState<string[]>([]);
  const [fEntrevistaQuando, setFEntrevistaQuando] = useState<"" | "hoje" | "semana">("");

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

  // Cidades disponíveis vindas dos candidatos atuais
  const cidadeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const c = (r.cidade || "").trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rows]);

  const entrevistadorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const e = (r.entrevistador || "").trim();
      if (e) set.add(e);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rows]);

  const norm = (s: string | null | undefined) => (s ?? "").toLowerCase();
  const fromTs = fDateFrom ? new Date(fDateFrom + "T00:00:00").getTime() : null;
  const toTs = fDateTo ? new Date(fDateTo + "T23:59:59").getTime() : null;

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

  const filtered = useMemo(() => {
    const out = rows.filter(r => {
      if (fStatus.length && !fStatus.includes(r.status)) return false;
      if (fRecrutadores.length && !fRecrutadores.includes(r.recrutador_id ?? "")) return false;
      if (fEstados.length && !fEstados.includes(r.estado ?? "")) return false;
      if (fCidades.length && !fCidades.includes((r.cidade ?? "").trim())) return false;
      if (fromTs || toTs) {
        const t = new Date(r.created_at).getTime();
        if (fromTs && t < fromTs) return false;
        if (toTs && t > toTs) return false;
      }
      if (fEntrevistaData && r.data_entrevista !== fEntrevistaData) return false;
      if (fEntrevistadores.length && !fEntrevistadores.includes((r.entrevistador ?? "").trim())) return false;
      if (fEntrevistaQuando === "hoje") {
        if (r.data_entrevista !== todayStr) return false;
      } else if (fEntrevistaQuando === "semana") {
        if (!r.data_entrevista || r.data_entrevista < weekStart || r.data_entrevista > weekEnd) return false;
      }
      if (fObs === "com" && !(r.observacoes && r.observacoes.trim())) return false;
      if (fObs === "sem" && r.observacoes && r.observacoes.trim()) return false;
      if (fNome && !norm(r.nome).includes(fNome.toLowerCase())) return false;
      if (fTelefone && !norm(r.telefone).includes(fTelefone.toLowerCase())) return false;
      if (fEmail && !norm(r.email).includes(fEmail.toLowerCase())) return false;
      if (fVaga && !norm(r.vaga).includes(fVaga.toLowerCase())) return false;
      return true;
    });
    if (obsSort !== "none") {
      const dir = obsSort === "asc" ? 1 : -1;
      out.sort((a, b) => {
        const av = (a.observacoes ?? "").trim().toLowerCase();
        const bv = (b.observacoes ?? "").trim().toLowerCase();
        if (!av && !bv) return 0;
        if (!av) return 1; // vazios sempre no fim
        if (!bv) return -1;
        return av.localeCompare(bv, "pt-BR") * dir;
      });
    }
    return out;
  }, [rows, fNome, fTelefone, fEmail, fVaga, fStatus, fRecrutadores, fEstados, fCidades, fromTs, toTs, fEntrevistaData, fEntrevistadores, fEntrevistaQuando, todayStr, weekStart, weekEnd, fObs, obsSort]);

  const hasFilters =
    !!(fNome || fTelefone || fEmail || fVaga || fDateFrom || fDateTo || fEntrevistaData || fEntrevistaQuando || fObs) ||
    fStatus.length > 0 || fRecrutadores.length > 0 || fEstados.length > 0 || fCidades.length > 0 ||
    fEntrevistadores.length > 0;

  function clearFilters() {
    setFNome(""); setFTelefone(""); setFEmail(""); setFVaga("");
    setFStatus([]); setFRecrutadores([]); setFEstados([]); setFCidades([]);
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
      invalidateAtsQueries(queryClient);
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
    const txt = prompt(`Excluir TODOS os ${rows.length} candidatos? Digite EXCLUIR para confirmar.`);
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
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Candidatos</h1>
          <p className="text-xs text-muted-foreground">{filtered.length} de {rows.length}</p>
        </div>
        <div className="flex items-center gap-2">
          {role === "admin" && rows.length > 0 && (
            <Button size="sm" variant="outline" className="text-destructive border-destructive/40 hover:bg-destructive/10" onClick={handleDeleteAll}>
              <Trash2 className="size-3.5 mr-1" /> Excluir todos
            </Button>
          )}
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
            + Novo candidato
          </Button>
        </div>
      </header>

      <Card className="p-4 mb-4">
        <Suspense fallback={<div className="h-36 rounded-lg border border-dashed bg-accent/20 animate-pulse" />}>
          <BulkUpload onCreated={() => invalidateAtsQueries(queryClient)} />
        </Suspense>
      </Card>

      <Card className="p-3 mb-3 space-y-2">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input className="pl-8 h-9" placeholder="Nome" value={fNome} onChange={(e) => setFNome(e.target.value)} />
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
        <div className="flex flex-wrap items-center gap-2">
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
            options={cidadeOptions.map((c) => ({ value: c, label: c }))}
            emptyLabel="Sem cidades cadastradas"
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
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/60">
          <span className="text-xs font-medium text-muted-foreground mr-1">Entrevistas:</span>
          <Button
            size="sm"
            variant={fEntrevistaQuando === "hoje" ? "default" : "outline"}
            className="h-8"
            onClick={() => setFEntrevistaQuando(fEntrevistaQuando === "hoje" ? "" : "hoje")}
          >
            Hoje
          </Button>
          <Button
            size="sm"
            variant={fEntrevistaQuando === "semana" ? "default" : "outline"}
            className="h-8"
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
            className="h-8"
            onClick={() => setFObs(fObs === "com" ? "" : "com")}
          >
            Com observação
          </Button>
          <Button
            size="sm"
            variant={fObs === "sem" ? "default" : "outline"}
            className="h-8"
            onClick={() => setFObs(fObs === "sem" ? "" : "sem")}
          >
            Sem observação
          </Button>
          {hasFilters && (
            <Button size="sm" variant="ghost" onClick={clearFilters}>Limpar filtros</Button>
          )}

          {selected.size > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-muted-foreground">{selected.size} selecionado(s)</span>
              <Select onValueChange={(v) => bulkChange(v as CandidatoStatus)}>
                <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Mover para..." /></SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpar seleção</Button>
            </div>
          )}
        </div>
      </Card>


      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-accent/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 w-8">
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
                <th className="text-left px-3 py-2 font-medium">Nome</th>
                <th className="text-left px-3 py-2 font-medium">Telefone</th>
                <th className="text-left px-3 py-2 font-medium">Cidade</th>
                <th className="text-left px-3 py-2 font-medium">UF</th>

                <th className="text-left px-3 py-2 font-medium">Recrutador</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    onClick={() => setObsSort(obsSort === "none" ? "asc" : obsSort === "asc" ? "desc" : "none")}
                    title="Ordenar por observação"
                  >
                    Observação
                    <span className="text-[10px]">{obsSort === "asc" ? "▲" : obsSort === "desc" ? "▼" : "↕"}</span>
                  </button>
                </th>
                <th className="text-left px-3 py-2 font-medium">CV</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-t hover:bg-accent/20">
                  <td className="px-3 py-2">
                    <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                  </td>
                  <td className="px-3 py-2 font-medium">
  {(r.nome || "").toUpperCase()}
</td>
                 <td
  className="px-3 py-2 text-muted-foreground cursor-pointer hover:text-primary transition-colors"
  onClick={() => {
    navigator.clipboard.writeText(r.telefone || "");
    toast.success("Telefone copiado");
  }}
  title="Clique para copiar"
>
  {r.telefone || "—"}
</td>
                  <td className="px-3 py-2">{r.cidade || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.estado || "—"}</td>

                  <td className="px-3 py-2 text-muted-foreground">{r.recrutador_id ? profMap.get(r.recrutador_id) ?? "—" : "—"}</td>
                  <td className="px-3 py-2">
                    <Select value={r.status} onValueChange={(v) => changeStatus(r.id, v as CandidatoStatus)}>
                      <SelectTrigger className="h-7 w-40 text-xs">
                        <Badge variant="outline" className={`${STATUS_TONE[r.status]} font-normal`}>{STATUS_LABELS[r.status]}</Badge>
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
                      <div className="mt-1 space-y-0.5 text-[11px] leading-tight text-primary font-medium">
                        <div>📅 {(() => { const [y, m, d] = r.data_entrevista!.split("-"); return `${d}/${m}/${y}`; })()}</div>
                        {r.horario_entrevista && <div>🕒 {r.horario_entrevista.slice(0, 5)}</div>}
                        {r.entrevistador && <div>👤 {r.entrevistador}</div>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top max-w-[260px]">
                    {(() => {
                      const obs = (r.observacoes ?? "").trim();
                      const isEditing = editingObsId === r.id;
                      const updatedAt = r.observacoes_updated_at ? new Date(r.observacoes_updated_at) : null;
                      const isRecent = updatedAt ? (Date.now() - updatedAt.getTime()) < 3 * 24 * 60 * 60 * 1000 : false;
                      const truncated = obs.length > 80 ? `${obs.slice(0, 80)}...` : obs;
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
                        <div className={`group rounded px-1 py-0.5 -mx-1 ${isRecent ? "bg-warning/10 border-l-2 border-warning" : ""}`}>
                          <div className="flex items-start gap-1">
                            <span
                              className={`text-xs leading-tight flex-1 ${obs ? "" : "text-muted-foreground italic"}`}
                              title={obs || "Sem observações"}
                            >
                              {obs ? truncated : "Sem observações"}
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
                  <td className="px-3 py-2">
                    {r.curriculo_url ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => openCurriculo(r.curriculo_url!)}
                            className="text-primary hover:underline inline-flex items-center gap-1"
                          >
                            <FileText className="size-3.5" /> PDF
                          </button>
                          {role === "admin" && (
                            <button
                              onClick={() => handleReprocess(r.id)}
                              disabled={reprocessing.has(r.id)}
                              title="Reprocessar (análise profunda) — preenche apenas campos vazios"
                              className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 disabled:opacity-60"
                            >
                              <RefreshCw className={`size-3.5 ${reprocessing.has(r.id) ? "animate-spin" : ""}`} />
                              Reprocessar
                            </button>
                          )}
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

                  <td className="px-3 py-2">
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditing(r);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>

                      {(
                        role === "admin" ||
                        (role === "recrutador" && r.recrutador_id === user?.id)
                      ) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleDelete(r.id)}
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-muted-foreground text-sm"
                  >
                    Nenhum candidato. Arraste PDFs acima para começar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

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
