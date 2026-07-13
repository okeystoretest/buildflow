import { requireRole } from "@/lib/auth";
import { computeRankData } from "@/lib/rank-data";
import { RankBoard } from "./rank-board";

export default async function DashboardPage() {
  // Rank liberado tambem para VENDAS (visao completa, igual a Gestao).
  await requireRole(["GESTAO", "VENDAS"]);
  const data = await computeRankData();
  return <RankBoard initial={data} />;
}
