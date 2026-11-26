"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/shared/modal";
import { cn } from "@/lib/utils";

/**
 * O RECORTE POR PESSOA — só da Gestão, como no Build.Connect (lá a permissão
 * se chama `cronograma.filterUsers` e é de Gestor e Admin).
 *
 * A ESCOLHA VAI PARA A URL (`?responsavel=Ana,Bia`), como o período e a marca:
 * o recorte sobrevive ao recarregar, pode ser mandado por link para a reunião
 * de sexta, e a página continua sendo de servidor. Em estado de componente,
 * ele morreria no F5 e obrigaria a tela inteira a descer para o navegador.
 *
 * CASA POR PRIMEIRO NOME, não por id, e o motivo está em
 * `filtrarPorResponsavel`: é a única chave que existe nas duas origens, porque
 * o Build.Connect manda o primeiro nome e mais nada. Por isso a lista aqui é
 * de NOMES, montada a partir das atividades do período — oferecer gente sem atividade
 * nenhuma seria um filtro que só sabe esvaziar a tela.
 */
export function FiltroResponsavel({
  nomes,
  selecionados,
}: {
  /** Os primeiros nomes que aparecem no período, mais os já escolhidos. */
  nomes: readonly string[];
  selecionados: readonly string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [aberto, setAberto] = useState(false);
  const [escolha, setEscolha] = useState<string[]>([...selecionados]);

  function aplicar(nomes: string[]) {
    const next = new URLSearchParams(params.toString());
    if (nomes.length > 0) next.set("responsavel", nomes.join(","));
    else next.delete("responsavel");
    router.push(`${pathname}?${next.toString()}`);
    setAberto(false);
  }

  const alterna = (nome: string) =>
    setEscolha((atual) =>
      atual.includes(nome) ? atual.filter((n) => n !== nome) : [...atual, nome],
    );

  return (
    <>
      <Button
        variant={selecionados.length > 0 ? "default" : "secondary"}
        size="sm"
        onClick={() => {
          // A escolha renasce do que está na URL a cada abertura: sem isto,
          // cancelar o modal e reabrir mostraria as marcações descartadas.
          setEscolha([...selecionados]);
          setAberto(true);
        }}
      >
        <Users className="mr-1.5 h-4 w-4" aria-hidden />
        {selecionados.length > 0 ? `${selecionados.length} pessoa(s)` : "Responsável"}
      </Button>

      {aberto && (
        <Modal onClose={() => setAberto(false)} largura="max-w-md">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Filtrar por responsável</h2>
              <p className="text-sm text-muted-foreground">
                Nenhum marcado mostra o período inteiro.
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setAberto(false)} aria-label="Fechar">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {nomes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma atividade com responsável neste período.
            </p>
          ) : (
            <div className="kanban-scroll max-h-[50vh] space-y-1 overflow-y-auto pr-1">
              {nomes.map((nome) => {
                const marcado = escolha.includes(nome);
                return (
                  <button
                    key={nome}
                    type="button"
                    onClick={() => alterna(nome)}
                    aria-pressed={marcado}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      marcado
                        ? "border-marketing bg-marketing/10 font-medium text-foreground"
                        : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 rounded border",
                        marcado ? "border-marketing bg-marketing" : "border-input",
                      )}
                      aria-hidden
                    />
                    {nome}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-6 flex justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => aplicar([])}>
              Limpar
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button onClick={() => aplicar(escolha)}>Aplicar</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
