"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction, getActorContext } from "@/lib/auth";
import { canInteractWithOrder, INTERACTION_DENIED_MSG } from "@/lib/permissions";
import { createOrderSchema, isTroca, isAnexoDispensavelPorContexto } from "@/lib/validations/order";
import { processAndSaveImage, saveDocument, isPdfDataUrl } from "@/lib/image";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { emitOrderCreated, emitOrderUpdated } from "@/lib/realtime/emit";
import { Prisma } from "@prisma/client";

/**
 * Vendas cria um pedido.
 * O valor total e informado diretamente (sem itens).
 * Ao enviar, status vai automaticamente para EM_ANALISE (retido ate o Financeiro).
 */
export async function createOrder(
  raw: unknown,
): Promise<ActionResult<{ id: string; orderNumber: string }>> {
  try {
    const session = await requireRoleAction(["VENDAS", "GESTAO", "FINANCEIRO"]);

    const parsed = createOrderSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError("Dados invalidos.", parsed.error.flatten().fieldErrors);
    }
    const input = parsed.data;

    const orderValue = new Prisma.Decimal(input.orderValue);
    const freight = new Prisma.Decimal(input.freight);
    const total = orderValue.add(freight);

    // Tipo do pedido (fonte confiavel = banco, nao o payload da tela).
    // "Troca" ignora a Aprovacao Financeira. Status inicial:
    //  - Loja de fluxo PADRAO: entra ja em AGUARDANDO_IMPRESSAO.
    //  - Loja de fluxo SIMPLIFICADO (PAGO->EMBALADO->ENTREGUE): entra em PAGO,
    //    o 1o status do fluxo curto (AGUARDANDO_IMPRESSAO nao existe la).
    const orderType = await prisma.orderType.findUnique({
      where: { id: input.orderTypeId },
      select: { name: true },
    });
    if (!orderType) return actionError("Tipo de pedido invalido.");
    const troca = isTroca(orderType.name);

    // Nome da operação (fonte confiável = banco) para a regra de anexo por
    // operação ("20 - Venda para Funcionário Interno").
    const operation = await prisma.operation.findUnique({
      where: { id: input.operationId },
      select: { name: true },
    });

    // Anexo (comprovante) opcional por TIPO (Troca/Doação/Transferência) OU por
    // OPERAÇÃO (Funcionário Interno). Fora desses casos, ao menos 1 comprovante.
    const anexoDispensavel = isAnexoDispensavelPorContexto({
      orderTypeName: orderType.name,
      operationName: operation?.name,
    });
    if (!anexoDispensavel && (input.paymentProofsBase64 ?? []).length === 0) {
      return actionError("Anexe o comprovante de pagamento.");
    }

    // Descobre se a Loja de Origem escolhida usa fluxo simplificado.
    let simplifiedStore = false;
    if (input.originStoreId) {
      const os = await prisma.originStore.findUnique({
        where: { id: input.originStoreId },
        select: { simplifiedFlow: true },
      });
      simplifiedStore = os?.simplifiedFlow === true;
    }

    const initialStatus = troca
      ? simplifiedStore
        ? "PAGO"
        : "AGUARDANDO_IMPRESSAO"
      : "EM_ANALISE";

    // Campanha: a entrada agora é uma LISTA de itens (campaignItems), cada um
    // com campanha, referência, quantidade e valor. Os campos legados do Order
    // (campaignId/itemCount) são DERIVADOS dos itens para manter compatibilidade
    // com o Rank (volume por campanha e metas continuam lendo itemCount):
    //   - campaignId  = 1ª campanha dos itens (o par legado só comporta uma).
    //   - itemCount   = soma das quantidades de TODOS os itens.
    // A coluna "Valor" do Rank de Campanha passa a somar CampaignItem.value.
    const campaignItems = input.campaignItems ?? [];
    const campaignId = campaignItems[0]?.campaignId || input.campaignId || null;
    const itemCount = campaignItems.length
      ? campaignItems.reduce((a, it) => a + it.quantity, 0)
      : input.itemCount;
    if (campaignId && !(itemCount > 0)) {
      return actionError("Informe a quantidade de itens para a campanha.");
    }
    // Valida que todas as campanhas referenciadas existem e estão ativas.
    if (campaignItems.length) {
      const ids = [...new Set(campaignItems.map((it) => it.campaignId))];
      const found = await prisma.campaign.count({ where: { id: { in: ids }, active: true } });
      if (found !== ids.length) return actionError("Campanha inválida ou inativa em um dos itens.");
    }

    // Loja de Origem: se enviada, precisa existir, estar ativa e (para VENDAS)
    // estar atrelada ao usuario. GESTAO pode usar qualquer loja ativa.
    // Opcional nesta fatia backend; a UI tornara obrigatoria.
    if (input.originStoreId) {
      const originStore = await prisma.originStore.findFirst({
        where: { id: input.originStoreId, active: true },
        select: { id: true, users: { select: { id: true } } },
      });
      if (!originStore) return actionError("Loja de Origem inválida ou inativa.");
      if (
        session.role === "VENDAS" &&
        !originStore.users.some((u) => u.id === session.userId)
      ) {
        return actionError("Você não está atrelado a esta Loja de Origem.");
      }
    }

    // Determina, pela forma de envio escolhida, se o endereço é exigido.
    // A verdade vem do banco (não confiamos só no flag do cliente).
    const shipMethod = await prisma.shippingMethod.findUnique({
      where: { id: input.shippingMethodId },
      select: { requiresAddress: true },
    });
    const requiresAddress = shipMethod?.requiresAddress === true;

    const order = await prisma.order.create({
      data: {
        orderNumber: input.orderNumber,
        // "N° de Peças no Pedido" (campo declarado ao lado do numero do pedido).
        pieceCount: input.pieceCount ?? 0,
        storeId: input.storeId,
        originStoreId: input.originStoreId || null,
        orderTypeId: input.orderTypeId,
        operationId: input.operationId,
        customerId: input.customerId,
        sellerId: session.userId,
        // "Forma de Pagamento" e "Banco" ficam vazios na criacao:
        // o FINANCEIRO os preenche na Analise de Pedidos antes de aprovar.
        shippingMethodId: input.shippingMethodId,
        orderValue,
        freight,
        total,
        notes: input.notes,
        paymentNotes: input.paymentNotes,
        // Endereço de entrega: só grava quando a forma de envio exige; caso
        // contrário mantém tudo nulo.
        shipCep: requiresAddress ? input.shipCep?.trim() || null : null,
        shipStreet: requiresAddress ? input.shipStreet?.trim() || null : null,
        shipNumber: requiresAddress ? input.shipNumber?.trim() || null : null,
        shipDistrict: requiresAddress ? input.shipDistrict?.trim() || null : null,
        shipCity: requiresAddress ? input.shipCity?.trim() || null : null,
        shipState: requiresAddress ? input.shipState?.trim().toUpperCase() || null : null,
        // Vinculo com a Excursao escolhida: so quando a forma de envio exige
        // endereco (Excursao). Fora disso, sempre nulo.
        excursaoId: requiresAddress ? input.excursaoId?.trim() || null : null,
        campaignId,
        itemCount: campaignId ? itemCount : 0,
        // Desconto só faz sentido quando há campanha; sem campanha, força false.
        campaignDiscount: campaignId ? input.campaignDiscount === true : false,
        campaignItems: campaignItems.length
          ? {
              create: campaignItems.map((it) => ({
                campaignId: it.campaignId,
                reference: it.reference,
                quantity: it.quantity,
                value: new Prisma.Decimal(it.value),
              })),
            }
          : undefined,
        status: initialStatus,
        history: {
          create: {
            status: initialStatus,
            changedBy: session.userId,
            note: troca ? "Pedido de Troca criado (sem aprovacao financeira)" : "Pedido criado",
          },
        },
      },
      select: { id: true, orderNumber: true },
    });

    // Comprovantes de pagamento (ate 5). Cada imagem vira .webp no disco e
    // grava uma linha em OrderPaymentProof (no banco so o caminho).
    const proofs = (input.paymentProofsBase64 ?? []).slice(0, 5);
    for (const [i, dataUrl] of proofs.entries()) {
      try {
        const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
        const buffer = Buffer.from(base64, "base64");
        if (buffer.length === 0) continue;
        // Comprovante aceita imagem OU PDF. PDF vai direto ao disco (sem sharp);
        // imagem passa pelo pipeline .webp. No banco, so o caminho.
        const processed = isPdfDataUrl(dataUrl)
          ? await saveDocument(buffer, {
              folder: "comprovantes-pagamento",
              fileName: `${order.id}_paymentProof_${i + 1}_${Date.now()}`,
            })
          : await processAndSaveImage(buffer, {
              folder: "comprovantes-pagamento",
              fileName: `${order.id}_paymentProof_${i + 1}_${Date.now()}`,
            });
        await prisma.orderPaymentProof.create({
          data: {
            orderId: order.id,
            filePath: processed.filePath,
            width: processed.width,
            height: processed.height,
            sizeBytes: processed.sizeBytes,
          },
        });
        // Compat: guarda o PRIMEIRO comprovante tambem no campo antigo, para
        // telas/consultas que ainda leem paymentProofPath.
        if (i === 0) {
          await prisma.order.update({
            where: { id: order.id },
            data: { paymentProofPath: processed.filePath },
          });
        }
      } catch {
        // Nao derruba o pedido se um comprovante falhar; pode reenviar depois.
      }
    }

    revalidatePath("/vendas");
    revalidatePath("/fluxo");

    // Tempo real: publica a criacao. Notifica o FINANCEIRO com alerta ativo
    // SOMENTE quando o pedido entra em EM_ANALISE (aprovacao financeira).
    // Trocas pulam o Financeiro (AGUARDANDO_IMPRESSAO/PAGO) => sem alerta ativo,
    // mas o board de quem visualiza ainda reage.
    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId },
      select: { name: true },
    });
    emitOrderCreated({
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: customer?.name,
      status: initialStatus,
      originStoreId: input.originStoreId || null,
      notifyFinance: initialStatus === "EM_ANALISE",
    });

    return actionOk(order);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao criar pedido.";
    return actionError(msg);
  }
}

