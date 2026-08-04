import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { parseAndCreateCandidato } from "@/lib/cv-parser.functions";
import { extractFromFile, fileToBase64 } from "@/lib/file-extract";
import { Upload, FileText, CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORIGEM_VALUES, ORIGEM_LABELS, type OrigemCurriculo } from "@/lib/city-validation";

type Status = "pending" | "extracting" | "ai" | "done" | "warn" | "error";
interface Item { id: string; file: File; status: Status; message?: string }

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
  const [origem, setOrigem] = useState<OrigemCurriculo>("OUTROS");
  const origemRef = useRef<OrigemCurriculo>("OUTROS");
  origemRef.current = origem;
  const inputRef = useRef<HTMLInputElement>(null);

  const setItem = (id: string, patch: Partial<Item>) =>
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const processOne = useCallback(async (item: Item) => {
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
          origemCurriculo: origemRef.current,
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
  }, [parse]);

  const enqueue = useCallback(async (files: File[]) => {
    const accepted = files.filter(isAcceptedFile);
    const rejected = files.length - accepted.length;
    if (!accepted.length) return;
    const newItems: Item[] = accepted.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      status: "pending",
    }));
    setItems((arr) => [
      ...newItems,
      ...arr,
      ...(rejected > 0
        ? [{
            id: `rej-${Date.now()}`,
            file: new File([], `${rejected} arquivo(s) ignorado(s) — formato não suportado`),
            status: "error" as Status,
            message: "formato não suportado",
          }]
        : []),
    ]);

    // Pool simples: cada upload é processado individualmente, mantendo a
    // associação arquivo→candidato. Failures isoladas não derrubam o lote.
    let idx = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, newItems.length) }, async () => {
      while (idx < newItems.length) {
        const my = newItems[idx++];
        await processOne(my);
      }
    });
    await Promise.all(workers);
    onCreated();
  }, [processOne, onCreated]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    enqueue(Array.from(e.dataTransfer.files));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-muted-foreground">Origem do currículo:</label>
        <Select value={origem} onValueChange={(v) => setOrigem(v as OrigemCurriculo)}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ORIGEM_VALUES.map((v) => (
              <SelectItem key={v} value={v}>{ORIGEM_LABELS[v]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[11px] text-muted-foreground">Aplicado a todos os arquivos enviados nesta sessão.</span>
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
          dragging ? "border-primary bg-primary/5" : "border-input hover:border-primary/50 hover:bg-accent/40"
        }`}
      >
        <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-accent">
          <Upload className="size-6 text-primary" />
        </div>
        <p className="text-sm font-semibold">Arraste arquivos aqui</p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF, DOC, DOCX, JPG, JPEG, PNG, WEBP · OCR automático para imagens e PDFs escaneados
        </p>
        <Button type="button" size="sm" className="mt-4 px-4 shadow-sm pointer-events-none">
          Selecionar arquivos
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          className="hidden"
          onChange={(e) => {
            enqueue(Array.from(e.target.files ?? []));
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      </div>

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
