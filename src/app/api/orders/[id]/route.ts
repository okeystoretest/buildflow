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
      // SO o nome. `seller: true` trazia a linha inteira do User — hash da
      // senha, e-mail, telefone, chave PIX e tokenVersion — para qualquer
      // sessao autenticada que abrisse a ficha. A ficha usa o nome.
      seller: { select: { id: true, name: true } },
      store: true,
      // Loja de Origem: fica na ficha ao lado da Loja. O Historico de Entregas
      // da Logistica ja exibia este campo antes de passar a usar a ficha unica.
      originStore: { select: { name: true } },
      orderType: true,
      operation: true,
      paymentMethod: true,
      bank: true,
      shippingMethod: true,
      paymentStatus: true,
      cnpj: true,
      // Mesmo cuidado do vendedor: do motorista a ficha precisa do nome.
      delivery: { include: { driver: { select: { id: true, name: true } }, proofs: true } },
      paymentProofs: { orderBy: { createdAt: "asc" } },
      financeProofs: { orderBy: { createdAt: "asc" } },
      history: { orderBy: { createdAt: "asc" } },
      delayReasons: { orderBy: { createdAt: "asc" } },
      returns: { orderBy: { createdAt: "desc" }, include: { items: { orderBy: { reference: "asc" } } } },
      // Pecas de campanha lancadas no pedido, na ordem canonica (createdAt asc)
      // — a mesma que deriva campaignId/itemCount. O Historico de Vendas faz o
      // CRUD delas sobre esta lista.
      campaignItems: {
        orderBy: { createdAt: "asc" },
        include: { campaign: { select: { name: true } } },
      },
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
    new Set(
      [
        ...order.history.map((h) => h.changedBy),
        // Os motivos de atraso guardam so o ID de quem justificou; a traducao
        // para nome sai da MESMA consulta do historico.
        ...order.delayReasons.map((d) => d.createdById),
        // Idem para quem registrou cada devolucao.
        ...order.returns.map((r) => r.registeredById),
      ].filter((v): v is string => !!v),
    ),
  );
  const changers = changerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: changerIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(changers.map((u) => [u.id, u.name]));

  // Motivos de atraso por etapa, com o nome de quem justificou.
  const delayReasons = order.delayReasons.map((d) => ({
    id: d.id,
    status: d.status,
    reason: d.reason,
    minutesLate: d.minutesLate,
    createdAt: d.createdAt,
    createdByName: d.createdById ? nameById.get(d.createdById) ?? null : null,
  }));

  // Devolucoes, da mais recente para a mais antiga, com o nome de quem registrou.
  const returns = order.returns.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    note: r.note,
    totalValue: r.totalValue.toString(),
    registeredByName: r.registeredById ? nameById.get(r.registeredById) ?? null : null,
    items: r.items.map((it) => ({
      id: it.id,
      reference: it.reference,
      quantity: it.quantity,
      value: it.value.toString(),
    })),
  }));

  // Pecas de campanha achatadas para a ficha: nome da campanha ao lado do id, e
  // o valor como string (Decimal do Prisma nao atravessa JSON como numero).
  const campaignItems = order.campaignItems.map((it) => ({
    id: it.id,
    campaignId: it.campaignId,
    campaignName: it.campaign?.name ?? "—",
    reference: it.reference,
    quantity: it.quantity,
    value: it.value.toString(),
  }));

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
      // Devolucoes sao valores: o motorista nao as recebe.
      returns: _returns,
      // Itens de campanha carregam valor por peca: mesma regra das devolucoes.
      campaignItems: _campaignItems,
      ...visivelAoMotorista
    } = order;
    return NextResponse.json({ ...visivelAoMotorista, history, delayReasons });
  }

  return NextResponse.json({ ...order, history, delayReasons, returns, campaignItems });
}
