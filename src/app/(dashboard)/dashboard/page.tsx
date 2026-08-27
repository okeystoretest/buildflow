import { requireRole } from "@/lib/auth";
import { computeRankData } from "@/lib/rank-data";
import { RankBoard } from "./rank-board";

export default async function DashboardPage() {
  // Rank liberado tambem para VENDAS (visao completa, igual a Gestao).
  const session = await requireRole(["GESTAO", "VENDAS"]);
  const data = await computeRankData();

  // EDICAO MANUAL DO REALIZADO: exclusiva de GESTAO. O quadro e liberado para
  // VENDAS, mas deixar a vendedora editar o proprio numero seria conflito de
  // interesse — o ranking deixaria de ser auditavel. A trava tambem existe no
  // servidor (requireRoleAction em lib/actions/rank-adjustments.ts); aqui e so
  // para nao renderizar um botao que a action recusaria.
  return <RankBoard initial={data} canEdit={session.role === "GESTAO"} />;
}
