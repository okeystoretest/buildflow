import { normalizePhone } from "@/lib/phone";

/**
 * Identidade da candidata: as duas chaves pelas quais um cadastro repetido é
 * reconhecido (decisão 9).
 *
 * Existe porque normalização é o defeito mais silencioso que há: o aviso
 * simplesmente não aparece, e ninguém descobre que ele deveria ter aparecido.
 */

/** Só os dígitos. É a forma gravada no banco e a chave de comparação. */
export function normalizeCnpj(value: string): string {
  return (value || "").replace(/\D/g, "");
}

/**
 * CNPJ válido pelos dígitos verificadores (módulo 11).
 *
 * O projeto só conferia o COMPRIMENTO (14) em `actions/cnpj.ts`. Aqui a conta
 * é feita porque o CNPJ é o campo de validação do cadastro, e os códigos 02 e
 * 05 descrevem conferência humana a partir de um número que já faça sentido —
 * não vale ocupar a analista com dígito digitado errado.
 */
export function isValidCnpj(value: string): boolean {
  const d = normalizeCnpj(value);
  if (d.length !== 14) return false;
  // Sequência repetida passa na conta e não corresponde a empresa nenhuma.
  if (/^(\d)\1{13}$/.test(d)) return false;

  const calcDigito = (base: string): number => {
    let peso = base.length === 12 ? 5 : 6;
    let soma = 0;
    for (const ch of base) {
      soma += Number(ch) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const d1 = calcDigito(d.slice(0, 12));
  if (d1 !== Number(d[12])) return false;
  const d2 = calcDigito(d.slice(0, 13));
  return d2 === Number(d[13]);
}

export function formatCnpj(digits: string): string {
  const d = normalizeCnpj(digits);
  if (d.length !== 14) return digits;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Todas as grafias pelas quais este telefone pode estar gravado em outro lead.
 *
 * O NONO DÍGITO é o mesmo defeito que quebrou o envio por WhatsApp em 09/2026:
 * número brasileiro registrado antes dele existe nas duas formas, e comparar
 * só a forma recebida faz o mesmo telefone não casar consigo mesmo. Então a
 * busca procura pelas duas.
 *
 * A variante só é gerada para celular (8 dígitos após o DDD começando por
 * 6–9, ou 9 dígitos começando por 9). Fixo não ganha chave inventada.
 *
 * A entrada passa por `normalizePhone` de `@/lib/phone`, para que o código do
 * país e a armadilha do DDD 55 sejam tratados em um único lugar. Duplicar essa
 * lógica aqui foi exatamente o que produziu o bug de lista vazia: "5511988887777"
 * virava 13 dígitos, nenhuma chave, e o aviso sumia sem erro.
 */
export function phoneMatchKeys(digits: string): string[] {
  const d = normalizePhone(digits || "");
  if (d.length < 10 || d.length > 11) return [];
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);

  if (resto.length === 9 && resto.startsWith("9")) {
    return [d, `${ddd}${resto.slice(1)}`];
  }
  if (resto.length === 8 && /^[6-9]/.test(resto)) {
    return [d, `${ddd}9${resto}`];
  }
  return [d];
}
