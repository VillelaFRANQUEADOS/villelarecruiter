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
    const now = new Date(); const t = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const day = t.getDay(); const ws = new Date(t); ws.setDate(t.getDate() + (day === 0 ? -6 : 1 - day)); const we = new Date(ws); we.setDate(ws.getDate() + 6); return { today: t, todayStr: fmtDate(t), weekStart: fmtDate(ws), weekEnd: fmtDate(we) };
  }, []);
  const range = useMemo(() => {
    if (preset === "custom") return { from: dateFrom, to: dateTo }; if (preset === "all") return { from: "", to: "" }; const days = Number(preset); const from = new Date(today.getTime() - (days - 1) * DAY_MS); return { from: fmtDate(from), to: "" };
  }, [preset, dateFrom, dateTo, today]);
  const effectiveRecrutadores = useMemo(() => (isAdmin ? fRecrutadores : user?.id ? [user.id] : []), [isAdmin, fRecrutadores, user?.id]);
  const filters: CandidatosFilters = useMemo(() => ({ estados: fEstados, cidades: fCidades, origens: fOrigens, recrutadores: effectiveRecrutadores, vaga: fVaga, dateFrom: range.from, dateTo: range.to }), [fEstados, fCidades, fOrigens, effectiveRecrutadores, fVaga, range.from, range.to]);
  const { data: rows = [], isFetching } = useDashboardCandidatosQuery(filters);
  const baseSearch = useMemo(() => ({ status: [] as string[], estado: fEstados, cidade: fCidades, origem: fOrigens, unidade: [] as string[], recrutador: effectiveRecrutadores, entrevistador: [] as string[], vaga: fVaga, dateFrom: range.from, dateTo: range.to, entrevistaQuando: "" }), [fEstados, fCidades, fOrigens, effectiveRecrutadores, fVaga, range.from, range.to]);
  const profMap = useMemo(() => new Map(profiles.map((p) => [p.id, p.nome])), [profiles]);
  const stats = useMemo(() => {
    const byStatus = new Map<string, number>(); const byUf = new Map<string, number>(); const byOrigem = new Map<string, number>(); const byRecrutador = new Map<string, { total: number; agendado: number; contato: number }>(); const byDay = new Map<string, number>(); const byVaga = new Map<string, number>();
    let semCidade = 0; const semTelefoneOuEmail = 0; let entrevistasHoje = 0; let entrevistasSemana = 0; let atrasadas = 0; let novos7d = 0; let novos30d = 0;
    const now = Date.now();
    for (const r of rows as DashboardRow[]) {
      byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1); const uf = (r.estado || "").trim().toUpperCase(); if (uf) byUf.set(uf, (byUf.get(uf) ?? 0) + 1); else semCidade++; const og = r.origem_curriculo || "OUTROS"; byOrigem.set(og, (byOrigem.get(og) ?? 0) + 1); const rid = r.recrutador_id ?? "__none"; const cur = byRecrutador.get(rid) ?? { total: 0, agendado: 0, contato: 0 }; cur.total++; if (r.status === "agendado") cur.agendado++; if (r.status !== "aguardando_contato") cur.contato++; byRecrutador.set(rid, cur); const day = r.created_at.slice(0, 10); byDay.set(day, (byDay.get(day) ?? 0) + 1); if (r.vaga?.trim()) byVaga.set(r.vaga.trim(), (byVaga.get(r.vaga.trim()) ?? 0) + 1);
      const age = now - new Date(r.created_at).getTime(); if (age <= 7 * DAY_MS) novos7d++; if (age <= 30 * DAY_MS) novos30d++; if (r.status === "aguardando_contato" && age > 3 * DAY_MS) atrasadas++; if (r.data_entrevista) { if (r.data_entrevista === todayStr) entrevistasHoje++; if (r.data_entrevista >= weekStart && r.data_entrevista <= weekEnd) entrevistasSemana++; }
    }
    const total = rows.length; const agendados = byStatus.get("agendado") ?? 0; const semInteresse = byStatus.get("sem_interesse") ?? 0; const trabalhados = total - (byStatus.get("aguardando_contato") ?? 0); const dias: { dia: string; label: string; novos: number }[] = [];
    for (let i = 29; i >= 0; i--) { const d = new Date(today.getTime() - i * DAY_MS); const key = fmtDate(d); dias.push({ dia: key, label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`, novos: byDay.get(key) ?? 0 }); }
    return { total, agendados, semInteresse, trabalhados, novos7d, novos30d, atrasadas, entrevistasHoje, entrevistasSemana, semCidade, semTelefoneOuEmail, byStatus, byUf, byOrigem, byRecrutador, byVaga, dias };
  }, [rows, today, todayStr, weekStart, weekEnd]);
  void STATUS_COLORS; void CHART_PALETTE; void options; void baseSearch; void profMap; void isFetching; void STATUS_LABELS; void STATUS_ORDER; void STATUS_TONE; void UF_LIST; void ORIGEM_VALUES; void ORIGEM_LABELS; void Link; void Card; void Badge; void Button; void Input; void ResponsiveContainer; void PieChart; void Pie; void Cell; void BarChart; void Bar; void XAxis; void YAxis; void CartesianGrid; void RTooltip; void LineChart; void Line; void AlertTriangle; void CalendarClock; void CalendarDays; void Download; void MapPin; void PhoneCall; void RotateCcw; void Target; void TrendingUp; void UserRoundCheck; void Users; void ReactNode; void setPreset; void setDateFrom; void setDateTo; void setFEstados; void setFCidades; void setFOrigens; void setFRecrutadores; void setFVaga; void stats;
  return null;
}
