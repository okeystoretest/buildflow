import { cn } from "@/lib/utils";

/**
 * O que a tela diz quando nao ha nada para mostrar.
 *
 * Existe para a lista vazia nao ser um retangulo em branco, que se le como
 * "ainda carregando" ou "quebrou". Um titulo e uma linha de explicacao dizem
 * qual dos dois e — e, com `action`, por onde sair do vazio.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-16 text-center",
        className,
      )}
    >
      {icon && (
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
          {icon}
        </span>
      )}
      <p className="text-base font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
