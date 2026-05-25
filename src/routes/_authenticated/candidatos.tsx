import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCurriculoContent } from "@/lib/curriculos.functions";
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
import { Search, FileText, Pencil, Trash2 } from "lucide-react";
import {
  useAuth, STATUS_LABELS, STATUS_ORDER, STATUS_TONE,
  type CandidatoRow, type CandidatoStatus,
} from "@/lib/auth";
import {
  invalidateAtsQueries,
  useCandidatosQuery,
  useCandidatosRealtime,
  useProfilesLiteQuery,
} from "@/lib/ats-data";
import { toast } from "sonner";

const BulkUpload = lazy(async () => import("@/components/BulkUpload").then((mod) => ({ default: mod.BulkUpload })));
const CandidatoEditDialog = lazy(async () => import("@/components/CandidatoEditDialog").then((mod) => ({ default: mod.CandidatoEditDialog })));

export const Route = createFileRoute("/_authenticated/candidatos")({
  component: CandidatosPage,
});

function CandidatosPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const { data: rows = [] } = useCandidatosQuery();
  const { data: profiles = [] } = useProfilesLiteQuery();
  const fetchCv = useServerFn(getCurriculoContent);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CandidatoRow | null>(null);
  const [fNome, setFNome] = useState("");
  const [fTelefone, setFTelefone] = useState("");
  const [fCidade, setFCidade] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fVaga, setFVaga] = useState("");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fRecrutador, setFRecrutador] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useCandidatosRealtime();

  const profMap = useMemo(() => new Map(profiles.map(p => [p.id, p.nome])), [profiles]);

  const norm = (s: string | null | undefined) => (s ?? "").toLowerCase();
  const filtered = useMemo(() => rows.filter(r => {
    if (fStatus !== "all" && r.status !== fStatus) return false;
    if (fRecrutador !== "all" && (r.recrutador_id ?? "") !== fRecrutador) return false;
    if (fNome && !norm(r.nome).includes(fNome.toLowerCase())) return false;
    if (fTelefone && !norm(r.telefone).includes(fTelefone.toLowerCase())) return false;
    if (fCidade && !norm(r.cidade).includes(fCidade.toLowerCase())) return false;
    if (fEmail && !norm(r.email).includes(fEmail.toLowerCase())) return false;
    if (fVaga && !norm(r.vaga).includes(fVaga.toLowerCase())) return false;
    return true;
  }), [rows, fNome, fTelefone, fCidade, fEmail, fVaga, fStatus, fRecrutador]);

  const hasFilters = !!(fNome || fTelefone || fCidade || fEmail || fVaga) || fStatus !== "all" || fRecrutador !== "all";
  function clearFilters() {
    setFNome(""); setFTelefone(""); setFCidade(""); setFEmail(""); setFVaga("");
    setFStatus("all"); setFRecrutador("all");
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

  async function openCurriculo(path: string) {
    const { data, error } = await supabase.storage.from("curriculos").createSignedUrl(path, 60);
    if (error) toast.error(error.message);
    else window.open(data.signedUrl, "_blank");
  }

  async function changeStatus(id: string, status: CandidatoStatus) {
    const { error } = await supabase.from("candidatos").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function bulkChange(status: CandidatoStatus) {
    if (!selected.size) return;
    const ids = [...selected];
    const { error } = await supabase.from("candidatos").update({ status }).in("id", ids);
    if (error) toast.error(error.message);
    else { toast.success(`${ids.length} candidato(s) movidos`); setSelected(new Set()); }
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

      <Card className="p-3 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input className="pl-9 h-9" placeholder="Buscar por nome, telefone, cidade..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          {selected.size > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-muted-foreground">{selected.size} selecionado(s)</span>
              <Select onValueChange={(v) => bulkChange(v as CandidatoStatus)}>
                <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Mover para..." /></SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpar</Button>
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
                <th className="text-left px-3 py-2 font-medium">Recrutador</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
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
                  <td className="px-3 py-2 font-medium">{r.nome}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.telefone || "—"}</td>
                  <td className="px-3 py-2">{r.cidade || "—"}</td>
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
                  </td>
                  <td className="px-3 py-2">
                    {r.curriculo_url ? (
                      <button onClick={() => openCurriculo(r.curriculo_url!)} className="text-primary hover:underline inline-flex items-center gap-1">
                        <FileText className="size-3.5" /> PDF
                      </button>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(r); setOpen(true); }}>
                        <Pencil className="size-3.5" />
                      </Button>
                      {role === "admin" && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(r.id)}>
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground text-sm">Nenhum candidato. Arraste PDFs acima para começar.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Suspense fallback={null}>
        <CandidatoEditDialog open={open} onOpenChange={setOpen} candidato={editing} onSaved={() => invalidateAtsQueries(queryClient)} />
      </Suspense>
    </div>
  );
}
