import type { WholesaleLeadStatus } from "@prisma/client";
import { cn } from "@/lib/utils";
import { STATUS_VIVOS, type PurchaseState } from "@/lib/wholesale-permissions";

/**
 * Chip de status de uma candidatura de atacado.
 *
 * POR QUE NÃO O `StatusBadge` de `src/components/shared/status-badge.tsx`:
 * aquele é tipado em `OrderStatus` e lê o `STATUS_STYLE` de `order-flow.ts`.
 * Uma candidatura a revenda não é um pedido — ela tem enum próprio
 * (`WholesaleLeadStatus`) e taxonomia própria. Alargar o `StatusBadge` para
 * aceitar os dois enums faria o badge de PEDIDO depender de uma taxonomia que
 * não é dele, e um `as OrderStatus` para enganar o tipo esconderia a
 * divergência até o dia em que um dos dois enums ganhasse um status novo —
 * e aí o defeito apareceria como "o chip ficou sem cor", a pista mais
 * inútil possível. Então: chip próprio, pequeno, local a esta tela.
 *
 * POR QUE AS CORES NÃO SÃO AS DOS SETORES: a paleta deste projeto é lida POR
 * SETOR. É o que o comentário do token `servico` em `tailwind.config.ts`
 * registra, ao explicar que um botão "motorista" no meio de Vendas "leria como
 * engano" — e é a razão de `servico` existir como token próprio em vez de
 * reusar o mesmo verde. Um chip de status comunica um ESTADO, não um setor,
 * então aqui as cores são semânticas, como `globals.css` já faz para o estado
 * do pedido (`.card-overdue` em vermelho cru, `.card-warn` em âmbar cru).
 *
 * ACESSIBILIDADE — o âmbar leva texto ESCURO, nunca branco. `globals.css`
 * documenta a conta: branco sobre amber-300 (~#fcd34d) "não passa em nenhum
 * critério" de contraste, e por isso o `.card-warn` força `#451a03`
 * (amber-950) sobre o amarelo. Aqui o par é amber-950 sobre amber-400:
 * ~9:1, folgado até para texto de 12px.
 *
 * Pelo mesmo motivo o verde é `emerald-700`, não `emerald-600`: branco sobre
 * emerald-600 dá ~3,8:1, abaixo do 4,5:1 que o WCAG AA pede para texto
 * normal; sobre emerald-700 dá ~5,5:1. O chip é texto pequeno, então o piso
 * que vale é o de texto normal, não o de texto grande.
 *
 * `chip` e `dot` são DOIS trabalhos diferentes, como em `TRANSPORT_STATUS_STYLE`:
 * o chip precisa de contraste do TEXTO contra o próprio fundo; o ponto (e a
 * fatia da barra empilhada do painel) precisa se separar do FUNDO DA TELA, sem
 * texto nenhum em cima. Por isso "Em análise" é `bg-secondary` no chip e
 * `bg-slate-400` no ponto: um ponto de 8px em `bg-secondary` sobre o card
 * desapareceria, e a fatia dele na barra sumiria dentro da própria trilha —
 * que também é `bg-secondary`. Um estado invisível num painel lê-se como
 * "nenhuma candidatura nesse estado", que é a informação errada.
 */
export const LEAD_STATUS_META: Record<
  WholesaleLeadStatus,
  { label: string; chip: string; dot: string }
