import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarWidget } from "@/components/ui/calendar";
import { Calendar, Clipboard, X, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { MultiSelect } from "@/components/MultiSelect";
import { ORIGEM_VALUES, ORIGEM_LABELS, normalizeOrigem } from "@/lib/city-validation";
import {
  useAgendamentosQuery,
  useAgendamentoProfilesQuery,
  useProfilesLiteQuery,
  useCandidatosRealtime,
  type AgendamentoRow,
} from "@/lib/ats-data";

export const Route = createFileRoute("/_authenticated/agendamentos")({
  component: AgendamentosPage,
});

const CARD_CLS = "rounded-xl border border-brand-border bg-card shadow-[0_1px_3px_rgba(11,34,57,0.06)]";
const INPUT_CLS = "h-10 rounded-lg focus-visible:border-brand focus-visible:ring-brand/15";
const SELECT_CLS = "h-10 rounded-lg";

type DataPreset = "" | "hoje" | "amanha" | "semana" | "custom";

function toYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** yyyy-mm-dd -> dd/mm/yyyy, sem depender de fuso (evita off-by-one). */
function formatDataBR(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

/** HH:mm:ss ou HH:mm -> HH:mm */
function formatHora(t: string | null): string {
  if (!t) return "";
  return t.slice(0, 5);
}

function cidadeUf(cidade: string | null, estado: string | null): string {
  const c = (cidade ?? "").trim();
  const uf = (estado ?? "").trim();
  if (c && uf) return `${c}/${uf}`;
  return c || uf || "";
}

function safe(v: string | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (v === "null" || v === "undefined" || v === "N/A") return "";
  return v;
}

interface CopyRow {
  data: string;
  hora: string;
  candidatos: string;
  telefone: string;
  cidadeUf: string;
  tipoFranquia: string;
  origem: string;
  recrutador: string;
  agendadoPor: string;
}

function buildCopyRows(rows: AgendamentoRow[], profMap: Map<string, string>): CopyRow[] {
  return rows.map((r) => ({
    data: formatDataBR(r.data_entrevista),
    hora: formatHora(r.horario_entrevista),
    candidatos: safe(r.nome),
    telefone: safe(r.telefone),
    cidadeUf: cidadeUf(r.cidade, r.estado),
    tipoFranquia: safe(r.vaga),
    origem: safe(ORIGEM_LABELS[normalizeOrigem(r.origem_curriculo)]),
    recrutador: safe(r.recrutador_id ? profMap.get(r.recrutador_id) : ""),
    agendadoPor: safe(r.agendado_por_nome),
  }));
}

const COPY_HEADERS = [
  "DATA", "HORA", "CANDIDATOS", "TELEFONE", "CIDADE/UF", "TIPO DE FRANQUIA", "ORIGEM", "RECRUTADOR", "AGENDAMENTOS (quem agendou)",
];

function rowToTsvLine(r: CopyRow): string {
  return [r.data, r.hora, r.candidatos, r.telefone, r.cidadeUf, r.tipoFranquia, r.origem, r.recrutador, r.agendadoPor].join("\t");
}

function buildPlainText(rows: CopyRow[]): string {
  return [COPY_HEADERS.join("\t"), ...rows.map(rowToTsvLine)].join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildHtmlTable(rows: CopyRow[]): string {
  const head = `<tr>${COPY_HEADERS.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  const body = rows
    .map((r) => {
      const cells = [r.data, r.hora, r.candidatos, r.telefone, r.cidadeUf, r.tipoFranquia, r.origem, r.recrutador, r.agendadoPor];
      return `<tr>${cells.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

async function copyToClipboard(rows: CopyRow[]) {
  const plain = buildPlainText(rows);
  const html = buildHtmlTable(rows);
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    const item = new ClipboardItem({
      "text/plain": new Blob([plain], { type: "text/plain" }),
      "text/html": new Blob([html], { type: "text/html" }),
    });
    await navigator.clipboard.write([item]);
  } else {
    await navigator.clipboard.writeText(plain);
  }
}

function AgendamentosPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  useCandidatosRealtime();

  // Recrutador mantém o fluxo atual do ATS — a aba Agendamentos é
  // operacional para os perfis agendamento e admin.
  useEffect(() => {
    if (!loading && role === "recrutador") navigate({ to: "/candidatos" });
  }, [role, loading, navigate]);

  const [preset, setPreset] = useState<DataPreset>("hoje");
  const [date, setDate] = useState(toYmd(new Date()));
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [recrutadores, setRecrutadores] = useState<string[]>([]);
  const [origens, setOrigens] = useState<string[]>([]);
  const [vaga, setVaga] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const range = useMemo(() => {
    if (preset === "hoje") return { from: date, to: date };
    if (preset === "amanha") {
      const d = new Date(`${date}T00:00:00`);
      d.setDate(d.getDate() + 1);
      const y = toYmd(d);
      return { from: y, to: y };
    }
    if (preset === "semana") {
      const d = new Date(`${date}T00:00:00`);
      const day = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: toYmd(monday), to: toYmd(sunday) };
    }
    if (preset === "custom") return { from: dateFrom, to: dateTo };
    return { from: "", to: "" };
  }, [preset, date, dateFrom, dateTo]);

  const filters = useMemo(() => ({
    dateFrom: range.from,
    dateTo: range.to,
    recrutadores,
    origens,
    vaga: vaga.trim(),
  }), [range.from, range.to, recrutadores, origens, vaga]);

  const { data: rows = [], isFetching } = useAgendamentosQuery(filters);
  const { data: profiles = [] } = useProfilesLiteQuery();
  const { data: agendamentoProfiles = [] } = useAgendamentoProfilesQuery();
  const effectiveProfiles = agendamentoProfiles.length ? agendamentoProfiles : profiles;
  const profMap = useMemo(() => new Map(profiles.map((p) => [p.id, p.nome])), [profiles]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (origens.length && !origens.includes(normalizeOrigem(r.origem_curriculo))) return false;
      if (recrutadores.length && (!r.recrutador_id || !recrutadores.includes(r.recrutador_id))) return false;
      if (vaga.trim() && !(r.vaga ?? "").toLowerCase().includes(vaga.trim().toLowerCase())) return false;
      return true;
    });
  }, [rows, origens, recrutadores, vaga]);

  useEffect(() => {
    const visible = new Set(filteredRows.map((r) => r.id));
    setSelected((old) => old.filter((id) => visible.has(id)));
  }, [filteredRows]);

  const copyRows = useMemo(() => buildCopyRows(filteredRows.filter((r) => selected.includes(r.id)), profMap), [filteredRows, selected, profMap]);

  function toggle(id: string, checked: boolean) {
    setSelected((old) => checked ? [...new Set([...old, id])] : old.filter((x) => x !== id));
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? filteredRows.map((r) => r.id) : []);
  }

  async function handleCopy() {
    if (!copyRows.length) return;
    try {
      await copyToClipboard(copyRows);
      toast.success(`${copyRows.length} agendamento(s) copiado(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível copiar.");
    }
  }

  function clearFilters() {
    setPreset("hoje");
    setDate(toYmd(new Date()));
    setDateFrom("");
    setDateTo("");
    setRecrutadores([]);
    setOrigens([]);
    setVaga("");
    setSelected([]);
  }

  if (loading) return null;

  return (
    <div className="p-4 lg:p-6 max-w-[1500px] mx-auto space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agendamentos</h1>
          <p className="text-xs text-muted-foreground">Visão operacional por data para copiar e consolidar os agendamentos.</p>
        </div>
        <Button size="sm" variant="outline" onClick={handleCopy} disabled={!copyRows.length}>
          <Clipboard className="size-4 mr-1.5" /> Copiar selecionados ({copyRows.length})
        </Button>
      </header>

      <Card className={`${CARD_CLS} p-3 space-y-3`}>
        <div className="flex flex-wrap items-center gap-2">
          {([
            ["hoje", "Hoje"],
            ["amanha", "Amanhã"],
            ["semana", "Semana"],
          ] as [DataPreset, string][]).map(([v, label]) => (
            <Button key={v} size="sm" variant={preset === v ? "default" : "outline"} onClick={() => setPreset(v)}>
              {label}
            </Button>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant={preset === "custom" ? "default" : "outline"}>
                <Calendar className="size-4 mr-1.5" />
                {preset === "custom" && range.from && range.to ? `${formatDataBR(range.from)} a ${formatDataBR(range.to)}` : "Período"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="start">
              <div className="space-y-2">
                <label className="text-xs font-medium">Data de referência</label>
                <Input className={INPUT_CLS} type="date" value={date} onChange={(e) => { setDate(e.target.value); setPreset("custom"); }} />
                <div className="grid grid-cols-2 gap-2">
                  <Input className={INPUT_CLS} type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPreset("custom"); }} />
                  <Input className={INPUT_CLS} type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPreset("custom"); }} />
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            <X className="size-4 mr-1.5" /> Limpar
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <MultiSelect className={SELECT_CLS} placeholder="Recrutador" value={recrutadores} onChange={setRecrutadores} options={profiles.map((p) => ({ value: p.id, label: p.nome }))} />
          <MultiSelect className={SELECT_CLS} placeholder="Origem" value={origens} onChange={setOrigens} options={ORIGEM_VALUES.map((o) => ({ value: o, label: ORIGEM_LABELS[o] }))} />
          <Input className={INPUT_CLS} placeholder="Filtrar por vaga" value={vaga} onChange={(e) => setVaga(e.target.value)} />
        </div>
      </Card>

      <Card className={`${CARD_CLS} overflow-hidden`}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-medium"><Users className="size-4" /> {isFetching ? "Atualizando..." : `${filteredRows.length} agendamento(s)`}</div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
            <Checkbox checked={filteredRows.length > 0 && selected.length === filteredRows.length} onCheckedChange={(v) => toggleAll(Boolean(v))} />
            Selecionar todos
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/35">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="w-10 px-3 py-2"></th>
                <th className="px-3 py-2">DATA</th>
                <th className="px-3 py-2">HORA</th>
                <th className="px-3 py-2">CANDIDATO</th>
                <th className="px-3 py-2">TELEFONE</th>
                <th className="px-3 py-2">CIDADE/UF</th>
                <th className="px-3 py-2">TIPO DE FRANQUIA</th>
                <th className="px-3 py-2">ORIGEM</th>
                <th className="px-3 py-2">RECRUTADOR</th>
                <th className="px-3 py-2">AGENDADO POR</th>
                <th className="px-3 py-2">ENTREVISTADOR</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr><td colSpan={11} className="px-3 py-10 text-center text-muted-foreground">Nenhum agendamento encontrado para os filtros selecionados.</td></tr>
              ) : filteredRows.map((r) => (
                <tr key={r.id} className="border-t border-border/70 hover:bg-muted/20">
                  <td className="px-3 py-2"><Checkbox checked={selected.includes(r.id)} onCheckedChange={(v) => toggle(r.id, Boolean(v))} /></td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDataBR(r.data_entrevista)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatHora(r.horario_entrevista)}</td>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{safe(r.nome)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{safe(r.telefone)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{cidadeUf(r.cidade, r.estado)}</td>
                  <td className="px-3 py-2">{safe(r.vaga)}</td>
                  <td className="px-3 py-2">{ORIGEM_LABELS[normalizeOrigem(r.origem_curriculo)] ?? "Outros"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{safe(r.recrutador_id ? profMap.get(r.recrutador_id) : "")}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-medium">{safe(r.agendado_por_nome)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{safe(r.entrevistador)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">Selecione os candidatos que precisam ser copiados para a planilha geral.</div>
      </Card>
    </div>
  );
}
