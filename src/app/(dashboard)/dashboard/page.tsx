import { requireRole } from "@/lib/auth";
import { computeRankData } from "@/lib/rank-data";
import { RankBoard } from "./rank-board";

export default async function DashboardPage() {
  await requireRole(["GESTAO"]);
  const data = await computeRankData();
  return <RankBoard initial={data} />;
}
