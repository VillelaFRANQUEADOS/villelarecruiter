import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_LABELS, STATUS_ORDER, type CandidatoRow, type CandidatoStatus } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  candidato: CandidatoRow | null;
  onSaved: () => void;
}

export function CandidatoEditDialog({ open, onOpenChange, candidato, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    nome: "", telefone: "", cidade: "", email: "",
    status: "triagem" as CandidatoStatus, observacoes: "",
  });

  const isNew = !candidato;

  useEffect(() => {
    if (!open) return;
    if (candidato) {
      setForm({
        nome: candidato.nome,
        telefone: candidato.telefone ?? "",
        cidade: candidato.cidade ?? "",
        email: candidato.email ?? "",
        status: candidato.status,
        observacoes: candidato.observacoes ?? "",
      });
    } else {
      setForm({ nome: "", telefone: "", cidade: "", email: "", status: "triagem", observacoes: "" });
    }
  }, [candidato, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    let error;
    if (isNew) {
      const { data: u } = await supabase.auth.getUser();
      const payload = { ...form, recrutador_id: u.user?.id ?? null };
      ({ error } = await supabase.from("candidatos").insert(payload));
    } else {
      ({ error } = await supabase.from("candidatos").update(form).eq("id", candidato!.id));
    }
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success(isNew ? "Criado" : "Atualizado"); onSaved(); onOpenChange(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Editar candidato</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2"><Label>Nome</Label><Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Cidade</Label><Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></div>
            <div className="space-y-1.5 col-span-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1.5 col-span-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as CandidatoStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2"><Label>Observações</Label><Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