/**
 * Edição de pedido — exclusiva da Gestão.
 * Ajusta dados cadastrais e valores; não mexe em status/comanda.
 */
export async function updateOrder(args: {
  id: string;
  orderNumber?: string;
  // "N° de Peças no Pedido". undefined = nao mexe.
  pieceCount?: number;
  customerId?: string;
  storeId?: string;
  originStoreId?: string;
  orderTypeId?: string;
  operationId?: string;
  paymentMethodId?: string;
  shippingMethodId?: string;
  bankId?: string;
  orderValue?: number;
  freight?: number;
  notes?: string | null;
  paymentNotes?: string | null;
  // Endereço de entrega (Excursão). undefined = não mexe.
  shipCep?: string | null;
  shipStreet?: string | null;
  shipNumber?: string | null;
  shipDistrict?: string | null;
  shipCity?: string | null;
  shipState?: string | null;
  // Excursao vinculada. undefined = não mexe; limpa quando a forma não exige.
  excursaoId?: string | null;
  // Campanha
  campaignId?: string | null;
  itemCount?: number;
  // Itens de campanha (lista dinâmica). Quando enviado, SUBSTITUI o conjunto
  // atual de itens do pedido (delete-all + recreate). undefined = não mexe.
  campaignItems?: { campaignId: string; reference: string; quantity: number; value: number }[];
  // "Possui desconto?" do pedido de campanha. undefined = não mexe.
  campaignDiscount?: boolean;
  // Novos comprovantes a ADICIONAR (ate 5 no total). Substituicao e feita
  // removendo os antigos via removeProofIds.
  paymentProofsBase64?: string[];
  removeProofIds?: string[];
}): Promise<ActionResult<void>> {
  try {
    // GESTAO edita qualquer pedido; VENDAS/FINANCEIRO seguem a trava de escopo.
    const session = await requireRoleAction(["GESTAO", "VENDAS", "FINANCEIRO"]);
    const order = await prisma.order.findUnique({ where: { id: args.id } });
    if (!order) return actionError("Pedido não encontrado.");

    // Trava de escopo no SERVIDOR (nao confiar so na tela). Interacao liberada
    // para: criador do pedido, quem tem a Loja de Origem do pedido atrelada, ou
    // GESTAO. Ver src/lib/permissions.ts.
    const actor = await getActorContext();
    if (!actor || !canInteractWithOrder(actor, { sellerId: order.sellerId, originStoreId: order.originStoreId })) {
      return actionError(INTERACTION_DENIED_MSG);
    }

    const orderValue = args.orderValue ?? Number(order.orderValue);
    const freight = args.freight ?? Number(order.freight);
    if (!(orderValue > 0)) return actionError("Valor do pedido inválido.");

    // Campanha: se a lista de itens veio no payload, ela é a fonte de verdade.
    // Os campos legados (campaignId/itemCount) são derivados dela.
    const itemsProvided = args.campaignItems !== undefined;
    const campaignItems = args.campaignItems ?? [];
    if (itemsProvided && campaignItems.length) {
      const ids = [...new Set(campaignItems.map((it) => it.campaignId))];
      const found = await prisma.campaign.count({ where: { id: { in: ids }, active: true } });
      if (found !== ids.length) return actionError("Campanha inválida ou inativa em um dos itens.");
    }
    const derivedCampaignId = itemsProvided
      ? (campaignItems[0]?.campaignId ?? null)
      : undefined;
    const derivedItemCount = itemsProvided
      ? campaignItems.reduce((a, it) => a + it.quantity, 0)
      : undefined;

    // "Forma de Pagamento" e "Banco" sao do FINANCEIRO (definidos na Analise
    // de Pedidos). A vendedora nunca os altera, mesmo que o payload venha
    // adulterado — aqui simplesmente ignoramos o que ela mandar.
    const podeMexerNoFinanceiro = session.role === "GESTAO" || session.role === "FINANCEIRO";

    // Forma de envio resultante após a edição e se ela exige endereço.
    const finalShippingId = args.shippingMethodId ?? order.shippingMethodId;
    const finalShipMethod = await prisma.shippingMethod.findUnique({
      where: { id: finalShippingId },
      select: { requiresAddress: true },
    });
    const requiresAddress = finalShipMethod?.requiresAddress === true;
    // Helper: para cada campo de endereço, respeita "undefined = não mexe";
    // quando a forma NÃO exige endereço, limpa o campo (null).
    const addrField = (incoming: string | null | undefined, current: string | null) => {
      if (!requiresAddress) return null;
      if (incoming === undefined) return current;
      return incoming?.trim() ? incoming.trim() : null;
    };

    await prisma.order.update({
      where: { id: args.id },
      data: {
        customerId: args.customerId ?? order.customerId,
        storeId: args.storeId ?? order.storeId,
        // Loja de Origem: string vazia limpa o vínculo; undefined mantém.
        originStoreId: args.originStoreId === undefined
          ? order.originStoreId
          : (args.originStoreId ? args.originStoreId : null),
        orderTypeId: args.orderTypeId ?? order.orderTypeId,
        operationId: args.operationId ?? order.operationId,
        // FKs opcionais: string vazia vira NULL (senão a FK quebra).
        // Se quem edita NAO e a Gestao, mantemos o valor atual (ignora o payload).
        paymentMethodId: !podeMexerNoFinanceiro
          ? order.paymentMethodId
          : args.paymentMethodId
            ? args.paymentMethodId
            : (args.paymentMethodId === "" ? null : order.paymentMethodId),
        shippingMethodId: args.shippingMethodId ?? order.shippingMethodId,
        bankId: !podeMexerNoFinanceiro
          ? order.bankId
          : args.bankId
            ? args.bankId
            : (args.bankId === "" ? null : order.bankId),
        orderValue,
        freight,
        total: orderValue + freight,
        notes: args.notes === undefined ? order.notes : args.notes,
        paymentNotes: args.paymentNotes === undefined ? order.paymentNotes : args.paymentNotes,
        // Endereço de entrega (Excursão). Limpa quando a forma não exige.
        shipCep: addrField(args.shipCep, order.shipCep),
        shipStreet: addrField(args.shipStreet, order.shipStreet),
        shipNumber: addrField(args.shipNumber, order.shipNumber),
        shipDistrict: addrField(args.shipDistrict, order.shipDistrict),
        shipCity: addrField(args.shipCity, order.shipCity),
        shipState: args.shipState === undefined
          ? (requiresAddress ? order.shipState : null)
          : (requiresAddress ? (args.shipState?.trim() ? args.shipState.trim().toUpperCase() : null) : null),
        // Excursao: limpa quando a forma nao exige endereco; senao respeita
        // "undefined = nao mexe".
        excursaoId: !requiresAddress
          ? null
          : (args.excursaoId === undefined
              ? order.excursaoId
              : (args.excursaoId ? args.excursaoId : null)),
        // Numero do pedido (editavel como no cadastro).
        orderNumber: args.orderNumber?.trim() ? args.orderNumber.trim() : order.orderNumber,
        // "N° de Peças no Pedido": so altera quando enviado e valido (>= 0).
        pieceCount:
          args.pieceCount === undefined || !Number.isFinite(args.pieceCount) || args.pieceCount < 0
            ? order.pieceCount
            : Math.trunc(args.pieceCount),
        // Campanha (legado derivado). Se veio lista de itens, ela manda; senão
        // mantém o comportamento antigo baseado em campaignId/itemCount.
        campaignId: itemsProvided
          ? derivedCampaignId
          : (args.campaignId === undefined
              ? order.campaignId
              : (args.campaignId ? args.campaignId : null)),
        itemCount: itemsProvided
          ? (derivedItemCount ?? 0)
          : (args.campaignId
              ? (args.itemCount ?? order.itemCount)
              : (args.campaignId === undefined ? order.itemCount : 0)),
        // Desconto: se veio lista de itens, o novo estado do checkbox manda
        // (e sem campanha resultante, zera para false). Se a lista não veio,
        // só altera quando o campo foi explicitamente enviado.
        campaignDiscount: itemsProvided
          ? (derivedCampaignId ? args.campaignDiscount === true : false)
          : (args.campaignDiscount === undefined ? order.campaignDiscount : args.campaignDiscount === true),
      },
    });

    // Itens de campanha: substituição total (apaga os atuais e recria).
    if (itemsProvided) {
      await prisma.$transaction([
        prisma.campaignItem.deleteMany({ where: { orderId: order.id } }),
        ...(campaignItems.length
          ? [
              prisma.campaignItem.createMany({
                data: campaignItems.map((it) => ({
                  orderId: order.id,
                  campaignId: it.campaignId,
                  reference: it.reference,
                  quantity: it.quantity,
                  value: new Prisma.Decimal(it.value),
                })),
              }),
            ]
          : []),
      ]);
    }

    // Remocao de comprovantes marcados (substituicao de anexos).
    if (args.removeProofIds?.length) {
      await prisma.orderPaymentProof.deleteMany({
        where: { id: { in: args.removeProofIds }, orderId: order.id },
      });
    }

    // Novos comprovantes: respeita o teto de 5 no total.
    const novos = (args.paymentProofsBase64 ?? []).filter(Boolean);
    if (novos.length) {
      const jaTem = await prisma.orderPaymentProof.count({ where: { orderId: order.id } });
      const espaco = Math.max(0, 5 - jaTem);
      for (const [i, dataUrl] of novos.slice(0, espaco).entries()) {
        try {
          const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
          const buffer = Buffer.from(base64, "base64");
          if (buffer.length === 0) continue;
          // Comprovante aceita imagem OU PDF (mesma regra da criacao).
          const processed = isPdfDataUrl(dataUrl)
            ? await saveDocument(buffer, {
                folder: "comprovantes-pagamento",
                fileName: `${order.id}_paymentProof_edit_${jaTem + i + 1}_${Date.now()}`,
              })
            : await processAndSaveImage(buffer, {
                folder: "comprovantes-pagamento",
                fileName: `${order.id}_paymentProof_edit_${jaTem + i + 1}_${Date.now()}`,
              });
          await prisma.orderPaymentProof.create({
            data: {
              orderId: order.id,
              filePath: processed.filePath,
              width: processed.width,
              height: processed.height,
              sizeBytes: processed.sizeBytes,
            },
          });
        } catch {
          // ignora um anexo que falhe, sem derrubar a edicao
        }
      }
    }
    revalidatePath("/vendas");
    revalidatePath("/fluxo");
    revalidatePath("/logistica");
    emitOrderUpdated({ orderId: args.id });
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao editar pedido.");
  }
}

