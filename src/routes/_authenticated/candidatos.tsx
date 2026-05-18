import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, FileText, Pencil, Trash2 } from "lucide-react";
import { CandidatoDialog, type CandidatoRow } from "@/components/CandidatoDialog";
import { useAuth, STATUS_LABELS } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/candidatos")({
  component: CandidatosPage,
});

const STATUS_TONE: Record<string, string> = {
  novo: "bg-info/15 text-info border-info/30",
  triagem: "bg-accent text-accent-foreground border-border",
  aguardando_contato: "bg-warning/15 text-warning border-warning/30",
  agendado: "bg-primary/15 text-primary border-primary/30",
  compareceu: "bg-success/15 text-success border-success/30",
  reprovado: "bg-destructive/10 text-destructive border-destructive/30",
  contratado: "bg-success/20 text-success border-success/40",
};

interface ProfileLite { id: string; nome: string }

function CandidatosPage() {
  const { role } = useAuth();
  const [rows, setRows] = useState<CandidatoRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CandidatoRow | null>(null);
  const [q, setQ] = useState("");
  const [fRegiao, setFRegiao] = useState<string>("all");
  const [fCidade, setFCidade] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fRec, setFRec] = useState<string>("all");

  async function load() {
    const { data } = await supabase
      .from("candidatos")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
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
  const regioes = useMemo(() => [...new Set(rows.map(r => r.regiao))].sort(), [rows]);
  const cidades = useMemo(() => [...new Set(rows.map(r => r.cidade))].sort(), [rows]);

  const filtered = rows.filter(r => {
    if (fRegiao !== "all" && r.regiao !== fRegiao) return false;
    if (fCidade !== "all" && r.cidade !== fCidade) return false;
    if (fStatus !== "all" && r.status !== fStatus) return false;
    if (fRec !== "all" && r.recrutador_id !== fRec) return false;
    if (q) {
      const t = q.toLowerCase();
      if (!r.nome.toLowerCase().includes(t) && !r.telefone.includes(t) && !r.vaga.toLowerCase().includes(t)) return false;
    }
    return true;
  });

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

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Candidatos</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} de {rows.length} candidatos</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="size-4 mr-1" /> Novo candidato
        </Button>
      </header>

      <Card className="p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="relative md:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar nome, telefone, vaga..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={fRegiao} onValueChange={setFRegiao}>
            <SelectTrigger><SelectValue placeholder="Região" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as regiões</SelectItem>
              {regioes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fCidade} onValueChange={setFCidade}>
            <SelectTrigger><SelectValue placeholder="Cidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as cidades</SelectItem>
              {cidades.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fRec} onValueChange={setFRec}>
            <SelectTrigger><SelectValue placeholder="Recrutador" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os recrutadores</SelectItem>
              {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-accent/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Nome</th>
                <th className="text-left px-4 py-3 font-medium">Telefone</th>
                <th className="text-left px-4 py-3 font-medium">Cidade / Região</th>
                <th className="text-left px-4 py-3 font-medium">Vaga</th>
                <th className="text-left px-4 py-3 font-medium">Recrutador</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">CV</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-t hover:bg-accent/20">
                  <td className="px-4 py-3 font-medium">{r.nome}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.telefone}</td>
                  <td className="px-4 py-3">{r.cidade} <span className="text-muted-foreground">· {r.regiao}</span></td>
                  <td className="px-4 py-3">{r.vaga}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.recrutador_id ? profMap.get(r.recrutador_id) ?? "—" : "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={STATUS_TONE[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {r.curriculo_url ? (
                      <button onClick={() => openCurriculo(r.curriculo_url!)} className="text-primary hover:underline inline-flex items-center gap-1">
                        <FileText className="size-3.5" /> PDF
                      </button>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>
                        <Pencil className="size-4" />
                      </Button>
                      {role === "admin" && (
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(r.id)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">Nenhum candidato encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <CandidatoDialog open={open} onOpenChange={setOpen} candidato={editing} onSaved={load} />
    </div>
  );
}
