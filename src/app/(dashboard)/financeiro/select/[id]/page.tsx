import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
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
    <div className="space-y-6">
      {/* VOLTAR, só aqui (pedido do dono, 06/11/2026). Os botões de voltar
          saíram do sistema porque cada FERRAMENTA tem página própria e o
          caminho de volta é o menu — mas um contrato não é ferramenta: não
          está no menu, e sem isto só o botão do navegador traz de volta.
          `<Link>` para a lista, e não `router.back()`: a lista é o único
          caminho de entrada, o destino é previsível e não precisa de
          componente cliente para trocar de URL. */}
      <Link
        href="/financeiro/select"
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Contratos Select
      </Link>

      <SelectDetailClient
        detail={detail}
        paymentMethods={paymentMethods}
        banks={banks}
        cnpjs={cnpjs}
      />
    </div>
  );
}
