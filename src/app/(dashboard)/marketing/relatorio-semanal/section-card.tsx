"use client";

import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A moldura de um bloco do relatório: título, o que ele é, o conteúdo e um
 * "Salvar" que SÓ ACENDE quando há o que salvar.
 *
 * A legenda de cada bloco não é enfeite — é a coluna de instruções que a
 * planilha tinha numa aba separada, trazida para onde o número é digitado.
 * Ninguém abria a aba 1 antes de preencher a aba 3.
 */
export function SectionCard({
  title,
  description,
  footnote,
  sujo,
  salvando,
  salvo,
  erro,
  onSave,
  children,
}: {
  title: string;
  description?: string;
  /** Linha de rodapé: contadores, totais — o que a planilha somava embaixo. */
  footnote?: React.ReactNode;
  sujo?: boolean;
  salvando?: boolean;
  salvo?: boolean;
  erro?: string | null;
  onSave?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {onSave && (
          <div className="flex items-center gap-2">
            {salvo && !sujo && (
              <span className="flex items-center gap-1 text-xs text-primary">
                <Check className="h-3.5 w-3.5" />
                Salvo
              </span>
            )}
            <Button size="sm" onClick={onSave} disabled={!sujo || salvando}>
              {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar
            </Button>
          </div>
        )}
      </header>

      <div className="px-4 py-3">{children}</div>

      {(footnote || erro) && (
        <footer className="border-t border-border px-4 py-2.5">
          {footnote}
          {erro && <p className="mt-1 text-xs text-destructive">{erro}</p>}
        </footer>
      )}
    </section>
  );
}
