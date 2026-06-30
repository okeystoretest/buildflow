import { z } from "zod";

export const createOrderSchema = z.object({
  orderNumber: z.string().min(1, "Numero do pedido obrigatorio."),
  storeId: z.string().min(1, "Loja obrigatoria."),
  orderTypeId: z.string().min(1, "Tipo de pedido obrigatorio."),
  operationId: z.string().min(1, "Operacao obrigatoria."),
  customerId: z.string().min(1, "Cliente obrigatorio."),
  paymentMethodId: z.string().min(1, "Forma de pagamento obrigatoria."),
  shippingMethodId: z.string().min(1, "Forma de envio obrigatoria."),
  bankId: z.string().min(1, "Banco obrigatório."),
  // Valor total do pedido informado diretamente (sem itens).
  orderValue: z.coerce.number().nonnegative("Valor invalido."),
  freight: z.coerce.number().nonnegative("Frete invalido.").default(0),
  notes: z.string().max(1000).optional(),
  // Campanha opcional + quantidade de itens (volume) quando vinculado.
  campaignId: z.string().optional(),
  itemCount: z.coerce.number().int().nonnegative().default(0),
  // Nome do tipo de pedido (ex.: "Troca"). Usado para a regra de anexo.
  orderTypeName: z.string().optional(),
  // Comprovante de pagamento (data URL base64). Opcional no schema;
  // a obrigatoriedade é aplicada condicionalmente abaixo (dispensada na Troca).
  paymentProofBase64: z.string().optional(),
})
  .refine(
    (d) => isTroca(d.orderTypeName) || !!(d.paymentProofBase64 && d.paymentProofBase64.length > 0),
    { message: "Anexe o comprovante de pagamento.", path: ["paymentProofBase64"] },
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
