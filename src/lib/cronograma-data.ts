import { prisma } from "@/lib/prisma";
import { buscarCronograma } from "@/lib/integration/connect-cronograma";
import { podeEditarAtividade } from "@/lib/cronograma";

/**
 * A LEITURA DO CRONOGRAMA: as atividades do Build.Connect e as daqui, no mesmo
 * calendário.
 *
 * DUAS ORIGENS, UMA TELA, e a diferença entre elas não é decoração: a atividade do
 * Connect é SÓ LEITURA (a sincronização é de mão única, decisão do dono de
 * 25/11/2026) e a daqui é editável pelo autor. Por isso toda atividade carrega
 * `origem` e `podeEditar` — calculados AQUI, no servidor, e não adivinhados
 * pela tela a partir do formato do id.
 *
 * A FALHA DO CONNECT NÃO APAGA O QUE É NOSSO. Antes esta tela era só a janela
 * do Connect, e o Connect fora do ar virava uma tela de erro inteira — o que
 * estava certo quando não havia nada mais a mostrar. Agora há: as atividades daqui
 * vivem no nosso banco, e sumir com elas porque OUTRO serviço caiu seria
 * esconder o trabalho da própria pessoa. O aviso vira uma tarja, e o
 * calendário continua.
 */

/** Uma atividade no calendário, venha de onde vier. */
export interface Atividade {
  id: string;
  title: string;
  /** ISO. Quem formata é a tela, sempre em UTC. */
  scheduledAt: string;
  status: string;
  funnel: string;
  formats: string[];
  platforms: string[];
  brand: string | null;
  notes: string | null;
  /** PRIMEIRO NOME do responsável, e só isso — nos dois lados. */
  responsavel: string | null;
  /**
   * PRIMEIRO NOME de quem criou. Nulo nas atividades do Build.Connect: o
   * `createdBy` não atravessa a fronteira, de propósito (a ficha de lá mostra
   * "Criado por" porque lá a pessoa está na mesma base).
   */
  autor: string | null;

  /** De onde ela veio. É o que decide se há lápis no card. */
  origem: "connect" | "flow";
  /** Quem está olhando pode editá-la? Só atividade daqui, e só do autor. */
  podeEditar: boolean;

  /* Daqui para baixo, só atividade do Flow preenche — o Connect não manda estes
     campos, de propósito (ver `integration/connect-cronograma.ts`). */
  formatOther: string | null;
  lineUp: number | null;
  ownerId: string | null;
  script: string | null;
  scriptUpdatedAt: string | null;
  scriptPor: string | null;
}

export interface LeituraDoCronograma {
  atividades: Atividade[];
  /** Por que o Connect não entrou, quando não entrou. Nulo = entrou. */
  avisoConnect: string | null;
  /** O Connect bateu no teto de linhas dele. */
  truncado: boolean;
}

/** O primeiro nome, para o selo do card. Vazio ou só espaços vira nulo. */
function primeiroNome(nome: string | null | undefined): string | null {
  const primeiro = (nome ?? "").trim().split(/\s+/)[0];
  return primeiro || null;
}

/**
 * As atividades do recorte `de`–`ate`, das duas origens.
 *
 * `de` e `ate` são `YYYY-MM-DD` (o que a visão mostra). O recorte do nosso
 * banco vai do COMEÇO de `de` ao FIM de `ate`, os dois em UTC, porque é em UTC
 * que a grade é desenhada — um dia em fuso local deixaria de fora as atividades da
 * borda que a tela desenha na primeira e na última célula.
 */
export async function buscarAtividades(
  de: string,
  ate: string,
  viewerId: string,
): Promise<LeituraDoCronograma> {
  const [doConnect, doFlow] = await Promise.all([
    buscarCronograma(de, ate),
    prisma.contentPost.findMany({
      where: {
        scheduledAt: {
          gte: new Date(`${de}T00:00:00.000Z`),
          lte: new Date(`${ate}T23:59:59.999Z`),
        },
      },
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        status: true,
        funnel: true,
        formats: true,
        platforms: true,
        brand: true,
        notes: true,
        formatOther: true,
        lineUp: true,
        ownerId: true,
        createdById: true,
        createdBy: { select: { name: true } },
        script: true,
        scriptUpdatedAt: true,
        owner: { select: { name: true } },
        scriptBy: { select: { name: true } },
      },
    }),
  ]);

  const atividades: Atividade[] = doFlow.map((p) => ({
    id: p.id,
    title: p.title,
    scheduledAt: p.scheduledAt.toISOString(),
    status: p.status,
    funnel: p.funnel,
    formats: p.formats,
    platforms: p.platforms,
    brand: p.brand,
    notes: p.notes,
    responsavel: primeiroNome(p.owner?.name),
    autor: primeiroNome(p.createdBy?.name),
    origem: "flow",
    // A MESMA FUNÇÃO que a action usa para deixar a escrita passar. Não é
    // "a mesma conta": é a mesma linha de código, em `lib/cronograma.ts`.
    podeEditar: podeEditarAtividade(p.createdById, viewerId),
    formatOther: p.formatOther,
    lineUp: p.lineUp,
    ownerId: p.ownerId,
    script: p.script,
    scriptUpdatedAt: p.scriptUpdatedAt?.toISOString() ?? null,
    scriptPor: primeiroNome(p.scriptBy?.name),
  }));

  if (doConnect.ok) {
    for (const p of doConnect.posts) {
      atividades.push({
        ...p,
        autor: null,
        origem: "connect",
        // Nunca, para ninguém. A agenda do Connect é editada no Connect.
        podeEditar: false,
        formatOther: null,
        lineUp: null,
        ownerId: null,
        script: null,
        scriptUpdatedAt: null,
        scriptPor: null,
      });
    }
  }

  // Ordenado DEPOIS de juntar: cada origem vem ordenada por conta própria, e
  // concatenar duas listas ordenadas não dá uma lista ordenada — as atividades do
  // Connect cairiam todas depois das nossas dentro do mesmo dia.
  atividades.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  return {
    atividades,
    avisoConnect: doConnect.ok ? null : doConnect.motivo,
    truncado: doConnect.ok && doConnect.truncado,
  };
}

/** Quem pode ser responsável por uma atividade: os papéis que veem o Cronograma. */
export async function pessoasDoCronograma() {
  return prisma.user.findMany({
    where: { role: { in: ["GESTAO", "VENDAS"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
