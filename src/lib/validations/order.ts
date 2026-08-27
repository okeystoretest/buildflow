import { z } from "zod";

export const createOrderSchema = z.object({
  orderNumber: z.string().min(1, "Numero do pedido obrigatorio."),
  // "N° de Peças no Pedido" — quantidade total de pecas vinculadas ao pedido.
  // Opcional (default 0) para nao travar tipos que nao movimentam peca (ex.:
  // Doacao/Transferencia) nem quebrar integracoes antigas.
  pieceCount: z.coerce
    .number()
    .int("Quantidade de pecas invalida.")
    .nonnegative("Quantidade de pecas invalida.")
    .max(100000, "Quantidade de pecas fora do intervalo.")
    .default(0),
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
  // Endereço de entrega — obrigatório apenas quando a forma de envio exige
  // (ex.: "Excursão"). O cliente envia `requiresAddress` (derivado da forma
  // escolhida) para o schema aplicar a obrigatoriedade condicional.
  requiresAddress: z.coerce.boolean().default(false),
  shipCep: z.string().max(20).optional(),
  shipStreet: z.string().max(200).optional(),
  shipNumber: z.string().max(30).optional(),
  shipDistrict: z.string().max(120).optional(),
  shipCity: z.string().max(120).optional(),
  shipState: z.string().max(2).optional(),
  // Excursao selecionada (opcional). So relevante quando a forma de envio e a
  // de Excursao (requiresAddress). O endereco da excursao pre-preenche os
  // campos ship* na UI; aqui guardamos apenas o vinculo.
  excursaoId: z.string().optional(),
  // "Observacoes de Pagamento" (exclusivo do Financeiro).
  paymentNotes: z.string().max(1000).optional(),
  // Campanha opcional + quantidade de itens (volume) quando vinculado.
  // LEGADO: mantidos por compatibilidade. A entrada real agora vem em
  // `campaignItems` (múltiplas referências por pedido); estes campos passam a
  // ser derivados dos itens na action (campaignId = 1ª campanha, itemCount = soma).
  campaignId: z.string().optional(),
  itemCount: z.coerce.number().int().nonnegative().default(0),
  // "Possui desconto?" — quando marcado, a premiação por item de campanha usa o
  // valor reduzido (Atacado R$2,00 / Varejo R$2,50). Default false = integral.
  // Itens de campanha (lista dinâmica): cada linha tem campanha, referência,
  // quantidade e valor próprios. Opcional; quando presente, cada item é validado.
  campaignItems: z
    .array(
      z.object({
        campaignId: z.string().min(1, "Selecione a campanha do item."),
        reference: z.string().trim().min(1, "Informe a referência.").max(120),
        quantity: z.coerce.number().int().positive("Quantidade deve ser > 0."),
        value: z.coerce.number().nonnegative("Valor inválido.").default(0),
      }),
    )
    .max(50, "Máximo de 50 itens de campanha.")
    .optional(),
  // Nome do tipo de pedido (ex.: "Troca"). Usado para a regra de anexo.
  orderTypeName: z.string().optional(),
  // Nome da operação (ex.: "20 - Venda para Funcionário Interno"). Usado para
  // dispensar anexo por operação. A action revalida contra o banco.
  operationName: z.string().optional(),
  // Comprovantes de pagamento (ate 5, cada um em data URL base64).
  // Opcional no schema; a obrigatoriedade (ao menos 1) e aplicada abaixo,
  // dispensada na Troca.
  paymentProofsBase64: z.array(z.string()).max(5, "Máximo de 5 comprovantes.").optional(),
})
  // Comprovante de pagamento dispensado quando o tipo isenta anexo
  // (Troca ou Doação).
  .refine(
    (d) =>
      isAnexoDispensavelPorContexto({ orderTypeName: d.orderTypeName, operationName: d.operationName }) ||
      !!(d.paymentProofsBase64 && d.paymentProofsBase64.length > 0),
    { message: "Anexe o comprovante de pagamento.", path: ["paymentProofsBase64"] },
  )
  // "Valor Total do Pedido" obrigatorio (> 0), EXCETO Troca e Doação.
  .refine(
    (d) => isAnexoDispensavel(d.orderTypeName) || d.orderValue > 0,
    { message: "Informe o valor total do pedido.", path: ["orderValue"] },
  )
  // Endereço obrigatório quando a forma de envio exige (ex.: "Excursão").
  // Cada campo faltante aponta o erro no próprio campo para a UI destacar.
  .refine((d) => !d.requiresAddress || !!d.shipCep?.trim(), { message: "Informe o CEP.", path: ["shipCep"] })
  .refine((d) => !d.requiresAddress || !!d.shipStreet?.trim(), { message: "Informe o logradouro.", path: ["shipStreet"] })
  .refine((d) => !d.requiresAddress || !!d.shipDistrict?.trim(), { message: "Informe o bairro.", path: ["shipDistrict"] })
  .refine((d) => !d.requiresAddress || !!d.shipCity?.trim(), { message: "Informe a cidade.", path: ["shipCity"] })
  .refine((d) => !d.requiresAddress || !!d.shipState?.trim(), { message: "Informe a UF.", path: ["shipState"] });

