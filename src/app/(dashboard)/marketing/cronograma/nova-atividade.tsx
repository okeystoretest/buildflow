"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AtividadeModal } from "./atividade-modal";

/**
 * O botão "Nova atividade", e só ele.
 *
 * Existe como componente separado porque a PÁGINA É DE SERVIDOR e assim
 * continua: a grade, o cabeçalho e os botões de período são servidos prontos,
 * e o único JavaScript que desce é o que abre formulário. Pôr o `useState`
 * na página obrigaria a mandar a tela inteira para o navegador.
 */
export function NovaAtividade({ pessoas }: { pessoas: readonly { id: string; name: string }[] }) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setAberto(true)}>
        <Plus className="mr-1.5 h-4 w-4" aria-hidden />
        Nova atividade
      </Button>
      {aberto && <AtividadeModal pessoas={pessoas} onClose={() => setAberto(false)} />}
    </>
  );
}

/**
 * O ESPAÇO LIVRE DA CÉLULA COMO BOTÃO: clicar num dia vazio abre o formulário
 * já com aquela data (pedido do dono, 26/11/2026, como no Build.Connect).
 *
 * É um `<button>` DE VERDADE, e não um `onClick` na `<div>` da célula: o
 * teclado chega nele com Tab, abre com Enter, e o leitor de tela anuncia que
 * ali se cria alguma coisa. Um clique pendurado numa `<div>` não faz nada
 * disso.
 *
 * OCUPA A SOBRA DA CÉLULA (`flex-1`), por baixo dos cards e nunca por cima:
 * com posicionamento absoluto ele cobriria os cards e roubaria o clique de
 * quem só queria abrir uma atividade. Assim, cada clique vai para o alvo que
 * está debaixo do dedo.
 *
 * O "+" SÓ APARECE NO PASSAR DO MOUSE. Um sinal fixo em 42 células de um mês
 * é mais tinta na tela do que o calendário inteiro — e o alvo continua lá para
 * quem usa teclado, que o encontra pelo anel de foco.
 */
export function NovaAtividadeNoDia({
  data,
  pessoas,
}: {
  /** `YYYY-MM-DD` do dia desta célula. */
  data: string;
  pessoas: readonly { id: string; name: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  // Em UTC, igual à grade: o rótulo tem de dizer o mesmo dia da célula que o
  // contém, e não o dia do fuso de quem olha.
  const dia = new Date(`${data}T00:00:00.000Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={`Nova atividade em ${dia}`}
        className="group flex min-h-[1.25rem] flex-1 items-center justify-center rounded-md border border-dashed border-transparent transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus
          className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      </button>
      {aberto && (
        <AtividadeModal
          pessoas={pessoas}
          dataInicial={data}
          onClose={() => setAberto(false)}
        />
      )}
    </>
  );
}
