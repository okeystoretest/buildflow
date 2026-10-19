"use client";

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DecisionModal, type DuplicateAlertView, type LeadAnswers } from "./decision-modal";

/**
 * A FRONTEIRA DE CLIENTE da Análise de Clientes.
 *
 * A página é Server Component (é lá que o escopo do ator é aplicado, no
 * WHERE), mas o modal precisa de estado e de `useTransition`. Este arquivo é
 * só essa fronteira: ele guarda o aberto/fechado e monta o modal. A substância
 * fica em `decision-modal.tsx` — aqui não há regra de negócio nenhuma.
 *
 * `DistribuirLeadSelect` vivia aqui e saiu em 17/10/2026: a distribuição manual
 * da Gestão foi substituída pelo rodízio automático (ver
 * src/lib/wholesale-rodizio.ts). O que restou é a ação de linha da FILA DA
 * GESTÃO, e está no mesmo arquivo pelo mesmo motivo: é a ação de uma linha da
 * tabela e precisa de estado. Separar em outro arquivo só para ter dois
 * arquivos de uma fronteira cada não ajudaria quem for ler isto depois.
 */
export function LeadRowActions({
  lead,
  alerts,
  ehGestao,
}: {
  lead: LeadAnswers;
  alerts: DuplicateAlertView[];
  /** Só a Gestão vê o botão de excluir dentro do modal. */
  ehGestao: boolean;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <ClipboardCheck className="h-4 w-4" /> Analisar
      </Button>
      {/* Montado só quando abre: são 18 respostas por linha, e manter 20
          modais montados por página sem necessidade seria desperdício puro.
          Desmontar também é o que garante que reabrir recomeça dos dados
          atuais do lead, sem resto do estado da vez anterior. */}
      {aberto && (
        <DecisionModal
          lead={lead}
          alerts={alerts}
          ehGestao={ehGestao}
          onClose={() => setAberto(false)}
          // `decideLead` e `setAssistantName` chamam
          // `revalidatePath("/vendas/analise-clientes")`, então a lista se
          // atualiza sozinha quando a action volta. Um `router.refresh()`
          // aqui pediria a mesma coisa duas vezes.
          onDone={() => setAberto(false)}
        />
      )}
    </>
  );
}

/**
 * Distribuição de uma candidatura sem dono (decisão 14).
 *
 * O destino é escolhido numa lista de vendedoras de atacado ativas montada no
 * reconfere papel, escopo e `active`. A lista aqui é conveniência; a guarda é
 * a action.
 */
