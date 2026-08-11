import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { parseAndCreateCandidato } from "@/lib/cv-parser.functions";
import { extractFromFile, fileToBase64 } from "@/lib/file-extract";
import { Upload, FileText, CheckCircle2, XCircle, Loader2, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORIGEM_VALUES, ORIGEM_LABELS, type OrigemCurriculo } from "@/lib/city-validation";
import { cn } from "@/lib/utils";

type Status = "pending" | "extracting" | "ai" | "done" | "warn" | "error";
interface Item { id: string; file: File; status: Status; message?: string }
interface StagingItem { id: string; file: File; origem: OrigemCurriculo | "" }

type OrigemMode = "same" | "individual";

const CONCURRENCY = 2;

const ACCEPTED_EXTS = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".webp"];
const ACCEPT_ATTR = ACCEPTED_EXTS.join(",") + ",application/pdf,image/*";

function isAcceptedFile(f: File) {
  const lname = f.name.toLowerCase();
  return ACCEPTED_EXTS.some((ext) => lname.endsWith(ext));
}

export function BulkUpload({ onCreated }: { onCreated: () => void }) {
  const parse = useServerFn(parseAndCreateCandidato);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);

  // Modo de origem: mesma origem para todo o lote, ou uma seleção por arquivo.
  const [mode, setMode] = useState<OrigemMode>("same");

  // Modo "same": origem única aplicada a todo mundo. Vazio = ainda não escolhida
  // (o envio fica bloqueado até o recrutador selecionar algo).
  const [origem, setOrigem] = useState<OrigemCurriculo | "">("");

  // Modo "individual": arquivos ficam represados aqui até cada um ter origem
  // preenchida; só então o lote é liberado para processamento.
  const [staging, setStaging] = useState<StagingItem[]>([]);

  // Seleção múltipla dentro do staging, para aplicar origem em lote com um clique.
  const [selectedStaging, setSelectedStaging] = useState<Set<string>>(new Set());

  const inputRef = useRef<HTMLInputElement>(null);

  const setItem = (id: string, patch: Partial<Item>) =>
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const processOne = useCallback(async (item: Item, origemDoArquivo: OrigemCurriculo) => {
    try {
      setItem(item.id, { status: "extracting" });
      const extracted = await extractFromFile(item.file);
      const fileBase64 = await fileToBase64(item.file);
      setItem(item.id, { status: "ai" });
      const res = await parse({
        data: {
          fileName: item.file.name,
          fileBase64,
          mimeType: extracted.mimeType,
          cvText: extracted.text,
          images: extracted.images,
          origemCurriculo: origemDoArquivo,
        },
      });
      if (res?.duplicate) {
        const ex = res.existing as { nome?: string } | null;
        setItem(item.id, { status: "warn", message: `duplicado: ${ex?.nome ?? "já cadastrado"}` });
        return;
      }
      setItem(item.id, {
        status: res?.aiFailed ? "warn" : "done",
        message: res?.aiFailed ? "criado sem IA - edite" : undefined,
      });
    } catch (e) {
      setItem(item.id, { status: "error", message: e instanceof Error ? e.message : "Erro" });
    }
  }, []);

  // Dispara o processamento real de um lote já com origem definida por item.
  const runBatch = useCallback(async (batch: Array<{ file: File; origem: OrigemCurriculo }>) => {
    const newItems: Item[] = batch.map((b) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: b.file,
      status: "pending",
    }));
    setItems((arr) => [...newItems, ...arr]);

    let idx = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, newItems.length) }, async () => {
      while (idx < newItems.length) {
        const my = idx;
        idx++;
        await processOne(newItems[my], batch[my].origem);
      }
    });
    await Promise.all(workers);
    onCreated();
  }, [processOne, onCreated]);

  const enqueue = useCallback((files: File[]) => {
    const accepted = files.filter(isAcceptedFile);
    const rejectedCount = files.length - accepted.length;
    if (rejectedCount > 0) {
      setItems((arr) => [
        {
          id: `rej-${Date.now()}`,
          file: new File([], `${rejectedCount} arquivo(s) ignorado(s) — formato não suportado`),
          status: "error" as Status,
          message: "formato não suportado",
        },
        ...arr,
      ]);
    }
    if (!accepted.length) return;

    if (mode === "individual") {
      // Represa os arquivos para seleção de origem individual antes de enviar.
      const novos = accepted.map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file: f,
        origem: "" as OrigemCurriculo | "",
      }));
      setStaging((arr) => [...arr, ...novos]);
      // Novos arquivos já entram selecionados, prontos para receber origem em lote.
      setSelectedStaging((s) => new Set([...s, ...novos.map((n) => n.id)]));
      return;
    }

    // Modo "same": só processa se a origem já foi escolhida; caso contrário
    // a dropzone fica desabilitada (ver render), então isso é um fallback.
    if (!origem) return;
    runBatch(accepted.map((f) => ({ file: f, origem })));
  }, [mode, origem, runBatch]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    enqueue(Array.from(e.dataTransfer.files));
  };

  const dropzoneLocked = mode === "same" && !origem;

  const setStagingOrigem = (id: string, v: OrigemCurriculo) =>
    setStaging((arr) => arr.map((it) => (it.id === id ? { ...it, origem: v } : it)));

  // Aplica uma origem a todos os itens atualmente selecionados de uma vez —
  // cobre o caso comum (mesma origem para o lote) sem perder a opção item a item.
  const applyOrigemToSelected = (v: OrigemCurriculo) => {
    setStaging((arr) => arr.map((it) => (selectedStaging.has(it.id) ? { ...it, origem: v } : it)));
  };

  const toggleSelectedStaging = (id: string) =>
    setSelectedStaging((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const toggleSelectAllStaging = () =>
    setSelectedStaging((s) =>
      s.size === staging.length ? new Set() : new Set(staging.map((it) => it.id))
    );

  const removeStaging = (id: string) => {
    setStaging((arr) => arr.filter((it) => it.id !== id));
    setSelectedStaging((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  };

  const filledCount = staging.filter((it) => it.origem !== "").length;
  const allStagingFilled = staging.length > 0 && filledCount === staging.length;

  const confirmStaging = () => {
    if (!allStagingFilled) return;
    const batch = staging.map((it) => ({ file: it.file, origem: it.origem as OrigemCurriculo }));
    setStaging([]);
    setSelectedStaging(new Set());
    runBatch(batch);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-muted-foreground">Origem do currículo:</label>
        <Select
          value={mode}
          onValueChange={(v) => {
            setMode(v as OrigemMode);
            setStaging([]);
          }}
        >
          <SelectTrigger className="h-8 w-52 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="same">Mesma origem para todos</SelectItem>
            <SelectItem value="individual">Selecionar por currículo</SelectItem>
          </SelectContent>
        </Select>

        {mode === "same" && (
          <>
            <Select value={origem || undefined} onValueChange={(v) => setOrigem(v as OrigemCurriculo)}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="Selecione a origem" />
              </SelectTrigger>
              <SelectContent>
                {ORIGEM_VALUES.map((v) => (
                  <SelectItem key={v} value={v}>{ORIGEM_LABELS[v]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[11px] text-muted-foreground">
              {origem ? "Aplicado a todos os arquivos enviados nesta sessão." : "Selecione a origem para liberar o envio."}
            </span>
          </>
        )}

        {mode === "individual" && (
          <span className="text-[11px] text-muted-foreground">
            Cada arquivo terá a origem selecionada individualmente antes do envio.
          </span>
        )}
      </div>

      {/* Zona de drop compacta quando já há arquivos represados aguardando origem —
          dá lugar à lista, que é o que importa nesse momento do fluxo. */}
      {staging.length > 0 && mode === "individual" ? (
        <button
          type="button"
          onClick={() => { if (!dropzoneLocked) inputRef.current?.click(); }}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-brand-amber/60 py-2 text-xs font-medium text-muted-foreground transition hover:border-brand-amber hover:bg-brand-amber/5"
        >
          <Upload className="size-3.5" />
          Adicionar mais arquivos
        </button>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); if (!dropzoneLocked) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={dropzoneLocked ? (e) => e.preventDefault() : onDrop}
          onClick={() => { if (!dropzoneLocked) inputRef.current?.click(); }}
          aria-disabled={dropzoneLocked}
          className={`rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
            dropzoneLocked
              ? "cursor-not-allowed opacity-50 border-muted-foreground/30"
              : dragging
                ? "cursor-pointer border-brand-amber bg-brand-amber/5"
                : "cursor-pointer border-brand-amber/60 hover:border-brand-amber hover:bg-brand-amber/5"
          }`}
        >
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-accent">
            <Upload className="size-6 text-primary" />
          </div>
          <p className="text-sm font-semibold">
            {dropzoneLocked ? "Selecione a origem do currículo antes de enviar" : "Arraste arquivos aqui"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            PDF, DOC, DOCX, JPG, JPEG, PNG, WEBP · OCR automático para imagens e PDFs escaneados
          </p>
          <Button type="button" size="sm" className="mt-4 px-4 shadow-sm pointer-events-none" disabled={dropzoneLocked}>
            Selecionar arquivos
          </Button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        disabled={dropzoneLocked}
        className="hidden"
        onChange={(e) => {
          enqueue(Array.from(e.target.files ?? []));
          if (inputRef.current) inputRef.current.value = "";
        }}
      />

      {staging.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-3 py-2 bg-muted/40 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-muted-foreground">
                {filledCount} de {staging.length} com origem definida
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setStaging([]); setSelectedStaging(new Set()); }}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className={cn(
                    "h-6 text-xs px-3",
                    allStagingFilled && "bg-brand-amber text-[#0B2239] hover:bg-brand-amber/90"
                  )}
                  disabled={!allStagingFilled}
                  onClick={confirmStaging}
                >
                  Confirmar e enviar
                </Button>
              </div>
            </div>
            {/* Progresso visual: preenche conforme cada arquivo recebe origem. */}
            <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-amber transition-all"
                style={{ width: `${(filledCount / staging.length) * 100}%` }}
              />
            </div>
            {staging.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-brand-amber/10 px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={selectedStaging.size === staging.length}
                  onChange={toggleSelectAllStaging}
                  className="size-3.5 accent-brand-amber shrink-0"
                  aria-label="Selecionar todos"
                />
                <span className="text-[11px] text-muted-foreground mr-1">
                  {selectedStaging.size > 0
                    ? `Aplicar a ${selectedStaging.size} selecionado(s):`
                    : "Selecione arquivos para aplicar origem em lote"}
                </span>
                {ORIGEM_VALUES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    disabled={selectedStaging.size === 0}
                    onClick={() => applyOrigemToSelected(v)}
                    className="rounded-full border border-brand-amber/60 bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:border-brand-amber hover:bg-brand-amber/20 disabled:opacity-40 disabled:hover:border-brand-amber/60 disabled:hover:bg-background"
                  >
                    {ORIGEM_LABELS[v]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="divide-y max-h-72 overflow-auto">
            {staging.map((it) => (
              <div key={it.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                {staging.length > 1 && (
                  <input
                    type="checkbox"
                    checked={selectedStaging.has(it.id)}
                    onChange={() => toggleSelectedStaging(it.id)}
                    className="size-3.5 accent-brand-amber shrink-0"
                    aria-label={`Selecionar ${it.file.name}`}
                  />
                )}
                <FileText className="size-4 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{it.file.name}</span>
                {/* Pills de origem: uma única ação define a origem, sem abrir menu. */}
                <div className="flex flex-wrap justify-end gap-1 shrink-0">
                  {ORIGEM_VALUES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setStagingOrigem(it.id, v)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                        it.origem === v
                          ? "border-transparent bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-brand-amber hover:text-foreground"
                      )}
                    >
                      {ORIGEM_LABELS[v]}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => removeStaging(it.id)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  aria-label="Remover arquivo"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="rounded-xl border bg-card divide-y max-h-72 overflow-auto">
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground flex justify-between bg-muted/40">
            <span>{items.filter(i => i.status === "done" || i.status === "warn").length} de {items.length} processados</span>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setItems([])}>Limpar</Button>
          </div>
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileText className="size-4 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{it.file.name}</span>
              <StatusIcon status={it.status} />
              <span className="text-xs text-muted-foreground w-40 text-right truncate" title={it.message}>
                {labelOf(it)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "done") return <CheckCircle2 className="size-4 text-success" />;
  if (status === "warn") return <AlertTriangle className="size-4 text-warning" />;
  if (status === "error") return <XCircle className="size-4 text-destructive" />;
  if (status === "pending") return <div className="size-4 rounded-full border border-muted-foreground/30" />;
  return <Loader2 className="size-4 animate-spin text-primary" />;
}

function labelOf(it: Item) {
  switch (it.status) {
    case "pending": return "aguardando";
    case "extracting": return "lendo arquivo";
    case "ai": return "extraindo com IA";
    case "done": return "criado";
    case "warn": return it.message || "criado sem IA";
    case "error": return it.message || "erro";
  }
}
