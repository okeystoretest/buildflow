/**
 * ENTREGA POR MOTORISTA — quais Formas de Envio pertencem ao motorista.
 * ---------------------------------------------------------------------------
 * Regra de produto: só "1 - Excursão" e "3 - Entrega Local" são entregues pela
 * equipe de motoristas. Qualquer outra forma sai por outro canal (Correios,
 * transportadora, retirada) e não deve aparecer na coluna "Pronto" do quadro do
 * Motorista nem gerar aviso de entrega disponível.
 *
 * É a mesma regra de exclusão que já existia para o Código de Rastreio, agora
 * pelo lado positivo: em vez de listar o que sai, o quadro passa a listar o que
 * entra.
 *
 * COMO A FORMA É RECONHECIDA: pelo NOME, com comparação tolerante a acentos,
 * caixa e espaços — mesmo padrão de isPecasBlogueira em piece-control.ts e de
 * isTroca/isDoacao em validations/order.ts. O nome é cadastro livre da Gestão e
 * varia na digitação.
 *
 * LIMITE DESTA ESCOLHA, e ele é real: renomear a forma na tela de Gestão
 * ("3 - Entrega Local" → "3 - Entrega local (Marília)") faz a regra parar de
 * valer EM SILÊNCIO — os pedidos somem do quadro do motorista e nenhum erro é
 * registrado. A normalização absorve acento e espaçamento, não renomeação. Ao
 * mexer nos nomes dessas formas, mexa aqui junto.
 */

/** Nome exato, como cadastrado em Formas de Envio. */
export const FORMA_EXCURSAO = "1 - Excursão";

/** Nome exato, como cadastrado em Formas de Envio. */
export const FORMA_ENTREGA_LOCAL = "3 - Entrega Local";

/** As formas que a equipe de motoristas entrega. */
export const FORMAS_DO_MOTORISTA = [FORMA_EXCURSAO, FORMA_ENTREGA_LOCAL] as const;

function normalize(s?: string | null): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * A forma de envio é entregue por motorista?
 *
 * Igualdade, nunca "contém": uma forma nova chamada "5 - Excursão
 * Terceirizada" não herda a entrega do motorista só por carregar a palavra.
 * Nome ausente responde false — sem saber a forma, o seguro é não convocar a
 * equipe de entrega.
 */
export function isEntregaDeMotorista(shippingMethodName?: string | null): boolean {
  if (!shippingMethodName) return false;
  const alvo = normalize(shippingMethodName);
  return FORMAS_DO_MOTORISTA.some((f) => normalize(f) === alvo);
}
