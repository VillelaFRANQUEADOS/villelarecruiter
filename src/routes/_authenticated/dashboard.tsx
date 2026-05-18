import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, PhoneCall, CalendarCheck, CheckCircle2 } from "lucide-react";
import { STATUS_LABELS, STATUS_TONE, type CandidatoRow } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const [rows, setRows] = useState<CandidatoRow[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("candidatos").select("*").order("created_at", { ascending: false }).limit(500);
      setRows((data as CandidatoRow[]) ?? []);
    };
    load();
    const ch = supabase.channel("dash")
      .on("postgres_changes", { event: "*", schema: "public", table: "candidatos" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const total = rows.length;
  const aguardando = rows.filter(r => r.status === "aguardando_contato").length;
  const agendados = rows.filter(r => r.status === "agendado").length;
  const compareceram = rows.filter(r => r.status === "compareceu").length;
  const recent = rows.slice(0, 12);

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-xs text-muted-foreground">Visão operacional</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat icon={<Users className="size-4" />} label="Total candidatos" value={total} />
        <Stat icon={<PhoneCall className="size-4" />} label="Aguardando contato" value={aguardando} tone="text-warning" />
        <Stat icon={<CalendarCheck className="size-4" />} label="Agendados" value={agendados} tone="text-primary" />
        <Stat icon={<CheckCircle2 className="size-4" />} label="Compareceram" value={compareceram} tone="text-success" />
      </div>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="text-sm font-medium">Últimos candidatos</h2>
          <Link to="/candidatos" className="text-xs text-primary hover:underline">Ver todos</Link>
        </div>
        <div className="divide-y">
          {recent.map(r => (
            <div key={r.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{r.nome}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {r.telefone || "sem telefone"} · {r.cidade || "—"}
                </p>
              </div>
              <Badge variant="outline" className={STATUS_TONE[r.status]}>{STATUS_LABELS[r.status]}</Badge>
            </div>
          ))}
          {!recent.length && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nenhum candidato ainda. Vá em <Link to="/candidatos" className="text-primary hover:underline">Candidatos</Link> e arraste PDFs.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: string }) {
  return (
    <Card className="p-4">
      <div className={`flex items-center gap-2 text-xs text-muted-foreground ${tone ?? ""}`}>
        {icon}{label}
      </div>
      <p className="text-2xl font-semibold mt-1">{value}</p>
    </Card>
  );
}
