"use client";

import { useRef, useState } from "react";
import { ImageUp, Link2, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { enviarEvidencia } from "@/lib/actions/relatorio-semanal";
import { evidenciaEhImagem } from "@/lib/relatorio-semanal-labels";

/**
 * A prova de que a entrega saiu: um LINK ou um PRINT.
 *
 * UM CAMPO SÓ, e não dois. A distinção entre "é imagem nossa" e "é endereço"
 * se lê do próprio valor — caminho começando em `/uploads/` é print enviado, o
 * resto é link. Uma coluna a mais para guardar essa distinção seria uma coluna
 * que pode discordar do valor ao lado dela.
 *
 * O ENVIO NÃO SALVA A LINHA: ele grava o arquivo e devolve o caminho, que vai
 * para o estado do formulário como se tivesse sido digitado. Quem grava é o
 * "Salvar" da seção — e é isso que permite trocar o print antes de salvar sem
 * deixar a linha apontando para um arquivo descartado.
 */
export function EvidenceField({
  value,
  onChange,
  ariaLabel,
}: {
  value?: string;
  onChange: (valor: string) => void;
  ariaLabel: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ehImagem = evidenciaEhImagem(value);

  async function enviar(file: File) {
    setEnviando(true);
    setErro(null);
    const fd = new FormData();
    fd.set("file", file);
    const r = await enviarEvidencia(fd);
    setEnviando(false);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    onChange(r.data.path);
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        {ehImagem ? (
          // Com um print enviado o campo vira uma MINIATURA: o caminho com
          // UUID não diz nada a quem lê, e a imagem diz tudo.
          <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
            <span className="truncate text-xs text-muted-foreground">print enviado</span>
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label="Remover a evidência"
              className="ml-auto rounded p-0.5 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : (
          <Input
            aria-label={ariaLabel}
            className="h-9 text-xs"
            placeholder="link ou print"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
        )}

        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // O valor é limpo para que escolher O MESMO arquivo de novo
            // dispare o evento outra vez (depois de um erro, por exemplo).
            e.target.value = "";
            if (file) void enviar(file);
          }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={enviando}
          aria-label={`${ariaLabel}: enviar print`}
          title="Enviar print"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-input text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageUp className="h-3.5 w-3.5" />}
        </button>
      </div>

      {erro && <p className="text-[11px] text-destructive">{erro}</p>}

      {!ehImagem && value && (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-[11px] text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Link2 className="h-3 w-3" />
          abrir
        </a>
      )}
    </div>
  );
}
