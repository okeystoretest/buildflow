import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { BackButton } from "@/components/shared/back-button";
import { getSelectDetail } from "@/lib/select-queries";
import { SelectDetailClient } from "./detail-client";

/**
 * Detalhe de um Select: o contrato, o vínculo de troca, as parcelas com os
 * pagamentos e o acompanhamento do mínimo de compras ciclo a ciclo.
 */
export default async function SelectDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await requireRole(["FINANCEIRO", "GESTAO"]);

  const [detail, paymentMethods, banks, cnpjs] = await Promise.all([
    getSelectDetail(params.id),
    prisma.paymentMethod.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.bank.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.cnpj.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!detail) notFound();

  // 7xl, nao 6xl: quem manda na largura desta tela e a regua do roadmap — cada
  // 8rem a mais e mais uma etapa visivel sem rolar.
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <BackButton href="/financeiro/select" />
      <SelectDetailClient
        detail={detail}
        paymentMethods={paymentMethods}
        banks={banks}
        cnpjs={cnpjs}
      />
    </div>
  );
}
