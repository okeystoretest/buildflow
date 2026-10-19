import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

/**
 * As duas telas da Análise de Clientes: a fila de candidaturas e o painel.
 *
 * Rotas separadas, e não um estado dentro da mesma página, porque a lista
 * carrega as 18 respostas de cada linha e os avisos de cadastro repetido —
 * trabalho que o painel não usa. Numa página só, abrir o dashboard pagaria por
 * tudo isso para não desenhar nada disso.
 *
 * `ativa` vem da página (Server Component) em vez de `usePathname`: o indicador
 * sai pronto do servidor, sem precisar que isto vire componente de cliente.
 */
export function AnaliseClientesTabs({ ativa }: { ativa: "lista" | "dashboard" }) {
  return (
    <nav className="flex gap-1 border-b border-border" aria-label="Seções da Análise de Clientes">
      <Aba href="/vendas/analise-clientes" rotulo="Candidaturas" ativa={ativa === "lista"} />
      <Aba
        href="/vendas/analise-clientes/dashboard"
        rotulo="Dashboard"
        ativa={ativa === "dashboard"}
      />
    </nav>
  );
}

function Aba({ href, rotulo, ativa }: { href: string; rotulo: string; ativa: boolean }) {
  return (
    <Link
      href={href}
      // `aria-current` e não só a cor: a aba ativa precisa ser anunciada a quem
      // usa leitor de tela, que não vê a borda embaixo.
      aria-current={ativa ? "page" : undefined}
      className={
        "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors " +
        (ativa
          ? "border-vendas text-vendas-text"
          : "border-transparent text-muted-foreground hover:border-border hover:text-foreground")
      }
    >
      {rotulo}
    </Link>
  );
}

/** A mesma negação nas duas telas: quem não é do Atacado não entra em nenhuma. */
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
