import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { computeRankData } from "@/lib/rank-data";

// Dados do Rank de Vendas para atualizacao em tempo real (telao).
// Aceita ?month=1-12&year=YYYY para consultar periodos passados.
export async function GET(req: Request) {
  const session = await getSession();
  // Rank liberado para GESTAO e VENDAS (a vendedora ve o quadro completo).
  if (!session || (session.role !== "GESTAO" && session.role !== "VENDAS")) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const monthRaw = searchParams.get("month");
  const yearRaw = searchParams.get("year");
  const month = monthRaw ? Number(monthRaw) : undefined;
  const year = yearRaw ? Number(yearRaw) : undefined;

  const data = await computeRankData({
    month: Number.isFinite(month) ? month : undefined,
    year: Number.isFinite(year) ? year : undefined,
  });
  return NextResponse.json(data);
}
