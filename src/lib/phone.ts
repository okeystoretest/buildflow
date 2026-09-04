// Telefone brasileiro: normalizacao, validacao e mascara.
//
// Regra do projeto: no banco o telefone e SEMPRE so digitos, com DDD e sem o
// codigo do pais (ex.: "11988887777"). A formatacao "(11) 98888-7777" existe
// apenas na tela. Normalizar na gravacao e o que permite usar o numero direto
// num envio automatico depois, sem ter de limpar a base.
//
// Sem "use server" e sem dependencia de Prisma/React de proposito: as mesmas
// regras valem no servidor (validacao das actions) e no cliente (mascara do
// formulario de Gestao > Usuarios).

/** Quantidade de digitos de um fixo (DDD + 8) e de um celular (DDD + 9). */
const TAMANHO_FIXO = 10;
const TAMANHO_CELULAR = 11;

/**
 * Reduz qualquer entrada a digitos e descarta o codigo do pais.
 *
 * Aceita o que a pessoa colar: "(11) 98888-7777", "+55 11 98888-7777",
 * "5511988887777". O "55" so e removido quando o total fica com 12 ou 13
 * digitos — nesse tamanho ele so pode ser codigo de pais. Um numero de 11
 * digitos que por acaso comece com 55 (DDD 55, Santa Maria/RS) e preservado.
 */
export function normalizePhone(value: string): string {
  const digitos = value.replace(/\D/g, "");
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) {
    return digitos.slice(2);
  }
  return digitos;
}

/**
 * Valida um telefone JA normalizado (so digitos).
 *
 * - 10 digitos (fixo) ou 11 (celular);
 * - DDD valido comeca em 11 (nao existe DDD com 0 ou 1 na frente);
 * - com 11 digitos, o primeiro do numero e obrigatoriamente 9 (celulares
 *   brasileiros usam o nono digito desde 2016).
 */
export function isValidPhone(digits: string): boolean {
  if (digits.length !== TAMANHO_FIXO && digits.length !== TAMANHO_CELULAR) return false;
  const ddd = Number(digits.slice(0, 2));
  if (!Number.isInteger(ddd) || ddd < 11) return false;
  if (digits.length === TAMANHO_CELULAR && digits[2] !== "9") return false;
  return true;
}

/**
 * Mascara para exibicao e para digitacao.
 *
 * Formata tambem numeros PARCIAIS (o campo e mascarado a cada tecla), por isso
 * nao exige que o valor seja valido. Corta em 11 digitos: o que passa disso
 * seria descartado na gravacao de qualquer forma.
 */
export function formatPhone(value: string): string {
  const d = normalizePhone(value).slice(0, TAMANHO_CELULAR);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= TAMANHO_FIXO) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
