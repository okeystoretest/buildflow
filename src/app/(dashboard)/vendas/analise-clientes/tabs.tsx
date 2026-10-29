import { Card, CardContent } from "@/components/ui/card";

/**
 * A ANÁLISE DE CLIENTES É UMA TELA SÓ desde 28/10/2026.
 *
 * Havia duas abas — "Candidaturas" e "Dashboard" — em rotas separadas, porque a
 * lista carrega as 18 respostas de cada linha e os avisos de cadastro repetido,
 * trabalho que o painel não usa. A aba saiu a pedido do dono: os filtros eram
 * dois conjuntos para a mesma pergunta, e trocar de aba obrigava a reaplicá-los
 * na mão. O painel agora é um componente da própria página (`painel.tsx`), o
 * custo da junção está anotado lá, e este arquivo guarda só o que as duas telas
 * tinham em comum.
 */

/** Quem não é do Atacado não entra. */
export function AcessoNegadoAtacado() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-vendas-text">Análise de Clientes</h1>
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          A Análise de Clientes é da equipe de Atacado.
        </CardContent>
      </Card>
    </div>
  );
}
