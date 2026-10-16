import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";
import { NovoSelectForm } from "./form";

/**
 * NOVO SELECT — adesão de uma cliente a um plano de serviço.
 *
 * Mesma lista de perfis da tela de Vendas. A restrição mais apertada (só
 * Gestão e Financeiro CONFIRMAM troca de plano) é aplicada na action, não
 * aqui: quem é de Vendas entra, preenche e cadastra normalmente — só esbarra
 * na troca, e é avisado disso já na busca pelo código.
 *
 * Os planos vêm do banco, sem nome fixo no código: criar um quinto plano é
 * cadastro, não deploy.
 *
 * RESPONSÁVEL: Gestão e Financeiro escolhem o vendedor a quem a venda pertence;
 * quem é de Vendas é responsável de si mesmo e vê o campo travado. A lista de
 * candidatos é carregada só para quem pode escolher — para Vendas ela seria uma
 * ida ao banco sem uso. Esconder o campo não decide nada: a action confere o
 * vendedor escolhido de novo, no servidor.
 */
export default async function NovoSelectPage() {
  const session = await requireRole(["VENDAS", "GESTAO", "FINANCEIRO"]);
  // Mesmo grupo que a action chama de PERFIS_PRIVILEGIADOS. Serve a duas
  // perguntas distintas desta tela — confirmar troca e escolher responsável —
  // que hoje têm a mesma resposta.
  const privilegiado = session.role === "GESTAO" || session.role === "FINANCEIRO";

  const [plans, sellers] = await Promise.all([
    prisma.selectPlan.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { benefits: { orderBy: { sortOrder: "asc" }, select: { text: true } } },
    }),
    privilegiado
      ? prisma.user.findMany({
          where: { role: "VENDAS", active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <BackButton href="/vendas" />
      <h1 className="mb-4 text-2xl font-bold text-servico">Novo Select</h1>
      <Card>
        <CardHeader><CardTitle>Dados do serviço</CardTitle></CardHeader>
        <CardContent>
          <NovoSelectForm
            responsibleName={session.name}
            canChooseResponsible={privilegiado}
            sellers={sellers}
            canConfirmTroca={privilegiado}
            plans={plans.map((p) => ({
              id: p.id,
              name: p.name,
              validityMonths: p.validityMonths,
              monthlyAmount: p.monthlyAmount == null ? null : Number(p.monthlyAmount),
              minMonthlyPurchase: p.minMonthlyPurchase == null ? null : Number(p.minMonthlyPurchase),
              editableValues: p.editableValues,
              benefits: p.benefits.map((b) => b.text),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
