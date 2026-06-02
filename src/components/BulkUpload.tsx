import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { parseAndCreateCandidato } from "@/lib/cv-parser.functions";
import { extractAnyText, fileToBase64, isAcceptedFile, ACCEPTED_TYPES, detectMime } from "@/lib/pdf-extract";
import { Upload, FileText, CheckCircle2, XCircle, Loader2, AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "pending" | "extracting" | "ai" | "done" | "warn" | "error";
interface Item { id: string; file: File; status: Status; message?: string }

const CONCURRENCY = 3;

export function BulkUpload({ onCreated }: { onCreated: () => void }) {
  const parse = useServerFn(parseAndCreateCandidato);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const setItem = (id: string, patch: Partial<Item>) =>
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const processOne = useCallback(async (item: Item) => {
    try {
      setItem(item.id, { status: "extracting", message: undefined });
      const text = await extractAnyText(item.file);
      const base64 = await fileToBase64(item.file);
      setItem(item.id, { status: "ai" });
      const res = await parse({ data: { fileName: item.file.name, pdfBase64: base64, cvText: text, mimeType: detectMime(item.file) } });
      if (res?.duplicate) {
        const ex = res.existing as { nome?: string } | null;
        setItem(item.id, { status: "warn", message: res.updated ? `atualizado: ${ex?.nome ?? ""}` : `duplicado: ${ex?.nome ?? ""}` });
        return;
      }
      setItem(item.id, {
        status: res?.aiFailed ? "warn" : "done",
        message: res?.aiFailed ? "criado sem IA - edite" : undefined,
      });
    } catch (e) {
      setItem(item.id, { status: "error", message: e instanceof Error ? e.message : "Erro" });
    }
  }, [parse]);

  const runPool = useCallback(async (queue: Item[]) => {
    setRunning(true);
    let idx = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (idx < queue.length) {
        const my = queue[idx++];
        await processOne(my);
      }
    });
    await Promise.all(workers);
    setRunning(false);
    onCreated();
  }, [processOne, onCreated]);

  const enqueue = useCallback(async (files: File[]) => {
    const accepted = files.filter(isAcceptedFile);
    if (!accepted.length) return;
    const newItems: Item[] = accepted.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      status: "pending",
    }));
    setItems((arr) => [...newItems, ...arr]);
    await runPool(newItems);
  }, [runPool]);

  const retryFailed = useCallback(async () => {
    const failed = items.filter((i) => i.status === "error");
    if (!failed.length) return;
    setItems((arr) => arr.map((i) => (i.status === "error" ? { ...i, status: "pending", message: undefined } : i)));
    await runPool(failed.map((i) => ({ ...i, status: "pending" })));
  }, [items, runPool]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    enqueue(Array.from(e.dataTransfer.files));
  };

  const done = items.filter((i) => i.status === "done" || i.status === "warn").length;
  const failed = items.filter((i) => i.status === "error").length;

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed px-6 py-8 text-center transition ${
          dragging ? "border-primary bg-primary/5" : "border-input hover:border-primary/50 hover:bg-accent/30"
        }`}
      >
        <Upload className="size-6 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm font-medium">Arraste currículos aqui ou clique para selecionar</p>
        <p className="text-xs text-muted-foreground mt-1">PDF, Word, TXT e imagens (OCR). A IA extrai nome, telefone, cidade, estado e e-mail.</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          className="hidden"
          onChange={(e) => {
            enqueue(Array.from(e.target.files ?? []));
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <div className="rounded-lg border bg-card divide-y max-h-72 overflow-auto">
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground flex items-center justify-between gap-2">
            <span>
              {done} de {items.length} processados
              {failed > 0 && <span className="text-destructive"> · {failed} com erro</span>}
            </span>
            <div className="flex gap-1">
              {failed > 0 && (
                <Button variant="outline" size="sm" className="h-6 text-xs gap-1" disabled={running} onClick={retryFailed}>
                  <RotateCw className="size-3" /> Reprocessar falhas
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setItems([])}>Limpar</Button>
            </div>
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
