import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { BackButton } from "@/components/shared/back-button";
import { Badge } from "@/components/ui/badge";
import { SelectRoadmapCard } from "@/components/shared/select-roadmap-card";
import { SelectPurchaseCycles } from "@/components/shared/select-purchase-cycles";
import { getSellerSelectDetail } from "@/lib/select-queries";
import { CONTRACT_STATE_LABEL, type ContractState } from "@/lib/select-contract";

const BADGE: Record<ContractState, string> = {
  ATIVO: "bg-servico/15 text-servico-text",
  AGENDADO: "bg-brand/15 text-brand-text",
  ENCERRADO: "bg-secondary text-muted-foreground",
  CANCELADO: "bg-destructive/15 text-destructive",
};

/**
 * O SELECT DE UMA CLIENTE, visto pela vendedora: as duas coisas que são dela.
 *
 * Nenhuma parcela, nenhum pagamento, nenhum cancelamento — isso é do
 * Financeiro e vive em `/financeiro/select/[id]`. A consulta nem traz esses
 * dados, então não há o que esquecer de esconder.
 *
 * Select de outra vendedora cai em 404, não em "sem permissão": a existência
 * do contrato já é informação (princípio 6).
 */
export default async function VendasSelectDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const session = await requireRole(["VENDAS"]);
  const detail = await getSellerSelectDetail(params.id, session.userId);
  if (!detail) notFound();

  // Mesma largura do detalhe do Financeiro: sao os MESMOS dois cards, e a regua
  // precisa do espaco igual nos dois lugares.
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <BackButton href="/vendas/select" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-servico-text">
            <Star className="h-6 w-6" /> {detail.customerName}
          </h1>
          <p className="font-data text-sm text-muted-foreground">
            {detail.customerCode} · {detail.planName}
          </p>
        </div>
        <Badge className={BADGE[detail.state]}>{CONTRACT_STATE_LABEL[detail.state]}</Badge>
      </div>

      <SelectRoadmapCard steps={detail.steps} bloqueado={detail.state === "CANCELADO"} />

      <SelectPurchaseCycles cycles={detail.cycles} />
    </div>
  );
}
