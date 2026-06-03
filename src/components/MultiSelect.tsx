import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface Props {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
  searchable?: boolean;
  emptyLabel?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Selecionar",
  className,
  searchable = true,
  emptyLabel = "Nenhum resultado",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = new Set(value);

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const summary =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? options.find((o) => o.value === value[0])?.label ?? placeholder
        : `${value.length} selecionados`;

  function toggle(v: string) {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange([...next]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-9 justify-between font-normal", className)}
        >
          <span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>
            {summary}
          </span>
          <div className="flex items-center gap-1 ml-2">
            {value.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange([]);
                }}
                className="rounded p-0.5 hover:bg-accent"
                aria-label="Limpar"
              >
                <X className="size-3" />
              </button>
            )}
            <ChevronDown className="size-3.5 opacity-60" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-[260px]">
        {searchable && (
          <div className="p-2 border-b">
            <Input
              autoFocus
              className="h-8 text-sm"
              placeholder="Buscar..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}
        <div className="max-h-64 overflow-auto py-1">
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-xs text-center text-muted-foreground">{emptyLabel}</p>
          )}
          {filtered.map((o) => {
            const isSel = selected.has(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent",
                  isSel && "bg-accent/50",
                )}
              >
                <div
                  className={cn(
                    "size-4 rounded border flex items-center justify-center shrink-0",
                    isSel ? "bg-primary border-primary text-primary-foreground" : "border-input",
                  )}
                >
                  {isSel && <Check className="size-3" />}
                </div>
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
