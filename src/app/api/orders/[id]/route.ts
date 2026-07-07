import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Detalhe completo do pedido para o modal do Kanban / Financeiro.
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

  // Rastreabilidade (1.4): o historico guarda changedBy = ID do usuario.
  // Aqui traduzimos os IDs para NOMES em uma unica consulta, e devolvemos
  // cada entrada com changedByName para o modal exibir "por Fulano".
  const changerIds = Array.from(
    new Set(order.history.map((h) => h.changedBy).filter((v): v is string => !!v)),
  );
  const changers = changerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: changerIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(changers.map((u) => [u.id, u.name]));

  const history = order.history.map((h) => ({
    id: h.id,
    status: h.status,
    note: h.note,
    createdAt: h.createdAt,
    changedByName: h.changedBy ? nameById.get(h.changedBy) ?? null : null,
  }));

  return NextResponse.json({ ...order, history });
}
