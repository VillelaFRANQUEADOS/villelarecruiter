import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchUnidades, upsertUnidade, setUnidadeAtiva, parseUnidadesCsv,
  importUnidades, CSV_TEMPLATE, UNIDADES_QUERY_KEY, type UnidadeRow, type CsvUnidade,
} from "@/lib/unidades";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Building2, Plus, Upload, Copy, Power, Pencil, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_admin/unidades")({
  component: UnidadesPage,
});

function UnidadesPage() {
  const qc = useQueryClient();
  const { data: unidades = [], isLoading } = useQuery({
    queryKey: UNIDADES_QUERY_KEY,
    queryFn: fetchUnidades,
    staleTime: 30_000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: UNIDADES_QUERY_KEY });

  const [busca, setBusca] = useState("");
  const [uf, setUf] = useState("all");
  const [status, setStatus] = useState("all");
  const [edit, setEdit] = useState<UnidadeRow | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);

  const ufs = useMemo(
    () => [...new Set(unidades.map((u) => u.estado))].sort(),
    [unidades],
  );

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return unidades.filter((u) => {
      if (q && !`${u.nome} ${u.cidade} ${u.endereco ?? ""}`.toLowerCase().includes(q)) return false;
      if (uf !== "all" && u.estado !== uf) return false;
      if (status === "ativas" && !u.ativa) return false;
      if (status === "inativas" && u.ativa) return false;
      return true;
    });
  }, [unidades, busca, uf, status]);

  async function toggleAtiva(u: UnidadeRow) {
    try {
      await setUnidadeAtiva(u.id, !u.ativa);
      toast.success(u.ativa ? "Unidade desativada" : "Unidade ativada");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function copiarEndereco(u: UnidadeRow) {
    if (!u.endereco) { toast.error("Endereço não cadastrado"); return; }
    void navigator.clipboard.writeText(u.endereco);
    toast.success("Endereço copiado");
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-brand text-white">
            <Building2 className="size-4" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-brand">Unidades</h1>
            <p className="text-xs text-muted-foreground">{unidades.length} cadastradas</p>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => setCsvOpen(true)}>
            <Upload className="size-4 mr-1.5" /> Importar CSV
          </Button>
          <Button className="rounded-xl" onClick={() => setNovoOpen(true)}>
            <Plus className="size-4 mr-1.5" /> Nova unidade
          </Button>
        </div>
      </div>

      <Card className="rounded-xl p-3">
        <div className="flex flex-wrap gap-2">
          <Input
            className="h-9 w-64 rounded-lg"
            placeholder="Buscar unidade, cidade ou endereço"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <Select value={uf} onValueChange={setUf}>
            <SelectTrigger className="h-9 w-32 rounded-lg"><SelectValue placeholder="UF" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as UFs</SelectItem>
              {ufs.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-36 rounded-lg"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ativas">Ativas</SelectItem>
              <SelectItem value="inativas">Inativas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-3 text-left font-medium">Unidade</th>
              <th className="px-3 py-3 text-left font-medium">Cidade</th>
              <th className="px-3 py-3 text-left font-medium">UF</th>
              <th className="px-3 py-3 text-left font-medium">Endereço</th>
              <th className="px-3 py-3 text-left font-medium">Status</th>
              <th className="px-3 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Carregando...</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Nenhuma unidade encontrada</td></tr>
            )}
            {filtered.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-3 py-2.5 font-medium">{u.nome}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{u.cidade}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{u.estado}</td>
                <td className="max-w-72 truncate px-3 py-2.5 text-muted-foreground">{u.endereco || "—"}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${u.ativa ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                    <span className={`size-1.5 rounded-full ${u.ativa ? "bg-emerald-500" : "bg-muted-foreground/50"}`} />
                    {u.ativa ? "Ativa" : "Inativa"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setEdit(u)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Copiar endereço" onClick={() => copiarEndereco(u)}>
                    <Copy className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Ativar/Desativar" onClick={() => void toggleAtiva(u)}>
                    <Power className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <UnidadeDialog
        open={novoOpen || !!edit}
        unidade={edit}
        onClose={() => { setNovoOpen(false); setEdit(null); }}
        onSaved={() => { setNovoOpen(false); setEdit(null); refresh(); }}
      />
      <CsvDialog open={csvOpen} onClose={() => setCsvOpen(false)} onImported={() => { setCsvOpen(false); refresh(); }} />
    </div>
  );
}

function UnidadeDialog({ open, unidade, onClose, onSaved }: {
  open: boolean; unidade: UnidadeRow | null; onClose: () => void; onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [ativa, setAtiva] = useState(true);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const lat = Number(String(fd.get("latitude")).replace(",", "."));
    const lon = Number(String(fd.get("longitude")).replace(",", "."));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) { toast.error("Latitude/Longitude inválidas"); return; }
    setSaving(true);
    try {
      await upsertUnidade({
        id: unidade?.id,
        nome: String(fd.get("nome")),
        cidade: String(fd.get("cidade")),
        estado: String(fd.get("estado")),
        endereco: String(fd.get("endereco") ?? ""),
        latitude: lat,
        longitude: lon,
        ativa,
      });
      toast.success("Unidade salva");
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); else setAtiva(unidade?.ativa ?? true); }}>
      <DialogContent className="rounded-xl sm:max-w-lg">
        <DialogHeader><DialogTitle>{unidade ? "Editar unidade" : "Nova unidade"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input name="nome" required defaultValue={unidade?.nome ?? ""} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Cidade</Label>
              <Input name="cidade" required defaultValue={unidade?.cidade ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>UF</Label>
              <Input name="estado" required maxLength={2} defaultValue={unidade?.estado ?? ""} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Endereço</Label>
            <Input name="endereco" defaultValue={unidade?.endereco ?? ""} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Latitude</Label>
              <Input name="latitude" required defaultValue={unidade?.latitude ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Longitude</Label>
              <Input name="longitude" required defaultValue={unidade?.longitude ?? ""} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={ativa} onCheckedChange={setAtiva} id="ativa" />
            <Label htmlFor="ativa">Ativa</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CsvDialog({ open, onClose, onImported }: {
  open: boolean; onClose: () => void; onImported: () => void;
}) {
  const [rows, setRows] = useState<CsvUnidade[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  function baixarModelo() {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "modelo-unidades.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File) {
    const text = await file.text();
    const res = parseUnidadesCsv(text);
    setRows(res.rows);
    setErrors(res.errors);
  }

  async function handleImport() {
    setImporting(true);
    try {
      const r = await importUnidades(rows);
      toast.success(`${r.inserted} criadas · ${r.updated} atualizadas`);
      setRows([]); setErrors([]);
      onImported();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setRows([]); setErrors([]); onClose(); } }}>
      <DialogContent className="rounded-xl sm:max-w-2xl">
        <DialogHeader><DialogTitle>Importar unidades por CSV</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
            <Button type="button" variant="outline" onClick={baixarModelo}>
              <Download className="size-4 mr-1.5" /> Baixar modelo CSV
            </Button>
          </div>
          {errors.length > 0 && (
            <div className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
              {errors.slice(0, 5).map((e) => <div key={e}>{e}</div>)}
              {errors.length > 5 && <div>+ {errors.length - 5} erros</div>}
            </div>
          )}
          {rows.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-2 py-2 text-left">Nome</th>
                    <th className="px-2 py-2 text-left">Cidade</th>
                    <th className="px-2 py-2 text-left">UF</th>
                    <th className="px-2 py-2 text-left">Lat</th>
                    <th className="px-2 py-2 text-left">Lon</th>
                    <th className="px-2 py-2 text-left">Ativa</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((r, i) => (
                    <tr key={`${r.nome}-${i}`} className="border-t">
                      <td className="px-2 py-1.5">{r.nome}</td>
                      <td className="px-2 py-1.5">{r.cidade}</td>
                      <td className="px-2 py-1.5">{r.estado}</td>
                      <td className="px-2 py-1.5">{r.latitude}</td>
                      <td className="px-2 py-1.5">{r.longitude}</td>
                      <td className="px-2 py-1.5">{r.ativa ? "Sim" : "Não"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!rows.length || importing} onClick={() => void handleImport()}>
            {importing ? "Importando..." : `Importar ${rows.length} unidades`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
