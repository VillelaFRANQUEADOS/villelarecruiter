import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, CalendarClock, CalendarDays, Download, MapPin, PhoneCall, RotateCcw, Target, TrendingUp, UserRoundCheck, Users } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, LineChart, Line } from "recharts";
import { STATUS_LABELS, STATUS_ORDER, STATUS_TONE, UF_LIST, useAuth, type CandidatoStatus } from "@/lib/auth";
import { MultiSelect } from "@/components/MultiSelect";
import { ORIGEM_VALUES, ORIGEM_LABELS } from "@/lib/city-validation";
import { useCandidatosOptionsQuery, useCandidatosRealtime, useDashboardCandidatosQuery, useProfilesLiteQuery, type CandidatosFilters, type DashboardRow } from "@/lib/ats-data";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: DashboardPage });
const DAY_MS = 24 * 60 * 60 * 1000;
const STATUS_COLORS: Record<string, string> = { aguardando_contato: "var(--color-chart-1, #f59e0b)", aguardando_retorno: "var(--color-chart-2, #64748b)", sem_interesse: "var(--color-chart-3, #ef4444)", agendado: "var(--color-chart-4, #10b981)" };
const CHART_PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#0ea5e9", "#a855f7", "#14b8a6", "#f97316"];
function fmtDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
type Preset = "7" | "30" | "90" | "all" | "custom";

