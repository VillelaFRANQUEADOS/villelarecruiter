import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  Download,
  MapPin,
  PhoneCall,
  RotateCcw,
  Target,
  TrendingUp,
  UserRoundCheck,
  Users,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  LineChart,
  Line,
} from "recharts";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  STATUS_TONE,
  UF_LIST,
  useAuth,
  type CandidatoStatus,
} from "@/lib/auth";
import { MultiSelect } from "@/components/MultiSelect";
import { ORIGEM_VALUES, ORIGEM_LABELS } from "@/lib/city-validation";
import {
  useCandidatosOptionsQuery,
  useCandidatosRealtime,
  useDashboardCandidatosQuery,
  useProfilesLiteQuery,
  type CandidatosFilters,
  type DashboardRow,
} from "@/lib/ats-data";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_COLORS: Record<string, string> = {
  aguardando_contato: "var(--color-chart-1, #f59e0b)",
  aguardando_retorno: "var(--color-chart-2, #64748b)",
  sem_interesse: "var(--color-chart-3, #ef4444)",
  agendado: "var(--color-chart-4, #10b981)",
};

const CHART_PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#0ea5e9", "#a855f7", "#14b8a6", "#f97316"];

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Preset = "7" | "30" | "90" | "all" | "custom";

function DashboardPage() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  useCandidatosRealtime();

  const { data: profiles = [] } = useProfilesLiteQuery();
  const { data: options } = useCandidatosOptionsQuery();

  // ---- Filtros globais -----------------------------------------------------
  const [preset, setPreset] = useState<Preset>("30");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fEstados, setFEstados] = useState<string[]>([]);
  const [fCidades, setFCidades] = useState<string[]>([]);
  const [fOrigens, setFOrigens] = useState<string[]>([]);
  const [fRecrutadores, setFRecrutadores] = useState<string[]>([]);
  const [fVaga, setFVaga] = useState("");

  const { today, todayStr, weekStart, weekEnd } = useMemo(() => {
    const now = new Date();
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = t.getDay();
    const ws = new Date(t);
    ws.setDate(t.getDate() + (day === 0 ? -6 : 1 - day));
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);
    return { today: t, todayStr: fmtDate(t), weekStart: fmtDate(ws), weekEnd: fmtDate(we) };
  }, []);

  const range = useMemo(() => {
    if (preset === "custom") return { from: dateFrom, to: dateTo };
    if (preset === "all") return { from: "", to: "" };
    const days = Number(preset);
    const from = new Date(today.getTime() - (days - 1) * DAY_MS);
    return { from: fmtDate(from), to: "" };
  }, [preset, dateFrom, dateTo, today]);

  // Recrutador só enxerga a própria carteira.
  const effectiveRecrutadores = useMemo(
    () => (isAdmin ? fRecrutadores : user?.id ? [user.id] : []),
    [isAdmin, fRecrutadores, user?.id],
  );

  const filters: CandidatosFilters = useMemo(
    () => ({
      estados: fEstados,
      cidades: fCidades,
      origens: fOrigens,
      recrutadores: effectiveRecrutadores,
      vaga: fVaga,
      dateFrom: range.from,
      dateTo: range.to,
    }),
    [fEstados, fCidades, fOrigens, effectiveRecrutadores, fVaga, range.from, range.to],
  );

  const { data: rows = [], isFetching } = useDashboardCandidatosQuery(filters);

  // Search params compartilhados com a tela de Candidatos.
  const baseSearch = useMemo(
    () => ({
      status: [] as string[],
      estado: fEstados,
      cidade: fCidades,
      origem: fOrigens,
      recrutador: effectiveRecrutadores,
      entrevistador: [] as string[],
      vaga: fVaga,
      dateFrom: range.from,
      dateTo: range.to,
      entrevistaQuando: "",
    }),
    [fEstados, fCidades, fOrigens, effectiveRecrutadores, fVaga, range.from, range.to],
  );

  const profMap = useMemo(() => new Map(profiles.map((p) => [p.id, p.nome])), [profiles]);

  // ---- Agregações ----------------------------------------------------------
  const stats = useMemo(() => {
    const byStatus = new Map<string, number>();
    const byUf = new Map<string, number>();
    const byOrigem = new Map<string, number>();
    const byRecrutador = new Map<string, { total: number; agendado: number; contato: number }>();
    const byDay = new Map<string, number>();
    const byVaga = new Map<string, number>();
    let semCidade = 0;
    let semTelefoneOuEmail = 0;
    let entrevistasHoje = 0;
    let entrevistasSemana = 0;
    let atrasadas = 0;
    let novos7d = 0;
    let novos30d = 0;

    const now = Date.now();
    for (const r of rows as DashboardRow[]) {
      byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
      const uf = (r.estado || "").trim().toUpperCase();
      if (uf) byUf.set(uf, (byUf.get(uf) ?? 0) + 1);
      else semCidade++;
      const og = r.origem_curriculo || "OUTROS";
      byOrigem.set(og, (byOrigem.get(og) ?? 0) + 1);
      const rid = r.recrutador_id ?? "__none";
      const cur = byRecrutador.get(rid) ?? { total: 0, agendado: 0, contato: 0 };
      cur.total++;
      if (r.status === "agendado") cur.agendado++;
      if (r.status !== "aguardando_contato") cur.contato++;
      byRecrutador.set(rid, cur);
      const day = r.created_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
      if (r.vaga?.trim()) byVaga.set(r.vaga.trim(), (byVaga.get(r.vaga.trim()) ?? 0) + 1);

      const age = now - new Date(r.created_at).getTime();
      if (age <= 7 * DAY_MS) novos7d++;
      if (age <= 30 * DAY_MS) novos30d++;
      if (r.status === "aguardando_contato" && age > 3 * DAY_MS) atrasadas++;

      if (r.data_entrevista) {
        if (r.data_entrevista === todayStr) entrevistasHoje++;
        if (r.data_entrevista >= weekStart && r.data_entrevista <= weekEnd) entrevistasSemana++;
      }
    }

    const total = rows.length;
    const agendados = byStatus.get("agendado") ?? 0;
    const semInteresse = byStatus.get("sem_interesse") ?? 0;
    const trabalhados = total - (byStatus.get("aguardando_contato") ?? 0);

    const dias: { dia: string; label: string; novos: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY_MS);
      const key = fmtDate(d);
      dias.push({
        dia: key,
        label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
        novos: byDay.get(key) ?? 0,
      });
    }

    return {
      total,
      agendados,
      semInteresse,
      trabalhados,
      novos7d,
      novos30d,
      atrasadas,
      semCidade,
      semTelefoneOuEmail,
      entrevistasHoje,
      entrevistasSemana,
      taxaAgendamento: total ? Math.round((agendados / total) * 100) : 0,
      taxaContato: total ? Math.round((trabalhados / total) * 100) : 0,
      statusData: STATUS_ORDER.map((s) => ({
        key: s,
        name: STATUS_LABELS[s],
        value: byStatus.get(s) ?? 0,
      })),
      ufData: [...byUf.entries()]
        .map(([uf, qtd]) => ({ uf, qtd }))
        .sort((a, b) => b.qtd - a.qtd)
        .slice(0, 10),
      origemData: ORIGEM_VALUES.map((o) => ({ key: o, name: ORIGEM_LABELS[o], qtd: byOrigem.get(o) ?? 0 })).filter(
        (d) => d.qtd > 0,
      ),
      vagaData: [...byVaga.entries()]
        .map(([vaga, qtd]) => ({ vaga, qtd }))
        .sort((a, b) => b.qtd - a.qtd)
        .slice(0, 8),
      recrutadorData: [...byRecrutador.entries()]
        .map(([id, v]) => ({
          id,
          nome: id === "__none" ? "Sem recrutador" : profMap.get(id) ?? "Desconhecido",
          ...v,
          taxa: v.total ? Math.round((v.agendado / v.total) * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total),
      timeline: dias,
    };
  }, [rows, profMap, today, todayStr, weekStart, weekEnd]);

  function resetFilters() {
    setPreset("30");
    setDateFrom("");
    setDateTo("");
    setFEstados([]);
    setFCidades([]);
    setFOrigens([]);
    setFRecrutadores([]);
    setFVaga("");
  }

  function exportCsv() {
    const header = ["Nome", "Status", "Estado", "Cidade", "Vaga", "Origem", "Recrutador", "Criado em", "Entrevista"];
    const lines = (rows as DashboardRow[]).map((r) =>
      [
        r.nome,
        STATUS_LABELS[r.status as CandidatoStatus] ?? r.status,
        r.estado ?? "",
        r.cidade ?? "",
        r.vaga ?? "",
        r.origem_curriculo,
        r.recrutador_id ? profMap.get(r.recrutador_id) ?? "" : "",
        new Date(r.created_at).toLocaleString("pt-BR"),
        r.data_entrevista ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";"),
    );
    const blob = new Blob(["\uFEFF" + [header.join(";"), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dashboard-candidatos-${todayStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-xs text-muted-foreground">
            {isFetching ? "Atualizando..." : `${stats.total} candidato(s) na base filtrada · tempo real ativo`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={resetFilters}>
            <RotateCcw className="size-3.5 mr-1" /> Limpar
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!stats.total}>
            <Download className="size-3.5 mr-1" /> Exportar CSV
          </Button>
        </div>
      </header>

      {/* Filtros globais */}
      <Card className="p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {([
            ["7", "7 dias"],
            ["30", "30 dias"],
            ["90", "90 dias"],
            ["all", "Tudo"],
          ] as [Preset, string][]).map(([v, label]) => (
            <Button
              key={v}
              size="sm"
              variant={preset === v ? "default" : "outline"}
              className="h-9"
              onClick={() => setPreset(v)}
            >
              {label}
            </Button>
          ))}
          <Input
            type="date"
            className="h-9 w-[150px]"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPreset("custom");
            }}
          />
          <Input
            type="date"
            className="h-9 w-[150px]"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPreset("custom");
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelect
            className="w-40"
            placeholder="UF"
            value={fEstados}
            onChange={setFEstados}
            options={UF_LIST.map((u) => ({ value: u, label: u }))}
          />
          <MultiSelect
            className="w-56"
            placeholder="Cidades"
            value={fCidades}
            onChange={setFCidades}
            options={options?.cidades ?? []}
          />
          <MultiSelect
            className="w-44"
            placeholder="Origem"
            value={fOrigens}
            onChange={setFOrigens}
            searchable={false}
            options={ORIGEM_VALUES.map((o) => ({ value: o, label: ORIGEM_LABELS[o] }))}
          />
          {isAdmin && (
            <MultiSelect
              className="w-56"
              placeholder="Recrutadores"
              value={fRecrutadores}
              onChange={setFRecrutadores}
              options={profiles.map((p) => ({ value: p.id, label: p.nome }))}
            />
          )}
          <Input
            className="h-9 w-48"
            placeholder="Vaga"
            value={fVaga}
            onChange={(e) => setFVaga(e.target.value)}
          />
        </div>
      </Card>

      {/* KPIs clicáveis */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          to={{ ...baseSearch }}
          icon={<Users className="size-4" />}
          label="Total de candidatos"
          value={stats.total}
          hint={`${stats.novos7d} novos em 7 dias`}
        />
        <KpiCard
          to={{ ...baseSearch, status: ["aguardando_contato"] }}
          icon={<PhoneCall className="size-4" />}
          label="Aguardando contato"
          value={stats.statusData.find((s) => s.key === "aguardando_contato")?.value ?? 0}
          hint={`${stats.atrasadas} há mais de 3 dias`}
        />
        <KpiCard
          to={{ ...baseSearch, status: ["agendado"] }}
          icon={<UserRoundCheck className="size-4" />}
          label="Agendados"
          value={stats.agendados}
          hint={`Taxa de agendamento ${stats.taxaAgendamento}%`}
        />
        <KpiCard
          to={{ ...baseSearch, status: ["agendado"], entrevistaQuando: "hoje" }}
          icon={<CalendarDays className="size-4" />}
          label="Entrevistas hoje"
          value={stats.entrevistasHoje}
          hint={`${stats.entrevistasSemana} nesta semana`}
        />
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          to={{ ...baseSearch, status: ["aguardando_retorno"] }}
          icon={<CalendarClock className="size-4" />}
          label="Aguardando retorno"
          value={stats.statusData.find((s) => s.key === "aguardando_retorno")?.value ?? 0}
        />
        <KpiCard
          to={{ ...baseSearch, status: ["sem_interesse"] }}
          icon={<Target className="size-4" />}
          label="Sem interesse"
          value={stats.semInteresse}
        />
        <KpiCard
          to={{ ...baseSearch }}
          icon={<TrendingUp className="size-4" />}
          label="Taxa de contato"
          value={`${stats.taxaContato}%`}
          hint={`${stats.trabalhados} trabalhados`}
        />
        <KpiCard
          to={{ ...baseSearch }}
          icon={<MapPin className="size-4" />}
          label="Sem UF definida"
          value={stats.semCidade}
          hint="Precisa de reprocessamento"
        />
      </div>

      {/* Gráficos */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-2">Distribuição por status</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.statusData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {stats.statusData.map((s, i) => (
                    <Cell key={s.key} fill={STATUS_COLORS[s.key] ?? CHART_PALETTE[i % CHART_PALETTE.length]} />
                  ))}
                </Pie>
                <RTooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {stats.statusData.map((s) => (
              <Link
                key={s.key}
                to="/candidatos"
                search={{ ...baseSearch, status: [s.key] }}
                className="inline-flex"
              >
                <Badge variant="outline" className={`text-[11px] ${STATUS_TONE[s.key as CandidatoStatus]}`}>
                  {s.name}: {s.value}
                </Badge>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-2">Evolução de novos candidatos (30 dias)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.timeline}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={4} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <RTooltip />
                <Line type="monotone" dataKey="novos" stroke="#6366f1" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-2">Top 10 estados (UF)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.ufData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="uf" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <RTooltip />
                <Bar dataKey="qtd" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {stats.ufData.map((u) => (
              <Link key={u.uf} to="/candidatos" search={{ ...baseSearch, estado: [u.uf] }}>
                <Badge variant="secondary" className="text-[11px]">{u.uf}: {u.qtd}</Badge>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-2">Origem dos currículos</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.origemData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                <RTooltip />
                <Bar dataKey="qtd" radius={[0, 4, 4, 0]}>
                  {stats.origemData.map((_, i) => (
                    <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Ranking recrutadores */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-3">
          {isAdmin ? "Produtividade por recrutador" : "Sua produtividade"}
        </h2>
        {stats.recrutadorData.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem dados no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-2">Recrutador</th>
                  <th className="py-2">Total</th>
                  <th className="py-2">Trabalhados</th>
                  <th className="py-2">Agendados</th>
                  <th className="py-2">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {stats.recrutadorData.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2">
                      {r.id === "__none" ? (
                        r.nome
                      ) : (
                        <Link
                          to="/candidatos"
                          search={{ ...baseSearch, recrutador: [r.id] }}
                          className="hover:underline"
                        >
                          {r.nome}
                        </Link>
                      )}
                    </td>
                    <td className="py-2">{r.total}</td>
                    <td className="py-2">{r.contato}</td>
                    <td className="py-2">{r.agendado}</td>
                    <td className="py-2">
                      <Badge variant="outline" className="text-[11px]">{r.taxa}%</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Insights e alertas */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-2">Top vagas</h2>
          {stats.vagaData.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma vaga informada no período.</p>
          ) : (
            <ul className="space-y-1.5">
              {stats.vagaData.map((v) => (
                <li key={v.vaga} className="flex items-center justify-between text-sm">
                  <Link to="/candidatos" search={{ ...baseSearch, vaga: v.vaga }} className="truncate hover:underline">
                    {v.vaga}
                  </Link>
                  <Badge variant="secondary" className="text-[11px]">{v.qtd}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <AlertTriangle className="size-4 text-warning" /> Alertas
          </h2>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span>Aguardando contato há mais de 3 dias</span>
              <Link to="/candidatos" search={{ ...baseSearch, status: ["aguardando_contato"] }}>
                <Badge variant="outline" className="text-[11px]">{stats.atrasadas}</Badge>
              </Link>
            </li>
            <li className="flex items-center justify-between">
              <span>Candidatos sem UF identificada</span>
              <Badge variant="outline" className="text-[11px]">{stats.semCidade}</Badge>
            </li>
            <li className="flex items-center justify-between">
              <span>Entrevistas agendadas nesta semana</span>
              <Link to="/candidatos" search={{ ...baseSearch, status: ["agendado"], entrevistaQuando: "semana" }}>
                <Badge variant="outline" className="text-[11px]">{stats.entrevistasSemana}</Badge>
              </Link>
            </li>
            <li className="flex items-center justify-between">
              <span>Novos nos últimos 30 dias</span>
              <Badge variant="outline" className="text-[11px]">{stats.novos30d}</Badge>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  to,
  icon,
  label,
  value,
  hint,
}: {
  to: Record<string, unknown>;
  icon: ReactNode;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <Link to="/candidatos" search={to as never} className="block">
      <Card className="p-4 hover:border-primary/50 hover:shadow-sm transition-colors">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          <span className="truncate">{label}</span>
        </div>
        <p className="text-2xl font-semibold mt-1.5">{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </Card>
    </Link>
  );
}