> = {
  /**
   * AMARELO desde 30/10/2026, a pedido do dono: era `bg-secondary`, o cinza do
   * card, e numa coluna de status o estado mais comum ficava justamente o único
   * sem cor — "ainda não decidida" lia como "sem informação".
   *
   * Texto ESCURO sobre o amarelo, pela conta de contraste no topo deste
   * arquivo: yellow-950 sobre yellow-300 dá ~11:1, folgado para 12px.
   *
   * FICA PERTO DO CUIDADO (amber-400), e isso é sabido: são dois amarelos
   * vizinhos na mesma coluna. `Cuidado` é raro e some do painel, então o par
   * convive — mas se um dia confundir, é o Cuidado que muda para laranja, não
   * este, porque "em análise" é o estado que se procura de relance.
   */
  EM_ANALISE: {
    label: "Em análise",
    chip: "bg-yellow-300 text-yellow-950",
    dot: "bg-yellow-400",
  },
  APROVADO: { label: "Aprovado", chip: "bg-emerald-700 text-white", dot: "bg-emerald-600" },
  REPROVADO: {
    label: "Reprovado",
    chip: "bg-destructive text-destructive-foreground",
    dot: "bg-destructive",
  },
  CUIDADO: { label: "Cuidado", chip: "bg-amber-400 text-amber-950", dot: "bg-amber-400" },
  /**
   * LEGADO, e por isso FORA de `LEAD_STATUS_ORDER`: ninguém pode escolher este
   * status, e ele não é balde de contagem.
   *
   * A entrada fica aqui de propósito. O diário de auditoria tem linhas reais
   * `APROVADO -> COMPROU` de quando a compra era status, e sem este `meta` elas
   * cairiam no chip neutro exibindo o texto cru `COMPROU`. Renderizar o
   * histórico é o único uso que resta.
   */
  COMPROU: { label: "Comprou", chip: "bg-emerald-800 text-white", dot: "bg-emerald-700" },
};

/**
 * Os status VIVOS na ORDEM DO FLUXO, para o seletor do modal, para o filtro da
 * lista e para a barra empilhada do painel.
 *
 * Derivado de `STATUS_VIVOS` em vez de escrito à mão: era a quarta cópia da
 * mesma lista, e é a única que a tela mostra. Perder o COMPROU daqui é o que
 * tira a opção do filtro (`filtros-client.tsx` itera esta lista) sem editar
 * mais nada.
 */
export const LEAD_STATUS_ORDER: WholesaleLeadStatus[] = [...STATUS_VIVOS];

/**
 * O eixo de COMPRA, na ordem do funil: amarelo, verde, vermelho.
 *
 * AS CORES SÃO AS PEDIDAS (30/10/2026) e revertem duas decisões anteriores,
 * registradas aqui porque cada uma tinha um motivo:
 *
 *  - A família era teal/sky/slate, SÓ deste eixo, para "Aprovado" e "Comprou"
 *    não lerem como a mesma informação dita duas vezes nas colunas vizinhas.
 *    Agora Comprou é o mesmo verde de Aprovado — na prática as duas colunas
 *    concordam quase sempre (quem comprou está aprovada), então a repetição
 *    confirma em vez de confundir.
 *  - `NAO_COMPROU` era neutro, não vermelho, para não pôr quem simplesmente não
 *    comprou no mesmo visual de quem foi recusada por risco. Em vermelho ele
 *    agora lê como resultado ruim, que é a leitura pedida: a coluna existe para
 *    a Gestão ver de longe onde a venda não aconteceu.
 *
 * Contrastes pela mesma régua do chip de status: yellow-950 sobre yellow-300
 * ~11:1, branco sobre emerald-700 ~5,5:1 e o `destructive` do tema, todos acima
 * do 4,5:1 do WCAG AA para texto pequeno.
 */
export const PURCHASE_META: Record<
  PurchaseState,
  { label: string; chip: string; dot: string }
> = {
  CADENCIA: { label: "Cadência", chip: "bg-yellow-300 text-yellow-950", dot: "bg-yellow-400" },
  COMPROU: { label: "Comprou", chip: "bg-emerald-700 text-white", dot: "bg-emerald-600" },
  NAO_COMPROU: {
    label: "Não comprou",
    chip: "bg-destructive text-destructive-foreground",
    dot: "bg-destructive",
  },
};

/**
 * O status chega como `string` porque é assim que as consultas o devolvem
 * (`LeadRow.status`, `DuplicateAlert.status`). Valor desconhecido não quebra a
 * tela: cai no chip neutro com o texto cru, que é mais honesto que um chip
 * colorido exibindo o rótulo errado.
 */
export function LeadStatusChip({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const meta = LEAD_STATUS_META[status as WholesaleLeadStatus];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        meta?.chip ?? "bg-secondary text-secondary-foreground",
        className,
      )}
    >
      {meta?.label ?? status}
    </span>
  );
}
