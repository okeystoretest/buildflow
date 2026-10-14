"use client";

import { useState, useTransition } from "react";
import { ClipboardCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assignLeadSeller } from "@/lib/actions/wholesale-leads";
import { DecisionModal, type DuplicateAlertView, type LeadAnswers } from "./decision-modal";

/**
 * A FRONTEIRA DE CLIENTE da Análise de Clientes.
 *
 * A página é Server Component (é lá que o escopo do ator é aplicado, no
 * WHERE), mas o modal precisa de estado e de `useTransition`. Este arquivo é
 * só essa fronteira: ele guarda o aberto/fechado e monta o modal. A substância
 * fica em `decision-modal.tsx` — aqui não há regra de negócio nenhuma.
 *
 * O segundo componente, `DistribuirLeadSelect`, é a ação de linha da FILA DA
 * GESTÃO, e está no mesmo arquivo pelo mesmo motivo: é a ação de uma linha da
 * tabela e precisa de estado. Separar em outro arquivo só para ter dois
 * arquivos de uma fronteira cada não ajudaria quem for ler isto depois.
 */
export function LeadRowActions({
  lead,
  alerts,
}: {
  lead: LeadAnswers;
  alerts: DuplicateAlertView[];
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
 * servidor — e `assignLeadSeller` relê a vendedora escolhida no banco e
 * reconfere papel, escopo e `active`. A lista aqui é conveniência; a guarda é
 * a action.
 */
export function DistribuirLeadSelect({
  leadId,
  vendedoras,
}: {
  leadId: string;
  vendedoras: { id: string; name: string }[];
}) {
  const [sellerId, setSellerId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function distribuir() {
    setErro(null);
    start(async () => {
      const r = await assignLeadSeller({ leadId, sellerId });
      // Sucesso não precisa de tratamento: a action revalida a rota e a linha
      // sai da fila sozinha, porque a fila é "quem está sem dono".
      if (!r.ok) setErro(r.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <select
        value={sellerId}
        onChange={(e) => setSellerId(e.target.value)}
        disabled={pending || vendedoras.length === 0}
        aria-label="Vendedora de destino"
        className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
      >
        <option value="">
          {vendedoras.length === 0 ? "Nenhuma vendedora de atacado ativa" : "Escolha a vendedora..."}
        </option>
        {vendedoras.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
      <Button
        variant="vendas"
        size="sm"
        onClick={distribuir}
        // Sem destino escolhido a action responderia "Escolha uma vendedora de
        // atacado ativa." — é a mesma informação, uma ida ao servidor antes.
        disabled={pending || !sellerId}
      >
        <UserPlus className="h-4 w-4" /> {pending ? "Distribuindo..." : "Distribuir"}
      </Button>
      {erro && <span className="w-full text-right text-xs text-destructive">{erro}</span>}
    </div>
  );
}
