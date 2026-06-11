import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, PhoneCall, CalendarCheck, Clock, Trophy, MapPin } from "lucide-react";
import { STATUS_LABELS, STATUS_TONE, useAuth } from "@/lib/auth";
import { useCandidatosQuery, useCandidatosRealtime, useProfilesLiteQuery } from "@/lib/ats-data";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function DashboardPage() {
  const { data: candidatosPage } = useCandidatosQuery(1, 5000);
  const rows = useMemo(() => candidatosPage?.candidatos ?? [], [candidatosPage]);
  const { data: profiles = [] } = useProfilesLiteQuery();
  const { user, role } = useAuth();
  useCandidatosRealtime();

  const isAdmin = role === "admin";
  const profMap = useMemo(() => new Map(profiles.map((p) => [p.id, p.nome])), [profiles]);

  // Para recrutadores comuns: só ve os próprios.
  const visibleRows = useMemo(
    () => (isAdmin ? rows : rows.filter((r) => r.recrutador_id === user?.id)),
    [rows, isAdmin, user?.id],
  );

  const total = visibleRows.length;
  const aguardando = visibleRows.filter((r) => r.status === "aguardando_contato").length;
  const agendados = visibleRows.filter((r) => r.status === "agendado").length;
  const aguardandoRetorno = visibleRows.filter((r) => r.status === "aguardando_retorno").length;
  const recent = visibleRows.slice(0, 12);

  // Métricas por recrutador
  const now = Date.now();
  const recruiterStats = useMemo(() => {
    const map = new Map<string, { id: string; nome: string; total: number; week: number; month: number }>();
    const source = isAdmin ? rows : visibleRows;
    for (const r of source) {
      const id = r.recrutador_id ?? "sem";
      const nome = id === "sem" ? "Sem recrutador" : profMap.get(id) ?? "—";
      const cur = map.get(id) ?? { id, nome, total: 0, week: 0, month: 0 };
      cur.total += 1;
      const t = new Date(r.created_at).getTime();
      if (now - t <= WEEK_MS) cur.week += 1;
      if (now - t <= MONTH_MS) cur.month += 1;
      map.set(id, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [rows, visibleRows, profMap, isAdmin, now]);

  const myStats = recruiterStats.find((s) => s.id === user?.id);

  // Métricas por UF (top 6)
  const ufStats = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of visibleRows) {
      const uf = r.estado || "—";
      m.set(uf, (m.get(uf) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [visibleRows]);

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-xs text-muted-foreground">
          {isAdmin ? "Visão operacional de toda a equipe" : "Seus números pessoais"} · atualização em tempo real
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat icon={<Users className="size-4" />} label={isAdmin ? "Total candidatos" : "Meus candidatos"} value={total} />
        <Stat icon={<PhoneCall className="size-4" />} label="Aguardando contato" value={aguardando} tone="text-warning" />
        <Stat icon={<CalendarCheck className="size-4" />} label="Agendados" value={agendados} tone="text-primary" />
        <Stat icon={<Clock className="size-4" />} label="Aguardando retorno" value={aguardandoRetorno} tone="text-info" />
      </div>

      {!isAdmin && myStats && (
        <Card className="p-4 mb-6">
          <h2 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Trophy className="size-4 text-primary" /> Sua produtividade
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Esta semana" value={myStats.week} />
            <MiniStat label="Este mês" value={myStats.month} />
            <MiniStat label="Total geral" value={myStats.total} />
          </div>
        </Card>
      )}

      {isAdmin && (
        <Card className="p-4 mb-6">
          <h2 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Trophy className="size-4 text-primary" /> Controle de Currículos
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium w-10">#</th>
                  <th className="text-left py-2 px-2 font-medium">Recrutador</th>
                  <th className="text-right py-2 px-2 font-medium">Semana</th>
                  <th className="text-right py-2 px-2 font-medium">Mês</th>
                  <th className="text-right py-2 px-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {recruiterStats.map((s, i) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-2 px-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 px-2 font-medium">{s.nome}</td>
                    <td className="py-2 px-2 text-right">{s.week}</td>
                    <td className="py-2 px-2 text-right">{s.month}</td>
                    <td className="py-2 px-2 text-right font-semibold">{s.total}</td>
                  </tr>
                ))}
                {!recruiterStats.length && (
                  <tr><td colSpan={5} className="py-6 text-center text-muted-foreground text-sm">Sem dados ainda.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="text-sm font-medium">Últimos candidatos</h2>
            <Link to="/candidatos" className="text-xs text-primary hover:underline">Ver todos</Link>
          </div>
          <div className="divide-y">
            {recent.map((r) => (
              <div key={r.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{r.nome}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {r.telefone || "sem telefone"} · {r.cidade || "—"}{r.estado ? `/${r.estado}` : ""}
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

        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <MapPin className="size-4 text-primary" />
            <h2 className="text-sm font-medium">Distribuição por UF</h2>
          </div>
          <div className="divide-y">
            {ufStats.map(([uf, count]) => (
              <div key={uf} className="px-4 py-2.5 flex items-center justify-between text-sm">
                <span className="font-medium">{uf}</span>
                <span className="text-muted-foreground">{count}</span>
              </div>
            ))}
            {!ufStats.length && (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">Sem dados.</p>
            )}
          </div>
        </Card>
      </div>
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

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-accent/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold mt-0.5">{value}</p>
    </div>
  );
}
