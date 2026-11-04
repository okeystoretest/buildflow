import { cn } from "@/lib/utils";

/**
 * Cabecalho padrao de uma ferramenta: titulo e uma linha dizendo para que a
 * tela serve.
 *
 * Existe como componente, e nao como par de tags copiado em cada pagina,
 * porque a regra e "toda ferramenta TEM titulo e descricao": com o par solto,
 * a tela nova nasce sem a descricao e ninguem percebe. Aqui a descricao e
 * obrigatoria no tipo — esquecer dela nao compila.
 *
 * `acoes` fica na direita do titulo, para os botoes da tela (os de NAVEGACAO
 * vivem na barra lateral, nao aqui).
 */
export function PageHeader({
  titulo,
  descricao,
  corTitulo,
  acoes,
}: {
  titulo: string;
  descricao: string;
  /** Classe de cor do modulo, ex.: "text-vendas-text". */
  corTitulo?: string;
  acoes?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <div className="min-w-0">
        <h1 className={cn("text-2xl font-bold", corTitulo)}>{titulo}</h1>
        <p className="text-sm text-muted-foreground">{descricao}</p>
      </div>
      {acoes && <div className="flex flex-wrap justify-end gap-2">{acoes}</div>}
    </div>
  );
}
