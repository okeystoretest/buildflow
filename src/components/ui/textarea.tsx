import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * Campo de texto longo, irmao do `Input`: as mesmas bordas, o mesmo foco, a
 * mesma altura de linha.
 *
 * `resize-none` NAO E DETALHE, e regra da casa: o campo que a pessoa arrasta
 * sai do lugar e empurra o resto do formulario. Quem precisa de mais espaco
 * ganha `rows`, nao uma alca.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "flex w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm transition-colors",
        "ring-offset-background placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
