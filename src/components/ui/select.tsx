import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Opcao do select. A forma curta (string) serve as listas em que o rotulo E o
 * valor gravado; a forma longa separa os dois, para listas cujo valor e um id
 * e o rotulo, um nome de pessoa.
 */
export type SelectOption = string | { value: string; label: string };

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: readonly SelectOption[];
  /** Quando presente, adiciona uma opcao vazia inicial. */
  placeholder?: string;
}

const valorDa = (o: SelectOption) => (typeof o === "string" ? o : o.value);
const rotuloDe = (o: SelectOption) => (typeof o === "string" ? o : o.label);

/**
 * Select NATIVO, com a moldura do `Input`.
 *
 * Nativo de proposito, mesmo com o `@radix-ui/react-select` instalado: no
 * celular o seletor do sistema e melhor do que qualquer lista que se desenhe,
 * e aqui nao ha busca, icone por opcao nem grupo — nada que justifique trocar
 * o controle do sistema por um menu em JavaScript.
 *
 * A seta e desenhada por fora (`appearance-none`) porque a do sistema nao
 * aceita cor, e no tema escuro ela sumia dentro do campo.
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, placeholder, value, ...props }, ref) => {
    const vazio = placeholder !== undefined && (value === "" || value === undefined);
    return (
      <div className="relative">
        <select
          ref={ref}
          value={value}
          className={cn(
            "flex h-10 w-full appearance-none rounded-lg border border-input bg-background pl-3 pr-9 text-sm transition-colors",
            "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            "disabled:cursor-not-allowed disabled:opacity-50",
            vazio ? "text-muted-foreground" : "text-foreground",
            className,
          )}
          {...props}
        >
          {placeholder !== undefined && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={valorDa(o)} value={valorDa(o)}>
              {rotuloDe(o)}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    );
  },
);
Select.displayName = "Select";

export { Select };
