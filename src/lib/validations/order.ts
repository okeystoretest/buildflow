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
  // Comprovante de pagamento (data URL base64) — OBRIGATÓRIO. Processado p/ .webp.
  paymentProofBase64: z.string().min(1, "Anexe o comprovante de pagamento."),
});

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
