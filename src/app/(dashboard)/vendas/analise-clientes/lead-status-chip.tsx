import type { WholesaleLeadStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

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
  EM_ANALISE: {
    label: "Em análise",
    chip: "bg-secondary text-secondary-foreground",
    dot: "bg-slate-400",
  },
  APROVADO: { label: "Aprovado", chip: "bg-emerald-700 text-white", dot: "bg-emerald-600" },
  REPROVADO: {
    label: "Reprovado",
    chip: "bg-destructive text-destructive-foreground",
    dot: "bg-destructive",
  },
  CUIDADO: { label: "Cuidado", chip: "bg-amber-400 text-amber-950", dot: "bg-amber-400" },
};

/** Os quatro status na ordem do fluxo, para montar o seletor do modal. */
export const LEAD_STATUS_ORDER: WholesaleLeadStatus[] = [
  "EM_ANALISE",
  "APROVADO",
  "REPROVADO",
  "CUIDADO",
];

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
