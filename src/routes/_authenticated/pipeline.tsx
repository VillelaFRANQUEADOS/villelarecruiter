import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { STATUS_ORDER, STATUS_LABELS } from "@/lib/auth";
import { toast } from "sonner";
import type { CandidatoRow, CandidatoStatus } from "@/components/CandidatoDialog";

export const Route = createFileRoute("/_authenticated/pipeline")({
  component: PipelinePage,
});

function PipelinePage() {
  const [rows, setRows] = useState<CandidatoRow[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("candidatos").select("*").order("created_at", { ascending: false }).limit(1000);
    setRows((data as CandidatoRow[]) ?? []);
  }
  useEffect(() => {
    load();
    const ch = supabase.channel("pipe").on("postgres_changes", { event: "*", schema: "public", table: "candidatos" }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function moveTo(id: string, status: CandidatoStatus) {
    const { error } = await supabase.from("candidatos").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success(`Movido para ${STATUS_LABELS[status]}`);
  }

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <p className="text-sm text-muted-foreground mt-1">Arraste candidatos entre as etapas.</p>
      </header>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUS_ORDER.map(status => {
          const cards = rows.filter(r => r.status === status);
          return (
            <div
              key={status}
              className="shrink-0 w-72"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragId) { moveTo(dragId, status); setDragId(null); } }}
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{STATUS_LABELS[status]}</h2>
                <span className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full">{cards.length}</span>
              </div>
              <div className="space-y-2 min-h-[200px]">
                {cards.map(c => (
                  <Card
                    key={c.id}
                    draggable
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => setDragId(null)}
                    className="p-3 cursor-grab active:cursor-grabbing hover:border-primary/50 transition"
                  >
                    <p className="font-medium text-sm">{c.nome}</p>
                    <p className="text-xs text-muted-foreground mt-1">{c.vaga}</p>
                    <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                      <span>{c.cidade}</span>
                      <span>·</span>
                      <span>{c.telefone}</span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