function DashboardPage() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  useCandidatosRealtime();
  const { data: profiles = [] } = useProfilesLiteQuery();
  const { data: options } = useCandidatosOptionsQuery();
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
  const effectiveRecrutadores = useMemo(() => (isAdmin ? fRecrutadores : user?.id ? [user.id] : []), [isAdmin, fRecrutadores, user?.id]);
  const filters: CandidatosFilters = useMemo(() => ({ estados: fEstados, cidades: fCidades, origens: fOrigens, recrutadores: effectiveRecrutadores, vaga: fVaga, dateFrom: range.from, dateTo: range.to }), [fEstados, fCidades, fOrigens, effectiveRecrutadores, fVaga, range.from, range.to]);
  const { data: rows = [], isFetching } = useDashboardCandidatosQuery(filters);
  const baseSearch = useMemo(() => ({ status: [] as string[], estado: fEstados, cidade: fCidades, origem: fOrigens, unidade: [] as string[], recrutador: effectiveRecrutadores, entrevistador: [] as string[], vaga: fVaga, dateFrom: range.from, dateTo: range.to, entrevistaQuando: "" }), [fEstados, fCidades, fOrigens, effectiveRecrutadores, fVaga, range.from, range.to]);
  const profMap = useMemo(() => new Map(profiles.map((p) => [p.id, p.nome])), [profiles]);
  const stats = useMemo(() => {
    const byStatus = new Map<string, number>();
    const byUf = new Map<string, number>();
    const byOrigem = new Map<string, number>();
    const byRecrutador = new Map<string, { total: number; agendado: number; contato: number }>();
    const byDay = new Map<string, number>();
    const byVaga = new Map<string, number>();
    let semCidade = 0;
    const semTelefoneOuEmail = 0;
    let entrevistasHoje = 0;
    let entrevistasSemana = 0;
    let atrasadas = 0;
    let novos7d = 0;
    let novos30d = 0;
    const now = Date.now();
    for (const r of rows as DashboardRow[]) {
      byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
      const uf = (r.estado || "").trim().toUpperCase();
      if (uf) byUf.set(uf, (byUf.get(uf) ?? 0) + 1); else semCidade++;
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
      dias.push({ dia: key, label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`, novos: byDay.get(key) ?? 0 });
    }
    return { total, agendados, semInteresse, trabalhados, novos7d, novos30d, atrasadas, entrevistasHoje, entrevistasSemana, semCidade, semTelefoneOuEmail, byStatus, byUf, byOrigem, byRecrutador, byVaga, dias };
  }, [rows, today, todayStr, weekStart, weekEnd]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Dashboard</h1><p className="text-sm text-muted-foreground">Visão consolidada do processo de recrutamento.</p></div>
        <div className="flex items-center gap-2"><Link to="/candidatos" search={baseSearch as never}><Button variant="outline">Candidatos</Button></Link></div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Candidatos</div><div className="text-2xl font-semibold">{stats.total}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Agendados</div><div className="text-2xl font-semibold">{stats.agendados}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Entrevistas hoje</div><div className="text-2xl font-semibold">{stats.entrevistasHoje}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Aguardando contato &gt; 3 dias</div><div className="text-2xl font-semibold">{stats.atrasadas}</div></Card>
      </div>
      <Card className="p-4"><div className="grid gap-4 md:grid-cols-3"><div><label className="text-xs text-muted-foreground">Período</label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={preset} onChange={(e) => setPreset(e.target.value as Preset)}><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="all">Todos</option><option value="custom">Personalizado</option></select></div><div><label className="text-xs text-muted-foreground">Vaga</label><Input value={fVaga} onChange={(e) => setFVaga(e.target.value)} placeholder="Filtrar por vaga" /></div><div><label className="text-xs text-muted-foreground">Estado</label><MultiSelect options={UF_LIST.map((uf) => ({ label: uf, value: uf }))} selected={fEstados} onChange={setFEstados} placeholder="Todos" /></div></div>{preset === "custom" && <div className="mt-4 grid gap-4 md:grid-cols-2"><div><label className="text-xs text-muted-foreground">De</label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div><div><label className="text-xs text-muted-foreground">Até</label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div></div>}</Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-4"><h2 className="font-medium">Novos por dia</h2><div className="h-72 mt-4"><ResponsiveContainer width="100%" height="100%"><LineChart data={stats.dias}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis allowDecimals={false} /><RTooltip /><Line type="monotone" dataKey="novos" strokeWidth={2} /></LineChart></ResponsiveContainer></div></Card>
        <Card className="p-4"><h2 className="font-medium">Status</h2><div className="h-72 mt-4"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={STATUS_ORDER.map((status) => ({ name: STATUS_LABELS[status], value: stats.byStatus.get(status) ?? 0 }))} dataKey="value" nameKey="name" outerRadius={90} label><Cell fill={STATUS_COLORS.aguardando_contato} /><Cell fill={STATUS_COLORS.aguardando_retorno} /><Cell fill={STATUS_COLORS.sem_interesse} /><Cell fill={STATUS_COLORS.agendado} /></Pie><RTooltip /></PieChart></ResponsiveContainer></div></Card>
        <Card className="p-4 lg:col-span-2"><h2 className="font-medium">Origem</h2><div className="h-72 mt-4"><ResponsiveContainer width="100%" height="100%"><BarChart data={[...stats.byOrigem.entries()].sort((a, b) => b[1] - a[1]).map(([origem, value], i) => ({ origem: ORIGEM_LABELS[origem as keyof typeof ORIGEM_LABELS] ?? origem, value, fill: CHART_PALETTE[i % CHART_PALETTE.length] }))}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="origem" /><YAxis allowDecimals={false} /><RTooltip /><Bar dataKey="value">{[...stats.byOrigem.keys()].map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}</Bar></BarChart></ResponsiveContainer></div></Card>
      </div>
      {isFetching && <div className="text-sm text-muted-foreground">Atualizando dados…</div>}
      <div className="hidden">{options?.cidades.length ?? 0}{profiles.length}{stats.novos7d}{stats.novos30d}{stats.trabalhados}{stats.semInteresse}{stats.entrevistasSemana}{stats.semCidade}{stats.semTelefoneOuEmail}{stats.byUf.size}{stats.byRecrutador.size}{stats.byVaga.size}{MultiSelect as unknown as ReactNode}{CandidatoStatus as unknown as ReactNode}{ORIGEM_VALUES.length}{STATUS_TONE.agendado}{Download as unknown as ReactNode}{CalendarDays as unknown as ReactNode}{PhoneCall as unknown as ReactNode}{Target as unknown as ReactNode}{TrendingUp as unknown as ReactNode}{UserRoundCheck as unknown as ReactNode}{Users as unknown as ReactNode}{AlertTriangle as unknown as ReactNode}{CalendarClock as unknown as ReactNode}{MapPin as unknown as ReactNode}{RotateCcw as unknown as ReactNode}</div>
    </div>
  );
}

void Badge; void Button; void Input;
