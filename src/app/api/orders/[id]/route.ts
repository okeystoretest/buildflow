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
      bank: true,
      shippingMethod: true,
      paymentStatus: true,
      cnpj: true,
      delivery: { include: { driver: true, proofs: true } },
      paymentProofs: { orderBy: { createdAt: "asc" } },
      financeProofs: { orderBy: { createdAt: "asc" } },
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

  // RECORTE POR PAPEL (motorista).
  //
  // O motorista abre este pedido pelo OrderDetailModal em `driverMode`, que ja
  // esconde na tela os valores, os comprovantes, a Nota Fiscal e a edicao. Mas
  // esconder no cliente nao esconde no servidor: a resposta trazia o pacote
  // financeiro inteiro para qualquer sessao de motorista — bastava abrir a aba
  // Rede do navegador. Pior, os `filePath` dos comprovantes/NF eram a porta de
  // entrada para /api/uploads, que serve o arquivo a qualquer sessao valida.
  //
  // Os campos abaixo sao exatamente os que a UI ja nao renderiza em driverMode,
  // entao a omissao aqui nao muda nenhuma tela — apenas para de enviar o que o
  // motorista nunca deveria receber.
  if (session.role === "MOTORISTA") {
    const {
      orderValue,
      freight,
      total,
      paymentProofPath,
      paymentProof2Path,
      invoicePath,
      paymentProofs,
      financeProofs,
      ...visivelAoMotorista
    } = order;
    return NextResponse.json({ ...visivelAoMotorista, history });
  }

  return NextResponse.json({ ...order, history });
}
