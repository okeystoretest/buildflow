import { z } from "zod";
// Type-only: some no tipo do `where`, nao entra em bundle de cliente.
import type { Prisma } from "@prisma/client";

/**
 * Validacao dos formularios de acompanhamento (One-on-One e Quinzenal).
 *
 * UM SCHEMA PARA OS DOIS, com `superRefine` exigindo os campos exclusivos do
 * tipo que esta sendo gravado. Dois schemas separados duplicariam os cinco
 * campos comuns e as cinco mensagens deles — e a tabela e uma so.
 */

export const FOLLOWUP_KINDS = ["ONE_ON_ONE", "QUINZENAL"] as const;
export type FollowUpKindValue = (typeof FOLLOWUP_KINDS)[number];

export const FOLLOWUP_STATUSES = [
  "NAO_INICIADO",
  "EM_ANDAMENTO",
  "PRECISA_REVISAO",
  "EM_ESPERA",
  "ENTREGUE",
] as const;

export const FOLLOWUP_KIND_LABEL: Record<FollowUpKindValue, string> = {
  ONE_ON_ONE: "One-on-One",
  QUINZENAL: "Acompanhamento Quinzenal",
};

export const FOLLOWUP_STATUS_LABEL: Record<(typeof FOLLOWUP_STATUSES)[number], string> = {
  NAO_INICIADO: "Não Iniciado",
  EM_ANDAMENTO: "Em Andamento",
  PRECISA_REVISAO: "Precisa de Revisão",
  EM_ESPERA: "Em Espera",
  ENTREGUE: "Entregue",
};

/** Data no formato do `<input type="date">`. */
const dataISO = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data válida.");

const dataOpcional = dataISO.optional().or(z.literal("").transform(() => undefined));

/**
 * TETO DOS CAMPOS DE TEXTO, em caracteres.
 *
 * 4.000 sao ~650 palavras, uma pagina e meia: umas seis vezes o que um registro
 * completo de conversa ocupa. E teto de SEGURANCA, nao regua de redacao —
 * ninguem encosta nele escrevendo de verdade. O tema do Quinzenal e uma linha,
 * e por isso tem o seu.
 *
 * EXPORTADOS porque a TELA tambem precisa deles. Com o numero so aqui, o campo
 * nao travava nem avisava: a pessoa escrevia 5.000 caracteres e descobria o
 * limite ao salvar, pela mensagem do servidor. Mesmo motivo de
 * `MIN_BUSCA_COLABORADOR` morar aqui — os dois lados precisam concordar.
 */
export const MAX_TEXTO = 4000;
export const MAX_TOPICO = 1000;

/** Texto longo obrigatorio de um dos campos de conteudo. */
const texto = (campo: string, max = MAX_TEXTO) =>
  z.string().trim().min(1, `${campo} é obrigatório.`).max(max, `${campo} está muito longo.`);

const textoOpcional = (max = MAX_TEXTO) =>
  z.string().trim().max(max, "Texto muito longo.").optional()
    .or(z.literal("").transform(() => undefined));

export const followUpSchema = z
  .object({
    kind: z.enum(FOLLOWUP_KINDS),
    collaboratorId: z.string().trim().min(1, "Selecione o colaborador."),
    heldOn: dataISO,
    // comuns
    strengths: texto("Pontos fortes"),
    improvement: texto("Ponto de desenvolvimento"),
    collaboratorView: texto("Percepção do colaborador"),
    actionPlan: texto("Plano de ação"),
    notes: textoOpcional(),
    status: z.enum(FOLLOWUP_STATUSES).optional(),
    // One-on-One
    performance: textoOpcional(),
    // Quinzenal
    topic: textoOpcional(MAX_TOPICO),
    support: textoOpcional(),
    reviewOn: dataOpcional,
  })
  .superRefine((d, ctx) => {
    if (d.kind === "ONE_ON_ONE") {
      if (!d.performance) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["performance"],
          message: "Métricas e indicadores de desempenho são obrigatórios no One-on-One.",
        });
      }
    } else if (!d.topic) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["topic"],
        message: "Tema central da conversa é obrigatório no Acompanhamento Quinzenal.",
      });
    }
  });

/**
 * A EDICAO NAO CARREGA STATUS, e o `transform` o descarta mesmo quando o
 * payload traz um.
 *
 * Desde 27/11/2026 o dono do status e o QUADRO, porque so ele grava a linha da
 * trilha de movimentacao. Enquanto este schema aceitasse o campo, bastava um
 * chamador manda-lo para o status mudar SEM rastro e com o cronometro
 * correndo: o trecho seguinte seria creditado ao status errado, e o historico
 * que a especificacao pede nao mostraria nada.
 *
 * Hoje nenhum chamador manda — o formulario deixou de ter o campo. Isto aqui
 * transforma "ninguem manda" em "nao da para mandar", que e o que uma trilha
 * de auditoria precisa: a invariante vira do tipo, nao do costume.
 */
export const updateFollowUpSchema = z
  .intersection(followUpSchema, z.object({ id: z.string().min(1, "ID obrigatório.") }))
  .transform(({ status: _statusIgnorado, ...resto }) => resto);

export type FollowUpInput = z.infer<typeof followUpSchema>;

/**
 * Recorte de SITUACAO da lista de conversas: "" (todas), "abertos",
 * "concluidos". CONCLUIDO = status ENTREGUE.
 *
 * O `OR` de "abertos" NAO e zelo: `status` aceita nulo (todo registro quinzenal
 * gravado antes de 17/11/2026 tem nulo) e, em SQL, `null <> 'ENTREGUE'` nao e
 * verdadeiro — `{ not: "ENTREGUE" }` sozinho sumiria com esses registros
 * justamente da lista de quem esta EM ABERTO.
 *
 * Mora aqui, fora do componente de pagina, para a checagem poder segurar o
 * `OR` no lugar: `tsc` nao ve esse erro e a tela nao acusa — ela so devolve
 * menos linhas. Ver scripts/checks/followup-situacao.ts.
 */
export function filtroDeSituacao(situacao: string): Prisma.FollowUpWhereInput {
  if (situacao === "concluidos") return { status: "ENTREGUE" };
  if (situacao === "abertos") return { OR: [{ status: null }, { status: { not: "ENTREGUE" } }] };
  return {};
}

/**
 * Minimo de caracteres para a busca do colaborador devolver nomes.
 *
 * Especificado na planilha ("a partir da insercao de um minimo de cinco
 * caracteres"). Mora aqui, e nao no componente, porque a tela e a action
 * precisam concordar: com o numero so no cliente, a lista podia filtrar por
 * tres e o servidor por cinco.
 */
export const MIN_BUSCA_COLABORADOR = 5;
