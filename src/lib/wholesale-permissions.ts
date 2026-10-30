import { isValidRejectionCode } from "@/lib/wholesale-rejection-codes";

/**
 * Acesso e transição de status da Análise de Clientes.
 *
 * Puro, no padrão de `permissions.ts`: quem chama carrega a linha do banco e
 * obedece. A guarda real é na Server Action — esconder o botão na tela não é
 * controle de acesso.
 */

export interface WholesaleActor {
  userId: string;
  role: string;
  salesModel: string | null;
}

export const WHOLESALE_DENIED_MSG =
  "Você não tem permissão para acessar a Análise de Clientes.";

/**
 * A ferramenta é do perfil Vendas no escopo Atacado, mais a Gestão (decisões
 * 15 e 16). FINANCEIRO fica fora (decisão 17): `permissions.ts` lhe dá
 * paridade com Vendas em PEDIDOS, e candidatura a revenda não é pedido.
 */
export function canUseWholesaleTool(actor: WholesaleActor): boolean {
  if (actor.role === "GESTAO") return true;
  return actor.role === "VENDAS" && actor.salesModel === "ATACADO";
}

/**
 * Vendedora de atacado vê só os próprios — inclusive NÃO vê os sem dono, que
 * são da fila da Gestão. Espelha `/vendas`, onde VENDAS vê só os próprios
 * pedidos.
 */
export function canSeeLead(
  actor: WholesaleActor,
  lead: { sellerId: string | null },
): boolean {
  if (!canUseWholesaleTool(actor)) return false;
  if (actor.role === "GESTAO") return true;
  // `actor.userId` conferido explicitamente: sem isto, ator e lead ambos com o
  // campo `undefined` casavam e a função devolvia `true`. Inalcançável hoje —
  // `atorAtual` sempre preenche o id —, mas `listLeadsFor` já decidiu que esta
  // classe de comparação merece guarda, e "comparar dois vazios" é como um
  // controle de acesso passa a liberar em vez de negar.
  if (!actor.userId) return false;
  return lead.sellerId !== null && lead.sellerId === actor.userId;
}

/** Decidir segue exatamente quem pode ver. */
export function canDecideLead(
  actor: WholesaleActor,
  lead: { sellerId: string | null },
): boolean {
  return canSeeLead(actor, lead);
}

/**
 * OS STATUS QUE O SISTEMA ESCREVE, e a lista única deles.
 *
 * `WholesaleLeadStatus` tem um sexto valor, `COMPROU`, que é LEGADO: ele existe
 * no enum do Postgres só para o `WholesaleLeadEvent` histórico continuar
 * verdadeiro, e nenhum caminho de código o escreve desde que a compra virou
 * eixo próprio (`WholesalePurchaseState`). Ver a nota no schema.
 *
 * Por isso NÃO se itera `Object.values(WholesaleLeadStatus)` para montar lista
 * de opções, balde de contagem ou validação: o valor legado vazaria em todos.
 * Quem precisa dos status vivos usa esta const — ela é a fonte, e antes dela a
 * mesma lista estava escrita à mão em quatro lugares que divergiam sozinhos.
 */
export const STATUS_VIVOS = ["EM_ANALISE", "APROVADO", "REPROVADO", "CUIDADO"] as const;

/**
 * Os três estados do eixo de COMPRA, na ordem do funil.
 *
 * `CADENCIA` é onde toda aprovada começa: está na régua de contato e ainda não
 * comprou. `NAO_COMPROU` é decisão humana — a reconciliação automática
 * (`wholesale-compra.ts`) nunca a desfaz.
 */
export const PURCHASE_STATES = ["CADENCIA", "COMPROU", "NAO_COMPROU"] as const;

export type PurchaseState = (typeof PURCHASE_STATES)[number];

export interface DecisionInput {
  toStatus: string;
  rejectionCode?: string | null;
  cautionReason?: string | null;
}

export type DecisionResult =
  | { error: string }
  | { ok: true; rejectionCode: string | null; cautionReason: string | null };

/**
 * As invariantes do veredito, num só lugar.
 *
 * Além de recusar veredito sem motivo (decisões 8 e 10), esta função APAGA o
 * campo que deixou de valer. Trocar REPROVADO por CUIDADO sem limpar o código
 * deixaria a tela exibindo um motivo de reprovação sob um alerta de risco — a
 * informação continuaria lá, errada, e ninguém saberia que ela é resto.
 */
export function resolveDecision(input: DecisionInput): DecisionResult {
  if (!STATUS_VIVOS.includes(input.toStatus as (typeof STATUS_VIVOS)[number])) {
    return { error: "Status inválido." };
  }

  if (input.toStatus === "REPROVADO") {
    const code = input.rejectionCode?.trim();
    if (!code) return { error: "Escolha o motivo da reprovação." };
    if (!isValidRejectionCode(code)) return { error: "Motivo de reprovação inválido." };
    return { ok: true, rejectionCode: code, cautionReason: null };
  }

  if (input.toStatus === "CUIDADO") {
    const reason = input.cautionReason?.trim();
    if (!reason) return { error: "Descreva o motivo do alerta." };
    return { ok: true, rejectionCode: null, cautionReason: reason };
  }

  // APROVADO e EM_ANALISE não carregam motivo nenhum.
  return { ok: true, rejectionCode: null, cautionReason: null };
}

export type PurchaseResult = { error: string } | { ok: true; purchaseState: PurchaseState };

/**
 * A invariante do eixo de compra: ELE SÓ EXISTE PARA QUEM FOI APROVADA.
 *
 * "Comprou" sem análise não é um caminho que o negócio tenha — e marcar compra
 * numa candidatura reprovada colocaria no numerador da conversão uma venda que
 * nunca foi julgada. A regra é a mesma que `resolveDecision` guardava enquanto
 * COMPROU era status; mudou de lugar junto com o dado.
 *
 * O `status` vem de FORA, lido do banco por quem chama, porque esta função é
 * pura — e porque o valor tem de ser o do banco, não o que a tela diz que era:
 * a lista pode estar aberta há meia hora e a candidatura ter sido reprovada
 * nesse meio-tempo por outra pessoa.
 *
 * Conferido AQUI, e não só escondendo o dropdown na linha não-aprovada: a tela
 * esconder é conveniência, esta função é a autoridade.
 */
export function resolvePurchase(input: {
  purchaseState: string;
  status: string;
}): PurchaseResult {
  const estado = input.purchaseState?.trim();
  if (!PURCHASE_STATES.includes(estado as PurchaseState)) {
    return { error: "Estado de compra inválido." };
  }
  if (input.status?.trim() !== "APROVADO") {
    return { error: "Só uma candidatura aprovada tem estado de compra." };
  }
  return { ok: true, purchaseState: estado as PurchaseState };
}
