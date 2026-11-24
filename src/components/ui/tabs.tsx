"use client";

import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
}

/**
 * Abas SUBLINHADAS, que e a forma que a casa ja usa (a Gestao desenha as
 * dela assim desde sempre).
 *
 * O Build.Connect usa pilula; aqui seria uma terceira gramatica de aba no
 * mesmo sistema. Quem troca de tela nao deve ter de reaprender o que e uma
 * aba.
 *
 * ROLA NA HORIZONTAL quando nao cabe (`.kanban-scroll`, a barra discreta da
 * casa): com seis blocos num modal estreito, a alternativa seria quebrar as
 * abas em duas linhas e empurrar o conteudo para baixo.
 */
export function Tabs({
  items,
  value,
  onValueChange,
  className,
}: {
  items: readonly TabItem[];
  value: string;
  onValueChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn("kanban-scroll flex items-center gap-1 overflow-x-auto border-b border-border", className)}
    >
      {items.map((item) => {
        const ativa = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={ativa}
            onClick={() => onValueChange(item.id)}
            className={cn(
              "whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              ativa
                ? "border-b-2 border-primary text-primary"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Painel de aba.
 *
 * A `key` no id FORCA a remontagem a cada troca, o que reexecuta a animacao
 * de entrada. Fica aqui, e nao em cada painel, para o efeito ser o mesmo em
 * toda aba do sistema.
 */
export function TabPanel({
  tabId,
  className,
  children,
}: {
  tabId: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div key={tabId} role="tabpanel" className={cn("animate-fade-in", className)}>
      {children}
    </div>
  );
}
