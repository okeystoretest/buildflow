import { z } from "zod";

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

/** Texto longo obrigatorio de um dos campos de conteudo. */
const texto = (campo: string, max = 4000) =>
  z.string().trim().min(1, `${campo} é obrigatório.`).max(max, `${campo} está muito longo.`);

const textoOpcional = (max = 4000) =>
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
    // One-on-One
    performance: textoOpcional(),
    status: z.enum(FOLLOWUP_STATUSES).optional(),
    // Quinzenal
    topic: textoOpcional(1000),
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

export const updateFollowUpSchema = z.intersection(
  followUpSchema,
  z.object({ id: z.string().min(1, "ID obrigatório.") }),
);

export type FollowUpInput = z.infer<typeof followUpSchema>;

/**
 * Minimo de caracteres para a busca do colaborador devolver nomes.
 *
 * Especificado na planilha ("a partir da insercao de um minimo de cinco
 * caracteres"). Mora aqui, e nao no componente, porque a tela e a action
 * precisam concordar: com o numero so no cliente, a lista podia filtrar por
 * tres e o servidor por cinco.
 */
export const MIN_BUSCA_COLABORADOR = 5;
