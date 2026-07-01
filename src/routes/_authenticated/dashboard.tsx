import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  MapPin,
  PhoneCall,
  Target,
  TrendingUp,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { STATUS_LABELS, STATUS_TONE, useAuth } from "@/lib/auth";
import {
  useCandidatosQuery,
  useCandidatosRealtime,
  useProfilesLiteQuery,
} from "@/lib/ats-data";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

function DashboardPage() {
  const { data: candidatosPage } = useCandidatosQuery(1, 5000, {});
  const rows = useMemo(
    () => candidatosPage?.candidatos ?? [],
    [candidatosPage],
  );
  const { data: profiles = [] } = useProfilesLiteQuery();
  const { user, role } = useAuth();
  useCandidatosRealtime();

  const isAdmin = role === "admin";
  const profMap = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile.nome])),
    [profiles],
  );

  const visibleRows = useMemo(
    () =>
      isAdmin
        ? rows
        : rows.filter((candidate) => candidate.recrutador_id === user?.id),
    [rows, isAdmin, user?.id],
  );

  const dashboard = useMemo(() => {
    const now = Date.now();
    const total = visibleRows.length;
    const aguardandoContato = visibleRows.filter(
      (candidate) => candidate.status === "aguardando_contato",
    ).length;
    const agendados = visibleRows.filter(
      (candidate) => candidate.status === "agendado",
    ).length;
    const aguardandoRetorno = visibleRows.filter(
      (candidate) => candidate.status === "aguardando_retorno",
    ).length;
    const semResponsavel = visibleRows.filter(
      (candidate) => !candidate.recrutador_id,
    ).length;
    const novosSemana = visibleRows.filter((candidate) => {
      const createdAt = new Date(candidate.created_at).getTime();
      return now - createdAt <= WEEK_MS;
    }).length;
    const semanaAnterior = visibleRows.filter((candidate) => {
      const createdAt = new Date(candidate.created_at).getTime();
      const age = now - createdAt;
      return age > WEEK_MS && age <= 2 * WEEK_MS;
    }).length;

    const variacaoSemanal =
      semanaAnterior > 0
        ? Math.round(((novosSemana - semanaAnterior) / semanaAnterior) * 100)
        : novosSemana > 0
          ? 100
          : 0;

    const percentualAgendados =
      total > 0 ? Math.round((agendados / total) * 100) : 0;
    const backlog = aguardandoContato + aguardandoRetorno;

    return {
      total,
      aguardandoContato,
      agendados,
      aguardandoRetorno,
      semResponsavel,
      novosSemana,
      variacaoSemanal,
      percentualAgendados,
      backlog,
    };
  }, [visibleRows]);

  const recruiterStats = useMemo(() => {
    const now = Date.now();
    const source = isAdmin ? rows : visibleRows;
    const map = new Map<
      string,
      {
        id: string;
        nome: string;
        total: number;
        week: number;
        month: number;
        scheduled: number;
        pending: number;
      }
    >();

    for (const candidate of source) {
      const id = candidate.recrutador_id ?? "sem";
      const nome =
        id === "sem" ? "Sem recrutador" : (profMap.get(id) ?? "—");
      const current = map.get(id) ?? {
        id,
        nome,
        total: 0,
        week: 0,
        month: 0,
        scheduled: 0,
        pending: 0,
      };
      const createdAt = new Date(candidate.created_at).getTime();

      current.total += 1;
      if (now - createdAt <= WEEK_MS) current.week += 1;
      if (now - createdAt <= MONTH_MS) current.month += 1;
      if (candidate.status === "agendado") current.scheduled += 1;
      if (
        candidate.status === "aguardando_contato" ||
        candidate.status === "aguardando_retorno"
      ) {
        current.pending += 1;
      }

      map.set(id, current);
    }

    return [...map.values()].sort((a, b) => {
      if (a.id === "sem") return -1;
      if (b.id === "sem") return 1;
      return b.month - a.month;
    });
  }, [rows, visibleRows, profMap, isAdmin]);

  const myStats = recruiterStats.find((stat) => stat.id === user?.id);
  const recent = visibleRows.slice(0, 8);

  const ufStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const candidate of visibleRows) {
      const uf = candidate.estado || "—";
      map.set(uf, (map.get(uf) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [visibleRows]);

  const topUfCount = ufStats[0]?.[1] ?? 1;

  return (
    <main className="mx-auto max-w-[1440px] space-y-6 p-4 lg:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-primary">
            Visão estratégica
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isAdmin ? "Performance do recrutamento" : "Minha performance"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin
              ? "Prioridades do funil, ritmo de entrada e capacidade da equipe."
              : "Seu ritmo, suas prioridades e os próximos candidatos a movimentar."}
          </p>
        </div>
        <Link
          to="/candidatos"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Abrir candidatos
          <ArrowRight className="size-4" />
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StrategicStat
          icon={<Users className="size-4" />}
          label={isAdmin ? "Base ativa" : "Minha carteira"}
          value={dashboard.total}
          detail={`${dashboard.novosSemana} novos nesta semana`}
        />
        <StrategicStat
          icon={<TrendingUp className="size-4" />}
          label="Ritmo semanal"
          value={dashboard.novosSemana}
          detail={`${formatSignedPercentage(dashboard.variacaoSemanal)} vs. semana anterior`}
          tone={
            dashboard.variacaoSemanal >= 0
              ? "text-emerald-600"
              : "text-destructive"
          }
        />
        <StrategicStat
          icon={<Target className="size-4" />}
          label="Agendados no funil"
          value={`${dashboard.percentualAgendados}%`}
          detail={`${dashboard.agendados} candidatos agendados`}
          tone="text-primary"
        />
        <StrategicStat
          icon={<AlertTriangle className="size-4" />}
          label="Backlog de ação"
          value={dashboard.backlog}
          detail="Contato ou retorno pendente"
          tone={dashboard.backlog > 0 ? "text-amber-600" : "text-emerald-600"}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="overflow-hidden">
          <SectionHeader
            eyebrow="Onde agir agora"
            title="Prioridades do funil"
            action={
              <Link
                to="/candidatos"
                className="text-xs font-medium text-primary hover:underline"
              >
                Ver funil completo
              </Link>
            }
          />
          <div className="grid gap-px bg-border sm:grid-cols-3">
            <Priority
              icon={<PhoneCall className="size-5" />}
              label="Iniciar contato"
              value={dashboard.aguardandoContato}
              description="Candidatos aguardando a primeira abordagem."
              className="bg-card"
            />
            <Priority
              icon={<Clock className="size-5" />}
              label="Cobrar retorno"
              value={dashboard.aguardandoRetorno}
              description="Conversas que precisam de acompanhamento."
              className="bg-card"
            />
            <Priority
              icon={<UserRoundCheck className="size-5" />}
              label="Sem responsável"
              value={dashboard.semResponsavel}
              description="Distribua para evitar candidatos sem dono."
              className="bg-card"
            />
          </div>
        </Card>

        {!isAdmin && myStats ? (
          <Card className="overflow-hidden">
            <SectionHeader eyebrow="Cadência" title="Minha produtividade" />
            <div className="grid grid-cols-3 gap-3 p-4">
              <MiniStat label="7 dias" value={myStats.week} />
              <MiniStat label="30 dias" value={myStats.month} />
              <MiniStat label="Agendados" value={myStats.scheduled} />
            </div>
            <p className="border-t px-4 py-3 text-xs text-muted-foreground">
              Você tem{" "}
              <strong className="font-semibold text-foreground">
                {myStats.pending} ações pendentes
              </strong>{" "}
              na carteira.
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <SectionHeader eyebrow="Cobertura" title="Distribuição da carteira" />
            <div className="space-y-4 p-4">
              <ProgressMetric
                label="Com responsável"
                value={dashboard.total - dashboard.semResponsavel}
                total={dashboard.total}
              />
              <ProgressMetric
                label="Com agendamento"
                value={dashboard.agendados}
                total={dashboard.total}
              />
            </div>
          </Card>
        )}
      </section>

      {isAdmin && (
        <Card className="overflow-hidden">
          <SectionHeader
            eyebrow="Capacidade e execução"
            title="Performance por recrutador"
            action={
              <span className="text-xs text-muted-foreground">
                Ordenado por produção em 30 dias
              </span>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">
                    Recrutador
                  </th>
                  <th className="px-4 py-3 text-right font-medium">7 dias</th>
                  <th className="px-4 py-3 text-right font-medium">30 dias</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Agendados
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Pendências
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Carteira</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recruiterStats.map((stat) => (
                  <tr
                    key={stat.id}
                    className={stat.id === "sem" ? "bg-amber-500/5" : ""}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{stat.nome}</span>
                        {stat.id === "sem" && (
                          <Badge variant="outline" className="text-amber-600">
                            Atenção
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">{stat.week}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {stat.month}
                    </td>
                    <td className="px-4 py-3 text-right text-primary">
                      {stat.scheduled}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={
                          stat.pending > 0
                            ? "font-medium text-amber-600"
                            : "text-muted-foreground"
                        }
                      >
                        {stat.pending}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {stat.total}
                    </td>
                  </tr>
                ))}
                {!recruiterStats.length && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      Sem dados para analisar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <Card className="overflow-hidden">
          <SectionHeader
            eyebrow="Movimentação recente"
            title="Últimos candidatos"
            action={
              <Link
                to="/candidatos"
                className="text-xs font-medium text-primary hover:underline"
              >
                Ver todos
              </Link>
            }
          />
          <div className="divide-y">
            {recent.map((candidate) => (
              <div
                key={candidate.id}
                className="flex items-center gap-3 px-4 py-3 text-sm"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted font-medium">
                  {getInitials(candidate.nome)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{candidate.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {candidate.cidade || "Cidade não informada"}
                    {candidate.estado ? `/${candidate.estado}` : ""}
                    {isAdmin && candidate.recrutador_id
                      ? ` · ${profMap.get(candidate.recrutador_id) ?? "—"}`
                      : ""}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={STATUS_TONE[candidate.status]}
                >
                  {STATUS_LABELS[candidate.status]}
                </Badge>
              </div>
            ))}
            {!recent.length && (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nenhum candidato disponível para análise.
              </p>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <SectionHeader
            eyebrow="Concentração geográfica"
            title="Principais estados"
            icon={<MapPin className="size-4 text-primary" />}
          />
          <div className="space-y-4 p-4">
            {ufStats.map(([uf, count]) => (
              <div key={uf}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium">{uf}</span>
                  <span className="text-muted-foreground">{count}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(count / topUfCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {!ufStats.length && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Sem dados geográficos.
              </p>
            )}
          </div>
        </Card>
      </section>
    </main>
  );
}

function StrategicStat({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  detail: string;
  tone?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      <p className={`mt-1 text-xs ${tone ?? "text-muted-foreground"}`}>
        {detail}
      </p>
    </Card>
  );
}

function SectionHeader({
  eyebrow,
  title,
  action,
  icon,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {eyebrow}
        </p>
        <h2 className="mt-0.5 flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

function Priority({
  icon,
  label,
  value,
  description,
  className,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  description: string;
  className?: string;
}) {
  return (
    <div className={`p-4 ${className ?? ""}`}>
      <div className="mb-4 flex items-start justify-between">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-2xl font-semibold">{value}</span>
      </div>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function ProgressMetric({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{percentage}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function formatSignedPercentage(value: number) {
  return `${value > 0 ? "+" : ""}${value}%`;
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
