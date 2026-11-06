import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { finCreateBank, finCreatePaymentMethod } from "@/lib/actions/finance";
import { CnpjPanel, SimplePanel, StatusPanel } from "../../paineis-client";

/**
 * Os cadastros de apoio do Financeiro, um por rota.
 *
 * Rota ÚNICA e dinâmica, e não quatro arquivos quase iguais: os quatro
 * carregam uma tabela e mostram um painel. O que muda entre eles cabe no
 * `switch` abaixo, e quatro páginas separadas seriam quatro lugares para
 * esquecer o `requireRole`.
 *
 * O papel é conferido AQUI, e de novo em cada action: a página esconder o
 * formulário não impede ninguém de chamar `finCreateBank` direto.
 */

/** Titulo e descricao de cada cadastro, como no menu da barra lateral. */
const TITULOS: Record<string, { titulo: string; descricao: string }> = {
  pagamento: { titulo: "Meios de Pagamento", descricao: "As formas de pagamento que o pedido pode usar." },
  bancos: { titulo: "Registro de Bancos", descricao: "Os bancos disponíveis para registrar um recebimento." },
  status: { titulo: "Situação do Pagamento", descricao: "As situações que um pagamento pode assumir." },
  cnpj: { titulo: "Empresas / CNPJs", descricao: "As empresas do grupo que podem emitir um pedido." },
};

export default async function FerramentaPage(props: { params: Promise<{ tool: string }> }) {
  const { tool } = await props.params;
  await requireRole(["FINANCEIRO", "GESTAO"]);

  const cabecalho = TITULOS[tool];
  // Rota inventada na barra de endereços é 404, não uma página vazia que
  // parece ferramenta quebrada.
  if (!cabecalho) notFound();

  return (
    <div className="space-y-4">

      <Card>
        <CardContent className="pt-6">
          <Painel tool={tool} />
        </CardContent>
      </Card>
    </div>
  );
}

/** Só a consulta da ferramenta pedida sai do banco — não as quatro. */
async function Painel({ tool }: { tool: string }) {
  if (tool === "pagamento") {
    const rows = await prisma.paymentMethod.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, active: true },
    });
    return (
      <SimplePanel
        rows={rows}
        label="forma de pagamento"
        entity="paymentMethod"
        onCreate={finCreatePaymentMethod}
      />
    );
  }

  if (tool === "bancos") {
    const rows = await prisma.bank.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, active: true },
    });
    return (
      <SimplePanel rows={rows} label="banco" entity="bank" onCreate={finCreateBank} />
    );
  }

  if (tool === "status") {
    const rows = await prisma.paymentStatusOption.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, active: true, disposition: true },
    });
    return <StatusPanel rows={rows} />;
  }

  const rows = await prisma.cnpj.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, document: true, active: true },
  });
  return <CnpjPanel rows={rows} />;
}
