import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Users, MapPin, UserCheck, CalendarClock, Clock } from "lucide-react";
import { STATUS_LABELS } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

interface Profile { id: string; nome: string }

function Dashboard() {
  const [counts, setCounts] = useState({ total: 0, pendentes: 0, agendados: 0, compareceram: 0 });
  const [porRegiao, setPorRegiao] = useState<{ regiao: string; n: number }[]>([]);
  const [porRecrutador, setPorRecrutador] = useState<{ nome: string; n: number }[]>([]);
  const [porStatus, setPorStatus] = useState<Record<string, number>>({});

  async function load() {
    const { data: cands } = await supabase
      .from("candidatos")
      .select("id,status,regiao,recrutador_id")
      .limit(1000);
    if (!cands) return;
    const { data: profs } = await supabase.from("profiles").select("id,nome");
    const profMap = new Map<string, string>((profs ?? []).map((p: Profile) => [p.id, p.nome]));

    setCounts({
      total: cands.length,
      pendentes: cands.filter(c => ["novo", "triagem", "aguardando_contato"].includes(c.status)).length,
      agendados: cands.filter(c => c.status === "agendado").length,
      compareceram: cands.filter(c => c.status === "compareceu").length,
    });

    const reg = new Map<string, number>();
    const rec = new Map<string, number>();
    const st: Record<string, number> = {};
    cands.forEach(c => {
      reg.set(c.regiao, (reg.get(c.regiao) ?? 0) + 1);
      const rn = c.recrutador_id ? (profMap.get(c.recrutador_id) ?? "—") : "Sem recrutador";
      rec.set(rn, (rec.get(rn) ?? 0) + 1);
      st[c.status] = (st[c.status] ?? 0) + 1;
    });
    setPorRegiao([...reg.entries()].map(([regiao, n]) => ({ regiao, n })).sort((a, b) => b.n - a.n));
    setPorRecrutador([...rec.entries()].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n));
    setPorStatus(st);
  }

  useEffect(() => {
    load();
    const ch = supabase.channel("dash-candidatos")
      .on("postgres_changes", { event: "*", schema: "public", table: "candidatos" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Visão geral da operação de recrutamento.</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat icon={Users} label="Total de candidatos" value={counts.total} tone="primary" />
        <Stat icon={Clock} label="Pendentes" value={counts.pendentes} tone="warning" />
        <Stat icon={CalendarClock} label="Agendados" value={counts.agendados} tone="info" />
        <Stat icon={UserCheck} label="Compareceram" value={counts.compareceram} tone="success" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2"><MapPin className="size-4" /> Por região</h2>
          <BarList data={porRegiao.map(r => ({ label: r.regiao, value: r.n }))} />
        </Card>
        <Card className="p-6">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2"><Users className="size-4" /> Por recrutador</h2>
          <BarList data={porRecrutador.map(r => ({ label: r.nome, value: r.n }))} />
        </Card>
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-sm font-semibold mb-4">Por etapa do pipeline</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {Object.entries(STATUS_LABELS).map(([k, l]) => (
              <div key={k} className="rounded-lg border bg-accent/20 px-3 py-3 text-center">
                <p className="text-2xl font-semibold">{porStatus[k] ?? 0}</p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{l}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; tone: "primary" | "success" | "warning" | "info" }) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning",
    info: "bg-info/10 text-info",
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="text-3xl font-semibold mt-2">{value}</p>
        </div>
        <div className={`size-10 rounded-lg grid place-items-center ${tones[tone]}`}>
          <Icon className="size-5" />
        </div>
      </div>
    </Card>
  );
}

function BarList({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map(d => d.value));
  if (!data.length) return <p className="text-sm text-muted-foreground">Sem dados.</p>;
  return (
    <div className="space-y-3">
      {data.slice(0, 8).map((d) => (
        <div key={d.label}>
          <div className="flex justify-between text-sm mb-1">
            <span className="truncate">{d.label}</span>
            <span className="text-muted-foreground tabular-nums">{d.value}</span>
          </div>
          <div className="h-2 bg-accent/40 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
