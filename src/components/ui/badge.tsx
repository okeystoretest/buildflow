import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        vendas: "border-transparent bg-vendas text-vendas-fg",
        financeiro: "border-transparent bg-financeiro text-financeiro-fg",
        distribuicao: "border-transparent bg-distribuicao text-distribuicao-fg",
        motorista: "border-transparent bg-motorista text-motorista-fg",
        brand: "border-transparent bg-brand text-brand-fg",
        marketing: "border-transparent bg-marketing text-marketing-fg",
        // Saude 🟢🟡🔴 do Relatorio Semanal. A receita (fundo a 15%, texto
        // escuro no claro e claro no escuro) e a mesma de `STATUS_STYLE` em
        // order-flow.ts, que e o vocabulario de cor semantica da casa.
        //
        // A COR NUNCA VIAJA SOZINHA: quem usa estes tons escreve o rotulo ao
        // lado ("No ritmo", "Atencao", "Travado"). O quadro e auditado na
        // sexta, as vezes impresso, e cerca de 1 em 12 homens nao distingue
        // vermelho de verde.
        ok: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        atencao: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300",
        risco: "border-transparent bg-red-500/15 text-red-700 dark:text-red-300",
        neutro: "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
