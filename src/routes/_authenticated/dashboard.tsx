import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, PhoneCall, CalendarCheck, RotateCcw } from "lucide-react";
import { STATUS_LABELS, STATUS_TONE } from "@/lib/auth";
import { useCandidatosQuery, useCandidatosRealtime } from "@/lib/ats-data";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data: rows = [] } = useCandidatosQuery();
  useCandidatosRealtime();

  const total = rows.length;
  const aguardando = rows.filter(r => r.status === "aguardando_contato").length;
  const agendados = rows.filter(r => r.status === "agendado").length;
  const remarcar = rows.filter(r => r.status === "remarcar").length;
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
        <Stat icon={<RotateCcw className="size-4" />} label="Para remarcar" value={remarcar} tone="text-info" />
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