// "Troca" dispensa anexo (NF e comprovante) E pula o Financeiro. O tipo
// cadastrado é exatamente "4 - Troca"; a comparação é tolerante a
// acentos/caixa/espaços.
export function isTroca(orderTypeName?: string | null): boolean {
  return (orderTypeName ?? "").trim().toLowerCase() === "4 - troca";
}

// "Doação" PASSA pelo Financeiro normalmente, mas dispensa comprovante e Nota
// Fiscal (e, na aprovação, também CNPJ/forma/banco). O tipo cadastrado é
// exatamente "9 - Doação"; comparação tolerante a acentos/caixa/espaços.
export function isDoacao(orderTypeName?: string | null): boolean {
  return normalize(orderTypeName) === normalize("9 - Doação");
}

// "3 - Transferência" — tipo de pedido interno entre lojas/estoques. Dispensa
// Comprovante de Pagamento e Nota Fiscal. Comparação tolerante a acentos/caixa.
export function isTransferencia(orderTypeName?: string | null): boolean {
  return normalize(orderTypeName) === normalize("3 - Transferência");
}

// "20 - Venda para Funcionário Interno" — OPERAÇÃO (não é tipo de pedido).
// Dispensa Comprovante de Pagamento e Nota Fiscal. Comparação tolerante.
export function isVendaFuncionarioInterno(operationName?: string | null): boolean {
  return normalize(operationName) === normalize("20 - Venda para Funcionário Interno");
}

// Isenção de ANEXO (comprovante de pagamento + Nota Fiscal). Vale para Troca,
// Doação e Transferência (por TIPO de pedido). NÃO implica pular o Financeiro
// nem dispensar o valor — para isso, use isTroca diretamente.
export function isAnexoDispensavel(orderTypeName?: string | null): boolean {
  return isTroca(orderTypeName) || isDoacao(orderTypeName) || isTransferencia(orderTypeName);
}

// Regra COMPLETA de isenção de anexos considerando TIPO de pedido E OPERAÇÃO.
// Anexos (Comprovante + NF) são opcionais quando o pedido é Troca, Doação,
// Transferência, OU quando a operação é "20 - Venda para Funcionário Interno".
// Use esta função no fluxo logístico (transição de status) e na exigência de UI.
export function isAnexoDispensavelPorContexto(args: {
  orderTypeName?: string | null;
  operationName?: string | null;
}): boolean {
  return isAnexoDispensavel(args.orderTypeName) || isVendaFuncionarioInterno(args.operationName);
}

// Normaliza para comparação tolerante a acentos, caixa e espaços.
function normalize(s?: string | null): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// Campos de endereco/contato do cliente. Todos opcionais; aceitam string
// vazia (normalizada para undefined/null na action).
const customerAddressFields = {
  cep: z.string().trim().max(20).optional().or(z.literal("")),
  street: z.string().trim().max(200).optional().or(z.literal("")),
  district: z.string().trim().max(120).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  state: z.string().trim().max(2).optional().or(z.literal("")),
  contact: z.string().trim().max(200).optional().or(z.literal("")),
};

export const createCustomerSchema = z.object({
  code: z.string().min(1, "Codigo obrigatorio.").max(50, "Codigo muito longo."),
  name: z.string().min(2, "Nome obrigatorio."),
  ...customerAddressFields,
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.extend({
  id: z.string().min(1),
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

// ===========================================================================
// EXCURSAO (cadastro em Vendas, padrao visual do cadastro de Clientes)
// ===========================================================================

export const createExcursaoSchema = z.object({
  name: z.string().trim().min(2, "Nome da excursao obrigatorio.").max(160),
  address: z.string().trim().min(3, "Endereco obrigatorio.").max(300),
  // "Funciona ate as" (horario limite) — texto livre, ex.: "18:00".
  cutoffTime: z.string().trim().max(40).optional().or(z.literal("")),
  // Dias de funcionamento — texto livre, ex.: "Seg a Sex".
  operatingDays: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type CreateExcursaoInput = z.infer<typeof createExcursaoSchema>;

export const updateExcursaoSchema = createExcursaoSchema.extend({
  id: z.string().min(1),
});
export type UpdateExcursaoInput = z.infer<typeof updateExcursaoSchema>;
