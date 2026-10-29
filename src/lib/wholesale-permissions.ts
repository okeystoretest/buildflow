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

const STATUSES = ["EM_ANALISE", "APROVADO", "REPROVADO", "CUIDADO", "COMPROU"] as const;

export interface DecisionInput {
  toStatus: string;
  rejectionCode?: string | null;
  cautionReason?: string | null;
  /**
   * O status ATUAL da candidatura, lido do banco por quem chama.
   *
   * Existe só por causa do COMPROU, que é a única transição com origem
   * restrita. Vem de fora porque esta função é pura — e porque o valor tem de
   * ser o do banco, não o que a tela diz que era: o modal pode estar aberto há
   * meia hora, e a candidatura pode ter sido decidida nesse meio-tempo por
   * outra pessoa.
   */
  fromStatus?: string | null;
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
  if (!STATUSES.includes(input.toStatus as (typeof STATUSES)[number])) {
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

  // COMPROU SÓ SE ALCANÇA A PARTIR DE APROVADO.
  //
  // Única transição com origem restrita, e a restrição é do negócio, não da
  // tela: comprar sem ter sido aprovada não é um caminho que exista. Marcar
  // "Comprou" direto de EM_ANALISE pularia a análise — e a taxa de aprovação
  // passaria a ter no denominador uma venda que nunca foi julgada.
  //
  // Conferido AQUI, e não só escondendo a opção no modal: a tela esconder é
  // conveniência, e esta função é a autoridade. Marcar de novo quem já está em
  // COMPROU é aceito (é reafirmar, não pular etapa) — mas não muda nada, e
  // `decideLead` já não grava evento quando o status não muda.
  if (input.toStatus === "COMPROU") {
    const atual = input.fromStatus?.trim();
    if (atual !== "APROVADO" && atual !== "COMPROU") {
      return { error: "Só uma candidatura aprovada pode ser marcada como Comprou." };
    }
    return { ok: true, rejectionCode: null, cautionReason: null };
  }

  // APROVADO e EM_ANALISE não carregam motivo nenhum.
  return { ok: true, rejectionCode: null, cautionReason: null };
}
