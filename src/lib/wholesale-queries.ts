import { prisma } from "@/lib/prisma";
import { Prisma, WholesaleBrand, WholesaleLeadStatus } from "@prisma/client";
import { normalizeCnpj, phoneMatchKeys } from "@/lib/wholesale-identity";
import { donaDoRodizio, voltasDoRodizio } from "@/lib/wholesale-rodizio";
import { canUseWholesaleTool, type WholesaleActor } from "@/lib/wholesale-permissions";
import { isValidRejectionCode } from "@/lib/wholesale-rejection-codes";

/**
 * Consultas da Análise de Clientes. Nada aqui escreve.
 */

const PAGE_SIZE = 6;

/**
 * Intervalo de CHEGADA da candidatura, para o `where`.
 *
 * Uma função só porque a lista e o dashboard filtram o mesmo período sobre a
 * mesma coluna: escrito duas vezes, um lado inclui o último dia e o outro não,
 * e os dois números da mesma tela deixam de bater sem ninguém saber qual está
 * certo.
 *
 * `ate` fecha às 23:59:59 do dia escolhido. Com `lte` na meia-noite, o filtro
 * "até 19/10" perderia tudo que chegou no dia 19 — e quem escolhe uma data
 * final está incluindo aquele dia, não o excluindo.
 *
 * Devolve `{}` quando não há período: em Prisma, uma chave `createdAt: {}`
 * também não filtraria, mas devolver o objeto vazio deixa o `...spread` de quem
 * chama não acrescentar chave nenhuma.
 */
export function filtroDePeriodo(de?: string, ate?: string): Prisma.WholesaleLeadWhereInput {
  const inicio = (de ?? "").trim();
  const fim = (ate ?? "").trim();
  if (!inicio && !fim) return {};
  const createdAt: Prisma.DateTimeFilter = {};
  if (inicio) createdAt.gte = new Date(`${inicio}T00:00:00`);
  if (fim) createdAt.lte = new Date(`${fim}T23:59:59`);
  return { createdAt };
}

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
/**
 * Põe em dia a dona das candidaturas que estão no rodízio.
 *
 * O `sellerId` fica GRAVADO porque `listLeadsFor` filtra por ele dentro do SQL
 * e pagina no banco — dona calculada em JavaScript obrigaria a carregar todas
 * as pendentes para filtrar na memória, trocando uma consulta indexada por uma
 * varredura que cresce com o negócio. Então a verdade é a conta
 * (`wholesale-rodizio.ts`) e o banco é a cópia que a leitura atualiza. Mesmo
 * padrão do Select, onde o estado é derivado e a leitura reconcilia.
 *
 * NA LEITURA, e não num agendador: o prazo é de um dia e a rotina diária roda
 * uma vez só, então "1 dia" viraria "até 2 dias". Aqui a fila nunca mostra uma
 * dona vencida, mesmo que nenhum cron rode nunca — e se o banco estiver fora, a
 * exceção é engolida e a fila ainda abre com o que estiver gravado. Fila que
 * não abre é pior que fila um pouco atrasada.
 *
 * Só mexe em quem tem `rodizioIndice` (veio pelo link geral) e ainda não foi
 * avaliada: candidatura decidida não roda mais, e candidatura de vendedora
 * nunca rodou.
 */
async function reconciliarRodizio(agora = new Date()): Promise<void> {
  try {
    const [pendentes, ativas] = await Promise.all([
      prisma.wholesaleLead.findMany({
        where: { rodizioIndice: { not: null }, decidedAt: null },
        select: { id: true, rodizioIndice: true, createdAt: true, sellerId: true },
      }),
      // Ordem ESTÁVEL por id. Por nome, uma vendedora que casa e troca o
      // sobrenome reembaralharia a fila inteira de candidaturas abertas.
      prisma.user.findMany({
        where: { role: "VENDAS", salesModel: "ATACADO", active: true },
        select: { id: true },
        orderBy: { id: "asc" },
      }),
    ]);
    if (pendentes.length === 0 || ativas.length === 0) return;

    // Agrupa por destino para escrever um UPDATE por vendedora, e não um por
    // candidatura: com a fila cheia, a diferença é entre uma consulta e
    // centenas.
    const porDestino = new Map<string, string[]>();
    for (const lead of pendentes) {
      const dona = donaDoRodizio(lead.rodizioIndice as number, voltasDoRodizio(lead.createdAt, agora), ativas);
      if (!dona || dona.id === lead.sellerId) continue;
      const lista = porDestino.get(dona.id) ?? [];
      lista.push(lead.id);
      porDestino.set(dona.id, lista);
    }

    for (const [sellerId, ids] of porDestino) {
      await prisma.wholesaleLead.updateMany({
        // `decidedAt: null` de novo no WHERE, e não só na leitura acima: entre
        // ler e escrever, alguém pode ter avaliado a candidatura. Sem isto, o
        // rodízio tiraria das mãos de quem acabou de decidir.
        where: { id: { in: ids }, decidedAt: null },
        data: { sellerId },
      });
    }
  } catch (err) {
    // Reconciliação é higiene, não verdade: a fila abre com o que está gravado.
    console.error("[atacado] falha ao reconciliar o rodizio:", err);
  }
}

