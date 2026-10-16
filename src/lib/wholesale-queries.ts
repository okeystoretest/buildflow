import { prisma } from "@/lib/prisma";
import { Prisma, WholesaleBrand, WholesaleLeadStatus } from "@prisma/client";
import { normalizeCnpj, phoneMatchKeys } from "@/lib/wholesale-identity";
import { canUseWholesaleTool, type WholesaleActor } from "@/lib/wholesale-permissions";

/**
 * Consultas da Análise de Clientes. Nada aqui escreve.
 */

const PAGE_SIZE = 20;

/**
 * O filtro do aviso de cadastro repetido (decisão 9), separado e PURO para
 * poder ser conferido por script.
 *
 * Só CUIDADO e REPROVADO alertam. Aprovado repetido é cliente voltando, não
 * sinal — alertar nele transformaria o aviso em ruído, e aviso ruidoso é aviso
 * que se aprende a ignorar.
 *
 * O CNPJ é procurado em DÍGITOS e o telefone nas DUAS grafias do nono dígito,
 * porque é assim que o mesmo número se reconhece (ver wholesale-identity.ts).
 */
export function buildDuplicateWhere(
  leadId: string,
  cnpj: string,
  phone: string,
): Prisma.WholesaleLeadWhereInput {
  const cnpjDigits = normalizeCnpj(cnpj);
  const telefones = phoneMatchKeys(phone);

  const alternativas: Prisma.WholesaleLeadWhereInput[] = [];
  if (cnpjDigits.length === 14) alternativas.push({ cnpj: cnpjDigits });
  if (telefones.length > 0) alternativas.push({ phone: { in: telefones } });

  if (alternativas.length === 0) {
    // Sem chave utilizável não há o que comparar, e o filtro NÃO pode casar com
    // ninguém: casar com todos faria o aviso disparar contra todo reprovado do
    // banco. Em vez de depender da semântica de `OR: []` no Prisma (que não
    // foi verificada aqui), devolvemos uma contradição lógica: o id precisa ser
    // igual ao do lead atual E diferente dele. Nenhuma linha satisfaz isso.
    //
    // Este ramo é INALCANÇÁVEL a partir de findDuplicateAlerts, que já sai
    // antes de consultar; fica como guarda para quem chamar esta função direto.
    return { id: { not: leadId, in: [leadId] } };
  }

  return {
    id: { not: leadId },
    status: { in: ["CUIDADO", "REPROVADO"] },
    OR: alternativas,
  };
}

export type DuplicateMatch = "cnpj" | "telefone" | "ambos";

/**
 * Por que o aviso disparou, para quem lê a tela.
 *
 * PURA de propósito: é o campo que a vendedora de fato lê, e etiquetar errado
 * é pior que não etiquetar — ela decide sobre o negócio de uma empresa real a
 * partir desta palavra. Função separada para um script conferir sem banco.
 *
 * O guard de 14 dígitos NÃO é decoração: a consulta só procura por CNPJ quando
 * ele tem 14 dígitos, então comparar sem o mesmo guard faria um casamento
 * achado só por telefone aparecer como "ambos" — bastando que os dois cadastros
 * tivessem o CNPJ vazio.
 */
export function classifyDuplicateMatch(args: {
  cnpjDigits: string;
  phoneKeys: string[];
  candidate: { cnpj: string; phone: string };
}): DuplicateMatch {
  const porCnpj = args.cnpjDigits.length === 14 && args.candidate.cnpj === args.cnpjDigits;
  const porTelefone = args.phoneKeys.includes(args.candidate.phone);
  if (porCnpj && porTelefone) return "ambos";
  if (porCnpj) return "cnpj";
  // `telefone` só quando a chave de telefone de fato casou. Antes era o `else`
  // de tudo, então "nada casou" era rotulado "telefone": inalcançável dos dois
  // chamadores de hoje, mas a função é exportada e o seu próprio docstring diz
  // que rótulo errado é pior que rótulo nenhum — e este rótulo vira o aviso que
  // a analista lê para decidir.
  if (porTelefone) return "telefone";
  throw new Error(
    "classifyDuplicateMatch chamada com candidato que não casa por CNPJ nem por telefone.",
  );
}

export interface DuplicateAlert {
  id: string;
  status: string;
  cnpj: string;
  phone: string;
  contactName: string;
  rejectionCode: string | null;
  cautionReason: string | null;
  decidedAt: Date | null;
  matchedBy: DuplicateMatch;
}

