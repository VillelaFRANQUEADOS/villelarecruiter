import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProfileLite } from "@/lib/ats-data";

export interface AgendamentoData {
  data_entrevista: string;
  horario_entrevista: string;
  entrevistador: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  candidatoNome?: string;
  profiles: ProfileLite[];
  initial?: Partial<AgendamentoData>;
  onConfirm: (data: AgendamentoData) => Promise<void> | void;
}

export function AgendarEntrevistaDialog({ open, onOpenChange, candidatoNome, profiles, initial, onConfirm }: Props) {
  const [data, setData] = useState("");
  const [hora, setHora] = useState("");
  const [entrevistador, setEntrevistador] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setData(initial?.data_entrevista ?? "");
      setHora((initial?.horario_entrevista ?? "").slice(0, 5));
      setEntrevistador(initial?.entrevistador ?? "");
    }
  }, [open, initial]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !hora || !entrevistador.trim()) return;
    setBusy(true);
    try {
      await onConfirm({ data_entrevista: data, horario_entrevista: hora, entrevistador: entrevistador.trim() });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Agendar entrevista{candidatoNome ? ` · ${candidatoNome}` : ""}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data *</Label>
              <Input type="date" required value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Horário *</Label>
              <Input type="time" required value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Entrevistador *</Label>
            <Select value={entrevistador} onValueChange={setEntrevistador}>
              <SelectTrigger><SelectValue placeholder="Selecione o entrevistador" /></SelectTrigger>
              <SelectContent>
                {profiles.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum usuário cadastrado</div>
                ) : (
                  profiles.map((p) => (
                    <SelectItem key={p.id} value={p.nome}>{p.nome}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
            <Button type="submit" disabled={busy || !data || !hora || !entrevistador.trim()}>
              {busy ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
