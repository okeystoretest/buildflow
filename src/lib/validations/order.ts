import { z } from "zod";

export const createOrderSchema = z.object({
  orderNumber: z.string().min(1, "Numero do pedido obrigatorio."),
  storeId: z.string().min(1, "Loja obrigatoria."),
  // "Loja de Origem" (conceito novo). Obrigatoria (doc 4.1). A UI de Novo
  // Pedido sempre envia; o vinculo com o vendedor e checado na action.
  originStoreId: z.string().min(1, "Loja de Origem obrigatoria."),
  orderTypeId: z.string().min(1, "Tipo de pedido obrigatorio."),
  operationId: z.string().min(1, "Operacao obrigatoria."),
  customerId: z.string().min(1, "Cliente obrigatorio."),
  // NOTA: "Forma de Pagamento" e "Banco" NAO sao mais informados aqui.
  // O FINANCEIRO os preenche na Analise de Pedidos antes de aprovar.
  shippingMethodId: z.string().min(1, "Forma de envio obrigatoria."),
  // Valor total do pedido informado diretamente (sem itens).
  // Na Troca, o valor e opcional (default 0) — a obrigatoriedade > 0 e aplicada
  // abaixo apenas para os demais tipos.
  orderValue: z.coerce.number().nonnegative("Valor invalido.").default(0),
  freight: z.coerce.number().nonnegative("Frete invalido.").default(0),
  // "Observacoes de Envio" (logistica/motorista).
  notes: z.string().max(1000).optional(),
  // "Observacoes de Pagamento" (exclusivo do Financeiro).
  paymentNotes: z.string().max(1000).optional(),
  // Campanha opcional + quantidade de itens (volume) quando vinculado.
  campaignId: z.string().optional(),
  itemCount: z.coerce.number().int().nonnegative().default(0),
  // Nome do tipo de pedido (ex.: "Troca"). Usado para a regra de anexo.
  orderTypeName: z.string().optional(),
  // Comprovantes de pagamento (ate 5, cada um em data URL base64).
  // Opcional no schema; a obrigatoriedade (ao menos 1) e aplicada abaixo,
  // dispensada na Troca.
  paymentProofsBase64: z.array(z.string()).max(5, "Máximo de 5 comprovantes.").optional(),
})
  .refine(
    (d) => isTroca(d.orderTypeName) || !!(d.paymentProofsBase64 && d.paymentProofsBase64.length > 0),
    { message: "Anexe o comprovante de pagamento.", path: ["paymentProofsBase64"] },
  )
  // "Valor Total do Pedido" obrigatorio (> 0), EXCETO na Troca.
  .refine(
    (d) => isTroca(d.orderTypeName) || d.orderValue > 0,
    { message: "Informe o valor total do pedido.", path: ["orderValue"] },
  );

// "Troca" dispensa anexo (NF e comprovante). Comparação tolerante a acentos/caixa.
export function isTroca(orderTypeName?: string | null): boolean {
  return (orderTypeName ?? "").trim().toLowerCase() === "troca";
}

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const createCustomerSchema = z.object({
  code: z.string().min(1, "Codigo obrigatorio.").max(50, "Codigo muito longo."),
  name: z.string().min(2, "Nome obrigatorio."),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.extend({
  id: z.string().min(1),
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
