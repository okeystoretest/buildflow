import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Detalhe completo do pedido para o modal do Kanban.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      seller: true,
      store: true,
      orderType: true,
      operation: true,
      paymentMethod: true,
      shippingMethod: true,
      paymentStatus: true,
      cnpj: true,
      delivery: { include: { driver: true, proofs: true } },
      history: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });

  // Restricao por escopo: vendedora so ve os proprios.
  if (session.role === "VENDAS" && order.sellerId !== session.userId) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  return NextResponse.json(order);
}