/**
 * Exclusão de pedido — exclusiva da Gestão.
 * OrderItem e OrderStatusHistory caem por cascade; Delivery (e Proof) são
 * removidos manualmente dentro de uma transação.
 */
export async function deleteOrder(id: string): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["GESTAO"]);
    const order = await prisma.order.findUnique({ where: { id }, include: { delivery: true } });
    if (!order) return actionError("Pedido não encontrado.");

    await prisma.$transaction(async (tx) => {
      if (order.delivery) {
        await tx.proof.deleteMany({ where: { deliveryId: order.delivery.id } });
        await tx.delivery.delete({ where: { id: order.delivery.id } });
      }
      await tx.order.delete({ where: { id } });
    });

    revalidatePath("/vendas");
    revalidatePath("/fluxo");
    revalidatePath("/logistica");
    emitOrderUpdated({ orderId: id });
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao excluir pedido.");
  }
}

/**
 * VENDAS marca a pendencia do Financeiro como RESOLVIDA.
 * Mantem o texto do problema (historico), mas registra a resolucao — o card
 * volta ao normal e o Financeiro ve que foi resolvida.
 */
export async function resolveFinanceIssue(orderId: string): Promise<ActionResult<void>> {
  try {
    await requireRoleAction(["VENDAS", "GESTAO"]);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return actionError("Pedido não encontrado.");

    // Interacao liberada para criador, dono da Loja de Origem ou GESTAO.
    const actor = await getActorContext();
    if (!actor || !canInteractWithOrder(actor, { sellerId: order.sellerId, originStoreId: order.originStoreId })) {
      return actionError(INTERACTION_DENIED_MSG);
    }
    if (!order.financeIssue || order.financeIssueResolvedAt) {
      return actionError("Não há pendência ativa neste pedido.");
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { financeIssueResolvedAt: new Date() },
    });

    revalidatePath("/vendas");
    revalidatePath("/financeiro");
    revalidatePath("/fluxo");
    emitOrderUpdated({ orderId, originStoreId: order.originStoreId });
    return actionOk(undefined);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Erro ao resolver pendência.");
  }
}
