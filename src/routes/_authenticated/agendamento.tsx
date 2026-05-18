import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STATUS_LABELS } from "@/lib/auth";
import { toast } from "sonner";
import { Phone, CheckCircle2 } from "lucide-react";
import type { CandidatoRow } from "@/components/CandidatoDialog";

export const Route = createFileRoute("/_authenticated/agendamento")({
  component: AgendamentoPage,
});

const PENDING: ("novo" | "triagem" | "aguardando_contato")[] = ["novo", "triagem", "aguardando_contato"];

function AgendamentoPage() {
  const [rows, setRows] = useState<CandidatoRow[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; nome: string }[]>([]);

  async function load() {
    const { data } = await supabase.from("candidatos").select("*")
      .in("status", PENDING).order("created_at", { ascending: true }).limit(1000);
    setRows((data as CandidatoRow[]) ?? []);
    const { data: p } = await supabase.from("profiles").select("id,nome");
    setProfiles(p ?? []);
  }
  useEffect(() => {
    load();
    const ch = supabase.channel("agend").on("postgres_changes", { event: "*", schema: "public", table: "candidatos" }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const profMap = useMemo(() => new Map(profiles.map(p => [p.id, p.nome])), [profiles]);

  async function markAgendado(id: string) {
    const { error } = await supabase.from("candidatos").update({ status: "agendado" }).eq("id", id);
    if (error) toast.error(error.message); else toast.success("Marcado como agendado");
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Agendamento</h1>
        <p className="text-sm text-muted-foreground mt-1">{rows.length} candidatos pendentes para contato e agendamento.</p>
      </header>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-accent/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Candidato</th>
                <th className="text-left px-4 py-3 font-medium">Telefone</th>
                <th className="text-left px-4 py-3 font-medium">Cidade / Região</th>
                <th className="text-left px-4 py-3 font-medium">Recrutador</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t hover:bg-accent/20">
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.nome}</p>
                    <p className="text-xs text-muted-foreground">{r.vaga}</p>
                  </td>
                  <td className="px-4 py-3">
                    <a href={`tel:${r.telefone}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                      <Phone className="size-3.5" /> {r.telefone}
                    </a>
                  </td>
                  <td className="px-4 py-3">{r.cidade} <span className="text-muted-foreground">· {r.regiao}</span></td>
                  <td className="px-4 py-3 text-muted-foreground">{r.recrutador_id ? profMap.get(r.recrutador_id) ?? "—" : "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">
                      {STATUS_LABELS[r.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" onClick={() => markAgendado(r.id)}>
                      <CheckCircle2 className="size-4 mr-1" /> Marcar agendado
                    </Button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Nenhum candidato pendente. Tudo em dia! 🎉</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
