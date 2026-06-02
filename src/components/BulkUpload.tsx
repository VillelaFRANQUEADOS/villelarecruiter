import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { parseAndCreateCandidato } from "@/lib/cv-parser.functions";
import { extractPdfText, fileToBase64 } from "@/lib/pdf-extract";
import { Upload, FileText, CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "pending" | "extracting" | "ai" | "done" | "warn" | "error";
interface Item { id: string; file: File; status: Status; message?: string }

const CONCURRENCY = 3;

export function BulkUpload({ onCreated }: { onCreated: () => void }) {
  const parse = useServerFn(parseAndCreateCandidato);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const setItem = (id: string, patch: Partial<Item>) =>
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const processOne = useCallback(async (item: Item) => {
    try {
      setItem(item.id, { status: "extracting" });
      const text = await extractPdfText(item.file);
      const base64 = await fileToBase64(item.file);
      setItem(item.id, { status: "ai" });
      const res = await parse({ data: { fileName: item.file.name, pdfBase64: base64, cvText: text } });
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
  }, [parse, onCreated]);

  const enqueue = useCallback(async (files: File[]) => {
    const pdfs = files.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) return;
    const newItems: Item[] = pdfs.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      status: "pending",
    }));
    setItems((arr) => [...newItems, ...arr]);

    // simple pool
    let idx = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, newItems.length) }, async () => {
      while (idx < newItems.length) {
        const my = newItems[idx++];
        await processOne(my);
      }
    });
    await Promise.all(workers);
    onCreated();
  }, [processOne]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    enqueue(Array.from(e.dataTransfer.files));
  };

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
        <p className="text-sm font-medium">Arraste PDFs aqui ou clique para selecionar</p>
        <p className="text-xs text-muted-foreground mt-1">A IA extrai nome, telefone, email, cidade e experiência</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
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
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground flex justify-between">
            <span>{items.filter(i => i.status === "done" || i.status === "warn").length} de {items.length} processados</span>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setItems([])}>Limpar</Button>
          </div>
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileText className="size-4 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{it.file.name}</span>
              <StatusIcon status={it.status} />
              <span className="text-xs text-muted-foreground w-32 text-right truncate" title={it.message}>
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
    case "extracting": return "lendo PDF";
    case "ai": return "extraindo com IA";
    case "done": return "criado";
    case "warn": return it.message || "criado sem IA";
    case "error": return it.message || "erro";
  }
}
