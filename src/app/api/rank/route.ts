import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { computeRankData } from "@/lib/rank-data";

// Dados do Rank de Vendas para atualizacao em tempo real (telao).
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "GESTAO") {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }
  const data = await computeRankData();
  return NextResponse.json(data);
}
