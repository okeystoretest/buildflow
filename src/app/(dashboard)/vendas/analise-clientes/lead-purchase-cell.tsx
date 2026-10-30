"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLeadPurchase } from "@/lib/actions/wholesale-leads";
import { PURCHASE_META } from "./lead-status-chip";
import { PURCHASE_STATES, type PurchaseState } from "@/lib/wholesale-permissions";
import { cn } from "@/lib/utils";

/**
 * A célula de COMPRA da lista de candidaturas: o dropdown que grava direto.
 *
 * GRAVA NA LINHA, sem modal e sem botão de salvar. É a única coisa nesta tela
 * que funciona assim, e a razão é o uso: a Gestão percorre a lista marcando
 * quem comprou, uma linha após a outra. Abrir a ficha inteira (18 respostas,
 * duas fotos) para mudar um campo de três valores, vinte vezes seguidas, é o
 * tipo de atrito que faz a coluna não ser preenchida — e coluna não preenchida
 * vira indicador errado, que é pior que indicador nenhum.
 *
 * O status continua no modal, de propósito: aprovar ou reprovar pede o motivo,
 * a ficha e as fotos. Compra não pede nada disso.
 *
 * SÓ PARA APROVADA. Em qualquer outro status a célula mostra um travessão e
 * nenhum controle, porque o eixo não existe ali (`resolvePurchase`). Esconder
 * aqui é CONVENIÊNCIA: a autoridade é a action, que reconfere com o status lido
 * dentro da transação — a lista pode estar aberta há meia hora e a candidatura
 * ter sido reprovada nesse meio-tempo por outra pessoa.
 *
 * SEM ATUALIZAÇÃO OTIMISTA. `useOptimistic` não é usado em lugar nenhum deste
 * projeto, e aqui seria pior que a espera: mostrar "Comprou" antes de o servidor
 * confirmar, numa decisão comercial que grava evento de auditoria, faria a tela
 * contar uma história que o diário não tem. O padrão da casa é
 * `useTransition` + `disabled` + `router.refresh()`, como em `crud-table.tsx`.
 */
export function LeadPurchaseCell({
  leadId,
  status,
  purchaseState,
}: {
  leadId: string;
  status: string;
  purchaseState: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  if (status !== "APROVADO") {
    // `aria-hidden` no travessão com o rótulo ao lado: um leitor de tela
    // anunciando "menos" na coluna Compra diria algo que não significa nada.
    return (
      <span className="text-muted-foreground">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Sem estado de compra: a candidatura não foi aprovada.</span>
      </span>
    );
  }

  function trocar(novo: string) {
    // Mesmo valor não vai ao servidor. A action já ignora (não grava evento),
    // mas poupar a ida evita o piscar do `disabled` em troca de nada.
    if (novo === purchaseState) return;
    setErro(null);
    start(async () => {
      const r = await setLeadPurchase({ leadId, purchaseState: novo });
      // `revalidatePath` na action já atualiza a lista; o `refresh` é o que
      // devolve o `<select>` ao valor do servidor quando a gravação FALHA —
      // sem ele o controle ficaria exibindo a escolha que não pegou.
      if (r.ok) router.refresh();
      else setErro(r.error);
    });
  }

  return (
    <>
      {/* O rótulo visível é o `<th>Compra</th>` da tabela, que um `<select>`
          por linha não pode repetir — vinte "Compra" na tela. Daí o
          `aria-label` com o que a linha é, para o leitor de tela saber de QUAL
          candidatura este controle é. */}
      {/* O CONTROLE VESTE A COR DO ESTADO EM QUE ESTÁ (30/10/2026, a pedido do
          dono): amarelo em Cadência, verde em Comprou, vermelho em Não
          comprou. Vinte selects cinza numa coluna obrigam a LER cada um; com
          cor, a Gestão vê de longe onde a venda não aconteceu.

          A cor sai do mesmo `PURCHASE_META` dos chips, e não de um mapa
          próprio: dois mapas de cor para o mesmo eixo divergem na primeira
          troca de paleta. Valor desconhecido cai no neutro, como no chip.

          As `<option>` levam a cor do tema de volta: a lista aberta é desenhada
          pelo sistema, e herdar `text-white` de um select verde deixaria texto
          branco sobre fundo branco em parte dos navegadores. */}
      <select
        aria-label="Estado de compra desta candidatura"
        value={purchaseState}
        onChange={(e) => trocar(e.target.value)}
        disabled={pending}
        className={cn(
          "h-9 w-full min-w-[9rem] cursor-pointer rounded-lg border border-transparent px-2 text-sm font-medium",
          "disabled:cursor-not-allowed disabled:opacity-60",
          PURCHASE_META[purchaseState as PurchaseState]?.chip ??
            "border-input bg-background text-foreground",
        )}
      >
        {PURCHASE_STATES.map((p) => (
          <option key={p} value={p} className="bg-background font-normal text-foreground">
            {PURCHASE_META[p].label}
          </option>
        ))}
      </select>
      {erro && (
        // `role="alert"` porque a mensagem aparece depois de uma ação e longe
        // do foco: sem ele, quem usa leitor de tela não saberia que falhou.
        <p role="alert" className="mt-1 text-xs text-destructive">
          {erro}
        </p>
      )}
    </>
  );
}
