import type { Prisma } from "@prisma/client";
import { formatPhone } from "@/lib/phone";
import { normalizeCnpj } from "@/lib/wholesale-identity";

/**
 * O CADASTRO DA LOJISTA NASCE DA APROVAÇÃO.
 *
 * Aprovar uma candidatura passou a criar o `Customer` correspondente
 * (28/10/2026). Antes, a lojista aprovada era cadastrada à mão depois, e isso
 * tinha duas consequências: a aprovada ficava invisível para o resto do sistema
 * até alguém digitá-la, e não havia NENHUM caminho entre a candidatura e um
 * pedido — `Customer` não guarda CNPJ. Sem esse caminho, "quem comprou" não é
 * calculável.
 *
 * ESTE MÓDULO NÃO ABRE TRANSAÇÃO. Ele recebe a transação de quem chama
 * (`decideLead`), porque criar o cadastro e gravar a decisão têm de ser a mesma
 * escrita: um cadastro criado para uma aprovação que não gravou seria cliente
 * fantasma, e uma aprovação sem cadastro é justamente o que esta mudança
 * existe para acabar.
 */

/**
 * Prefixo do código dos clientes nascidos de uma candidatura.
 *
 * `Customer.code` é digitado à mão em toda a casa (`createCustomer`, a
 * importação de clientes) e é `@unique`. Um código gerado precisa, então, de
 * duas propriedades: não colidir com o que as pessoas digitam, e dizer de onde
 * veio. "AT-" resolve as duas — e um código colidido não seria um erro
 * cosmético, seria uma exceção de unicidade derrubando a aprovação.
 */
const PREFIXO = "AT-";

/**
 * O código do cliente desta candidatura: `AT-` + os 14 dígitos do CNPJ.
 *
 * O CNPJ COMO CHAVE, e não um contador, por três motivos:
 *  1. Não há gerador de sequência nesta casa — `orderNumber` e `Customer.code`
 *     são ambos digitados. Inventar um contador aqui significaria ler o maior
 *     valor e somar um, que é a forma clássica de duas aprovações simultâneas
 *     brigarem pelo mesmo número.
 *  2. É IDEMPOTENTE: aprovar, reprovar e aprovar de novo chega ao mesmo código,
 *     e não cria um segundo cadastro a cada ida e volta.
 *  3. Duas candidaturas com o MESMO CNPJ apontam para o MESMO cadastro — que é
 *     a resposta certa, porque mesmo CNPJ é o mesmo negócio. A repetição de
 *     CNPJ é permitida de propósito em `WholesaleLead` (é ela que alimenta o
 *     aviso da decisão 9), então este caso não é teórico.
 *
 * Devolve `null` quando o CNPJ não tem 14 dígitos. Só acontece em candidatura
 * vinda da planilha antiga, onde o campo era texto livre: a aprovação grava
 * normalmente e a candidatura fica sem cadastro, em vez de ganhar um código
 * inventado que ninguém conseguiria reconciliar depois.
 */
export function codigoDoClienteDaCandidatura(cnpj: string): string | null {
  const digitos = normalizeCnpj(cnpj);
  return digitos.length === 14 ? `${PREFIXO}${digitos}` : null;
}

/** Os campos do `Customer` que saem de uma candidatura. */
export function dadosDoClienteDaCandidatura(lead: {
  contactName: string;
  city: string;
  state: string;
  phone: string;
  email: string;
}): { name: string; city: string; state: string; contact: string } {
  return {
    name: lead.contactName.trim(),
    city: lead.city.trim(),
    // UF em maiúsculas, como o resto da casa grava (ver `createCustomer`).
    state: lead.state.trim().toUpperCase(),
    // `contact` é texto livre no cadastro de clientes, e aqui ele carrega as
    // duas formas de alcançar a lojista. Formatado porque é para ler: o
    // telefone cru de 11 dígitos numa coluna de contato não se lê.
    contact: [formatPhone(lead.phone), lead.email.trim()].filter(Boolean).join(" · "),
  };
}

/**
 * Cria (ou reaproveita) o cadastro da lojista e devolve o id.
 *
 * `upsert` e não `create`: o código é derivado do CNPJ, então aprovar duas
 * vezes — ou aprovar duas candidaturas do mesmo CNPJ — tem de encontrar o
 * cadastro que já existe. O `create` daria erro de unicidade e derrubaria a
 * aprovação por causa de algo que não é erro.
 *
 * O UPDATE É DELIBERADAMENTE VAZIO. Um cadastro existente pode ter sido
 * corrigido à mão pelo Financeiro (endereço, contato, até o nome), e sobrescrever
 * isso com as respostas do formulário — que podem ser de meses antes —
 * desfaria a correção sem ninguém pedir. O cadastro nasce da candidatura; daí
 * em diante quem manda nele é quem o atende.
 *
 * Devolve `null` quando não há código derivável (CNPJ incompleto): a aprovação
 * segue, sem cadastro.
 */
export async function cadastrarClienteDaCandidatura(
  tx: Prisma.TransactionClient,
  lead: {
    contactName: string;
    city: string;
    state: string;
    phone: string;
    email: string;
    cnpj: string;
  },
): Promise<string | null> {
  const code = codigoDoClienteDaCandidatura(lead.cnpj);
  if (!code) return null;

  const cliente = await tx.customer.upsert({
    where: { code },
    update: {},
    create: { code, ...dadosDoClienteDaCandidatura(lead) },
    select: { id: true },
  });
  return cliente.id;
}