/**
 * Leads anteriores que pedem cautela sobre esta candidata. Atravessa o escopo
 * da vendedora de propósito: um alerta que só o dono vê não protege ninguém —
 * é a razão de existir do status CUIDADO.
 */
export async function findDuplicateAlerts(lead: {
  id: string;
  cnpj: string;
  phone: string;
}): Promise<DuplicateAlert[]> {
  const cnpjDigits = normalizeCnpj(lead.cnpj);
  const telefones = phoneMatchKeys(lead.phone);

  // Sem chave utilizável não há consulta a fazer. Além de poupar uma ida ao
  // banco, garante que este caminho não depende do filtro de buildDuplicateWhere
  // para o caso vazio.
  if (cnpjDigits.length !== 14 && telefones.length === 0) return [];

  const achados = await prisma.wholesaleLead.findMany({
    where: buildDuplicateWhere(lead.id, lead.cnpj, lead.phone),
    select: {
      id: true,
      status: true,
      cnpj: true,
      phone: true,
      contactName: true,
      rejectionCode: true,
      cautionReason: true,
      decidedAt: true,
    },
    orderBy: { decidedAt: "desc" },
    take: 10,
  });

  return achados.map((a) => {
    return {
      ...a,
      matchedBy: classifyDuplicateMatch({
        cnpjDigits,
        phoneKeys: telefones,
        candidate: { cnpj: a.cnpj, phone: a.phone },
      }),
    };
  });
}

export interface LeadRow {
  id: string;
  brand: string;
  status: string;
  contactName: string;
  city: string;
  state: string;
  instagram: string;
  cnpj: string;
  phone: string;
  assistantName: string | null;
  rejectionCode: string | null;
  createdAt: Date;
  sellerName: string | null;
}

/**
 * Lista paginada, já restrita pelo escopo do ator. A restrição acontece no
 * WHERE, não na tela: filtrar depois de buscar vazaria os dados pelo HTML.
 *
 * `brand` e `status` chegam da query string da URL, então são texto livre.
 * Só entram no filtro se forem membros reais do enum; um valor desconhecido é
 * ignorado (lista sem aquele filtro) em vez de ser repassado ao Prisma, que
 * lançaria erro de validação e derrubaria a página por causa de uma URL
 * digitada errada. Ignorar não alarga o acesso: o escopo do ator vem antes.
 */
export async function listLeadsFor(
  actor: WholesaleActor,
  opts: { brand?: string; status?: string; page?: number } = {},
): Promise<{ leads: LeadRow[]; total: number; totalPages: number }> {
  if (!canUseWholesaleTool(actor)) return { leads: [], total: 0, totalPages: 1 };

  // Falha FECHADA. Em Prisma, `sellerId: undefined` nao filtra nada — um
  // userId vazio entregaria TODAS as candidaturas a uma vendedora. O tipo
  // impede hoje; esta linha impede tambem quando alguem montar o ator a partir
  // de um select parcial, que e como um vazamento nasce sem ninguem decidir.
  if (actor.role !== "GESTAO" && !actor.userId) {
    return { leads: [], total: 0, totalPages: 1 };
  }

  const brand = (Object.values(WholesaleBrand) as string[]).includes(opts.brand ?? "")
    ? (opts.brand as WholesaleBrand)
    : undefined;
  const status = (Object.values(WholesaleLeadStatus) as string[]).includes(opts.status ?? "")
    ? (opts.status as WholesaleLeadStatus)
    : undefined;

  const where: Prisma.WholesaleLeadWhereInput = {
    ...(actor.role === "GESTAO" ? {} : { sellerId: actor.userId }),
    ...(brand ? { brand } : {}),
    ...(status ? { status } : {}),
  };

  const total = await prisma.wholesaleLead.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Página vinda da URL: NaN/Infinity/fração viram a primeira página, não um skip inválido.
  const pedida = Number.isFinite(opts.page) ? Math.floor(opts.page as number) : 1;
  const page = Math.min(Math.max(1, pedida), totalPages);

  const rows = await prisma.wholesaleLead.findMany({
    where,
    include: { seller: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return {
    leads: rows.map((r) => ({
      id: r.id,
      brand: r.brand,
      status: r.status,
      contactName: r.contactName,
      city: r.city,
      state: r.state,
      instagram: r.instagram,
      cnpj: r.cnpj,
      phone: r.phone,
      assistantName: r.assistantName,
      rejectionCode: r.rejectionCode,
      createdAt: r.createdAt,
      sellerName: r.seller?.name ?? null,
    })),
    total,
    totalPages,
  };
}

export { PAGE_SIZE as WHOLESALE_PAGE_SIZE };
