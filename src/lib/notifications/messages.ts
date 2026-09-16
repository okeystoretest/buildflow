// Textos de notificacao ao motorista. Logica pura (sem Prisma, sem rede) para
// poder ser verificada por script (scripts/checks/notification-messages.ts).

/**
 * Aviso de pagamento da entrega. Comanda tem prioridade sobre o numero do
 * pedido, como em todo o app. E o MESMO texto que ia por WhatsApp antes da
 * remocao do canal: o motorista continua lendo a mesma frase, agora no push.
 */
export function mensagemPagamentoEntrega(args: {
  comandaNumber: string | null | undefined;
  orderNumber: string;
}): string {
  const numero = args.comandaNumber?.trim() || args.orderNumber;
  return `Pagamento da comanda ${numero} efetuado com sucesso.`;
}
