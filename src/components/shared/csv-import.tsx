"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/types/action";
import type { ImportSummary } from "@/lib/actions/import";

interface Props {
  title: string;
  description: string;
  // colunas esperadas, em ordem (para o texto de ajuda e o modelo).
  columns: string[];
  // exemplo de linha para o arquivo-modelo.
  sample: string[];
  // action do servidor que recebe o conteudo do CSV.
  action: (csv: string) => Promise<ActionResult<ImportSummary>>;
}

export function CsvImport({ title, description, columns, sample, action }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [fileName, setFileName] = useState<string>("");
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pick() { inputRef.current?.click(); }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      start(async () => {
        const res = await action(text);
        if (res.ok) { setResult(res.data); router.refresh(); }
        else setError(res.error);
      });
    };
    reader.onerror = () => setError("Não foi possível ler o arquivo.");
    reader.readAsText(file, "utf-8");
    // permite reenviar o mesmo arquivo depois
    e.target.value = "";
  }

  function downloadTemplate() {
    const header = columns.join(",");
    const example = sample.join(",");
    const blob = new Blob([`${header}\n${example}\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4" /> {title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Colunas: <span className="font-data">{columns.join(", ")}</span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
        <Button variant="outline" size="sm" onClick={pick} disabled={pending}>
          <Upload className="h-4 w-4" /> {pending ? "Importando..." : "Importar CSV"}
        </Button>
        <Button variant="ghost" size="sm" onClick={downloadTemplate} disabled={pending}>
          <Download className="h-4 w-4" /> Baixar modelo
        </Button>
        {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {result && (
        <div className="text-sm">
          <p className="text-motorista">{result.created} cadastrado(s) com sucesso.</p>
          {typeof result.updated === "number" && result.updated > 0 && (
            <p className="text-brand">{result.updated} atualizado(s).</p>
          )}
          {result.skipped > 0 && <p className="text-muted-foreground">{result.skipped} linha(s) ignorada(s).</p>}
          {result.errors.length > 0 && (
            <ul className="mt-1 max-h-32 list-disc overflow-auto pl-5 text-xs text-muted-foreground">
              {result.errors.slice(0, 50).map((e, idx) => <li key={idx}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