export async function listLeadsFor(
  actor: WholesaleActor,
  opts: {
    brand?: string;
    status?: string;
    page?: number;
    /** Busca por NOME da candidata. Parcial e sem diferenciar maiúsculas. */
    busca?: string;
    /** Nome do auxiliar, como gravado em `assistantName`. */
    auxiliar?: string;
    /** UF da loja da candidata (duas letras). */
    estado?: string;
    /** Id da vendedora dona. Só a Gestão escolhe — ver abaixo. */
    vendedora?: string;
    /** Intervalo de chegada (YYYY-MM-DD). */
    de?: string;
    ate?: string;
    /** Código do motivo de reprovação (os 34 da planilha). */
    motivo?: string;
  } = {},
): Promise<{ leads: LeadRow[]; total: number; totalPages: number }> {
  if (!canUseWholesaleTool(actor)) return { leads: [], total: 0, totalPages: 1 };

  // Falha FECHADA. Em Prisma, `sellerId: undefined` nao filtra nada — um
  // userId vazio entregaria TODAS as candidaturas a uma vendedora. O tipo
  // impede hoje; esta linha impede tambem quando alguem montar o ator a partir
  // de um select parcial, que e como um vazamento nasce sem ninguem decidir.
  if (actor.role !== "GESTAO" && !actor.userId) {
    return { leads: [], total: 0, totalPages: 1 };
  }

  // Antes de consultar: a dona de quem está no rodízio pode ter vencido desde a
  // última vez que alguém abriu esta tela.
  await reconciliarRodizio();

  const brand = (Object.values(WholesaleBrand) as string[]).includes(opts.brand ?? "")
    ? (opts.brand as WholesaleBrand)
    : undefined;
  const status = (Object.values(WholesaleLeadStatus) as string[]).includes(opts.status ?? "")
    ? (opts.status as WholesaleLeadStatus)
    : undefined;

  const busca = (opts.busca ?? "").trim();
  const auxiliar = (opts.auxiliar ?? "").trim();
  const vendedora = (opts.vendedora ?? "").trim();
  const estado = (opts.estado ?? "").trim();

  const where: Prisma.WholesaleLeadWhereInput = {
    // O ESCOPO VEM PRIMEIRO e o filtro de vendedora só se aplica DEPOIS dele.
    // Para quem não é Gestão, `sellerId` já está fixado no próprio id: um
    // `?vendedora=<outro id>` na barra de endereços não alarga o que ela vê,
    // porque a chave seguinte sobrescreveria o escopo. Por isso o filtro de
    // vendedora só existe para GESTAO — é a diferença entre um filtro e um
    // vazamento.
    ...(actor.role === "GESTAO"
      ? vendedora
        ? { sellerId: vendedora }
        : {}
      : { sellerId: actor.userId }),
    ...(brand ? { brand } : {}),
    ...(status ? { status } : {}),
    // Busca parcial no nome, sem diferenciar maiúsculas: é o nome que a
    // vendedora tem na cabeça quando a lojista liga, não o id.
    ...(busca ? { contactName: { contains: busca, mode: "insensitive" as const } } : {}),
    // Auxiliar é texto livre gravado por `setAssistantName`, e o filtro compara
    // o valor exato que a tela ofereceu — a lista de opções sai dos valores que
    // existem no banco, então não há como pedir um que ninguém usou.
    ...(auxiliar ? { assistantName: auxiliar } : {}),
    // UF: comparada em MAIUSCULAS porque e assim que a LP grava. Valor que
    // nao tem duas letras e ignorado em vez de devolver lista vazia.
    ...(estado.length === 2 ? { state: estado.toUpperCase() } : {}),
    // Período de chegada. Depois do escopo, como todo filtro: ele estreita o
    // que a pessoa já podia ver, nunca alarga.
    ...filtroDePeriodo(opts.de, opts.ate),
    // Motivo da reprovação. Código fora da tabela é IGNORADO (e não devolve
    // zero): um `?motivo=99` digitado à mão não deve produzir uma lista vazia
    // que parece "nenhuma reprovada por este motivo".
    ...(isValidRejectionCode((opts.motivo ?? "").trim())
      ? { rejectionCode: (opts.motivo ?? "").trim() }
      : {}),
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
