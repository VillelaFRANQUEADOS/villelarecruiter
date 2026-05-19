import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  STATUS_ORDER, STATUS_LABELS,
  type CandidatoRow, type CandidatoStatus,
} from "@/lib/auth";
import { useCandidatosQuery, useCandidatosRealtime, useProfilesLiteQuery } from "@/lib/ats-data";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/pipeline")({
  component: PipelinePage,
});

function PipelinePage() {
  const { data: rows = [] } = useCandidatosQuery();
  const { data: profiles = [] } = useProfilesLiteQuery();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<CandidatoStatus | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useCandidatosRealtime();

  const profMap = useMemo(() => new Map(profiles.map(p => [p.id, p.nome])), [profiles]);

  async function move(id: string, status: CandidatoStatus) {
    const { error } = await supabase.from("candidatos").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function bulkMove(status: CandidatoStatus) {
    const ids = [...selected];
    if (!ids.length) return;
    const { error } = await supabase.from("candidatos").update({ status }).in("id", ids);
    if (error) toast.error(error.message);
    else { toast.success(`${ids.length} candidato(s) movidos`); setSelected(new Set()); }
  }

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const grouped = useMemo(() => {
    const m: Record<CandidatoStatus, CandidatoRow[]> = {} as never;
    STATUS_ORDER.forEach((s) => (m[s] = []));
    rows.forEach((r) => m[r.status]?.push(r));
    return m;
  }, [rows]);

  return (
    <div className="p-4 lg:p-6 max-w-full">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-xs text-muted-foreground">{rows.length} candidatos</p>
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{selected.size} selecionado(s)</span>
            <Select onValueChange={(v) => bulkMove(v as CandidatoStatus)}>
              <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Mover para..." /></SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpar</Button>
          </div>
        )}
      </header>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {STATUS_ORDER.map((status) => (
          <div
            key={status}
            onDragOver={(e) => { e.preventDefault(); setDragOver(status); }}
            onDragLeave={() => setDragOver((s) => s === status ? null : s)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              if (dragId) move(dragId, status);
              setDragId(null);
            }}
            className={`shrink-0 w-72 rounded-lg border bg-card/40 ${dragOver === status ? "ring-2 ring-primary" : ""}`}
          >
            <div className="px-3 py-2 border-b flex items-center justify-between">
              <h3 className="text-sm font-medium">{STATUS_LABELS[status]}</h3>
              <span className="text-xs text-muted-foreground">{grouped[status]?.length ?? 0}</span>
            </div>
            <div className="p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-220px)] overflow-y-auto">
              {grouped[status]?.map((r) => (
                <Card
                  key={r.id}
                  draggable
                  onDragStart={() => setDragId(r.id)}
                  onDragEnd={() => setDragId(null)}
                  className={`p-2.5 cursor-grab active:cursor-grabbing hover:shadow-sm transition ${selected.has(r.id) ? "ring-2 ring-primary" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    <Checkbox
                      className="mt-0.5"
                      checked={selected.has(r.id)}
                      onCheckedChange={() => toggle(r.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.nome}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.telefone || "sem telefone"}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.cidade || "—"}</p>
                      <p className="text-[10px] text-muted-foreground/80 mt-1 truncate">
                        {r.recrutador_id ? profMap.get(r.recrutador_id) ?? "—" : "—"}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
              {!grouped[status]?.length && (
                <p className="text-xs text-muted-foreground text-center py-6">vazio</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
