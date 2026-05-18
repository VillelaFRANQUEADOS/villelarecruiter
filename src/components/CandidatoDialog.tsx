import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, STATUS_LABELS } from "@/lib/auth";
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
import { Upload, FileText } from "lucide-react";

import type { Database } from "@/integrations/supabase/types";
export type CandidatoStatus = Database["public"]["Enums"]["candidato_status"];
export interface CandidatoRow {
  id: string;
  nome: string;
  telefone: string;
  cidade: string;
  regiao: string;
  vaga: string;
  status: CandidatoStatus;
  observacoes: string | null;
  curriculo_url: string | null;
  recrutador_id: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  candidato?: CandidatoRow | null;
  onSaved: () => void;
}

export function CandidatoDialog({ open, onOpenChange, candidato, onSaved }: Props) {
  const { user, role } = useAuth();
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<{
    nome: string; telefone: string; cidade: string; regiao: string;
    vaga: string; status: CandidatoStatus; observacoes: string;
  }>({
    nome: "", telefone: "", cidade: "", regiao: "", vaga: "",
    status: "novo", observacoes: "",
  });

  useEffect(() => {
    if (candidato) {
      setForm({
        nome: candidato.nome, telefone: candidato.telefone, cidade: candidato.cidade,
        regiao: candidato.regiao, vaga: candidato.vaga, status: candidato.status,
        observacoes: candidato.observacoes ?? "",
      });
    } else {
      setForm({ nome: "", telefone: "", cidade: "", regiao: "", vaga: "", status: "novo", observacoes: "" });
    }
    setFile(null);
  }, [candidato, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      let curriculo_url = candidato?.curriculo_url ?? null;
      if (file) {
        if (file.type !== "application/pdf") throw new Error("Envie um PDF");
        if (file.size > 10 * 1024 * 1024) throw new Error("PDF máx 10MB");
        const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("curriculos").upload(path, file, {
          contentType: "application/pdf", upsert: false,
        });
        if (upErr) throw upErr;
        curriculo_url = path;
      }
      if (candidato) {
        const { error } = await supabase.from("candidatos").update({
          ...form, curriculo_url,
        }).eq("id", candidato.id);
        if (error) throw error;
        toast.success("Candidato atualizado");
      } else {
        const recrutador_id = user.id;
        void role;
        const { error } = await supabase.from("candidatos").insert({
          ...form, curriculo_url, recrutador_id,
        });
        if (error) throw error;
        toast.success("Candidato cadastrado");
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{candidato ? "Editar candidato" : "Novo candidato"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nome"><Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Field>
            <Field label="Telefone"><Input required value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></Field>
            <Field label="Cidade"><Input required value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></Field>
            <Field label="Região"><Input required value={form.regiao} onChange={(e) => setForm({ ...form, regiao: e.target.value })} /></Field>
            <Field label="Vaga"><Input required value={form.vaga} onChange={(e) => setForm({ ...form, vaga: e.target.value })} /></Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as CandidatoStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Observações">
            <Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </Field>
          <Field label="Currículo (PDF)">
            <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-dashed border-input px-4 py-3 hover:bg-accent/50 transition">
              <Upload className="size-4 text-muted-foreground" />
              <span className="text-sm">
                {file ? file.name : candidato?.curriculo_url ? "PDF já anexado — escolha outro para substituir" : "Selecionar PDF"}
              </span>
              <input type="file" accept="application/pdf" className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            {candidato?.curriculo_url && !file && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <FileText className="size-3" /> Arquivo atual mantido
              </p>
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
