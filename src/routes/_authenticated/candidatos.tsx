import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { BulkUpload } from "@/components/BulkUpload";
import { CandidatoEditDialog } from "@/components/CandidatoEditDialog";
import {
  useAuth, STATUS_LABELS, STATUS_ORDER, STATUS_TONE,
  type CandidatoRow, type CandidatoStatus,
} from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/candidatos")({
  component: CandidatosPage,
});

interface ProfileLite { id: string; nome: string }

function CandidatosPage() {
  const { role } = useAuth();
  const [rows, setRows] = useState<CandidatoRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CandidatoRow | null>(null);
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function load() {
    const { data } = await supabase
      .from("candidatos")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setRows((data as CandidatoRow[]) ?? []);
    const { data: p } = await supabase.from("profiles").select("id,nome");
    setProfiles((p as ProfileLite[]) ?? []);
  }

  useEffect(() => {
    load();
    const ch = supabase.channel("cand-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "candidatos" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const profMap = useMemo(() => new Map(profiles.map(p => [p.id, p.nome])), [profiles]);

  const filtered = useMemo(() => rows.filter(r => {
    if (fStatus !== "all" && r.status !== fStatus) return false;
    if (q) {
      const t = q.toLowerCase();
      const hay = `${r.nome} ${r.telefone ?? ""} ${r.cidade ?? ""} ${r.email ?? ""}`.toLowerCase();
      if (!hay.includes(t)) return false;
    }
    return true;
  }), [rows, q, fStatus]);

  async function handleDelete(id: string) {
    if (!confirm("Excluir este candidato?")) return;
    const { error } = await supabase.from("candidatos").delete().eq("id", id);
    if (error) toast.error(error.message); else toast.success("Excluído");
  }

  async function openCurriculo(path: string) {
    const { data, error } = await supabase.storage.from("curriculos").createSignedUrl(path, 60);
    if (error) toast.error(error.message);
    else window.open(data.signedUrl, "_blank");
  }

  async function changeStatus(id: string, status: CandidatoStatus) {
    setRows((arr) => arr.map((r) => r.id === id ? { ...r, status } : r)); // optimistic
    const { error } = await supabase.from("candidatos").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); load(); }
  }

  async function bulkChange(status: CandidatoStatus) {
    if (!selected.size) return;
    const ids = [...selected];
    setRows((arr) => arr.map((r) => ids.includes(r.id) ? { ...r, status } : r));
    const { error } = await supabase.from("candidatos").update({ status }).in("id", ids);
    if (error) { toast.error(error.message); load(); }
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
      </header>

      <Card className="p-4 mb-4">
        <BulkUpload onCreated={load} />
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

      <CandidatoEditDialog open={open} onOpenChange={setOpen} candidato={editing} onSaved={load} />
    </div>
  );
}
