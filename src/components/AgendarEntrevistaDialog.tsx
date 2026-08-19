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
  agendado_por_id: string;
  agendado_por_nome: string;
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
  const [agendadoPorId, setAgendadoPorId] = useState("");
  const [busy, setBusy] = useState(false);

  const activeProfiles = profiles.filter((p) => p.ativo !== false);

  useEffect(() => {
    if (open) {
      setData(initial?.data_entrevista ?? "");
      setHora((initial?.horario_entrevista ?? "").slice(0, 5));
      setEntrevistador(initial?.entrevistador ?? "");
      setAgendadoPorId(initial?.agendado_por_id ?? "");
    }
  }, [open, initial]);

  const agendadoPorNome = activeProfiles.find((p) => p.id === agendadoPorId)?.nome ?? initial?.agendado_por_nome ?? "";
  const valid = !!data && !!hora && !!entrevistador.trim() && !!agendadoPorId;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await onConfirm({ data_entrevista: data, horario_entrevista: hora, entrevistador: entrevistador.trim(), agendado_por_id: agendadoPorId, agendado_por_nome: agendadoPorNome });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Agendar entrevista{candidatoNome ? ` · ${candidatoNome}` : ""}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Data *</Label><Input type="date" required value={data} onChange={(e) => setData(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Horário *</Label><Input type="time" required value={hora} onChange={(e) => setHora(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Entrevistador *</Label><Select value={entrevistador} onValueChange={setEntrevistador}><SelectTrigger><SelectValue placeholder="Selecione o entrevistador" /></SelectTrigger><SelectContent>{profiles.length === 0 ? <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum usuário cadastrado</div> : profiles.map((p) => <SelectItem key={p.id} value={p.nome}>{p.nome}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Agendado por *</Label><Select value={agendadoPorId} onValueChange={setAgendadoPorId}><SelectTrigger><SelectValue placeholder="Selecione quem agendou" /></SelectTrigger><SelectContent>{activeProfiles.length === 0 ? <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum usuário ativo</div> : activeProfiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent></Select></div>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy || !valid}>{busy ? "Salvando..." : "Salvar"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
