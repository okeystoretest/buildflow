import { z } from "zod";
import { PREFIXOS_DE_UPLOAD } from "@/lib/relatorio-semanal-labels";

/**
 * A validação das escritas do Relatório Semanal.
 *
 * MÓDULO SEM `"use server"`, de propósito, por dois motivos:
 *
 *  1. Um módulo `"use server"` só pode exportar funções assíncronas — um
 *     schema exportado de lá quebra o build.
 *  2. Separada, a validação é exercitável por script
 *     (`scripts/checks/relatorio-semanal-schemas.ts`). As regras daqui são a
 *     FRONTEIRA DE CONFIANÇA: o que chega nas actions vem do navegador, onde
 *     nada do que a tela validou continua valendo.
 *
 * É a mesma separação que o Build.Connect faz com as guardas dele, e pelo
 * mesmo motivo: o que decide não pode virar endpoint por acidente.
 */

export const EM_PORTUGUES: z.ZodErrorMap = (issue) => {
  if (issue.code === z.ZodIssueCode.invalid_type) {
    if (issue.received === "nan") return { message: "Informe um número válido." };
    if (issue.received === "undefined" || issue.received === "null") {
      return { message: "Preencha este campo." };
    }
  }
  return { message: "Dados inválidos." };
};

export const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
export const health = z.enum(["NO_RITMO", "ATENCAO", "TRAVADO"]).nullish();
export const textoCurto = z.string().trim().max(200, "Texto muito longo.").nullish();
export const textoLongo = z.string().trim().max(2000, "Texto muito longo.").nullish();

/**
 * Evidência: um caminho de upload nosso ou um endereço http(s). Nada mais.
 *
 * A tela mostra a evidência como `<img src>` ou como `<a href>`, e é por isso
 * que o esquema é conferido no SERVIDOR: um `javascript:` digitado no campo
 * viraria execução de script no clique de quem lê o relatório — e quem lê é
 * outra pessoa, na reunião de sexta.
 */
export const evidencia = z
  .string()
  .trim()
  .max(500, "Endereço muito longo.")
  .refine(
    (v) =>
      v === "" ||
      // A MESMA lista que decide se a evidência se desenha como imagem. Com as
      // duas separadas, o servidor chegou a recusar o caminho que ele mesmo
      // tinha acabado de gerar no upload.
      PREFIXOS_DE_UPLOAD.some((p) => v.startsWith(p)) ||
      /^https?:\/\//i.test(v),
    "A evidência precisa ser um link http(s) ou uma imagem enviada.",
  )
  .nullish();

/**
 * Número de métrica ou de OKR.
 *
 * `nullish` porque a célula em branco é um estado legítimo — a planilha trazia
 * "—" em toda linha não apurada, e as contas já respondem "sem valor" em vez
 * de zero. O teto evita que um dedo escorregado no teclado numérico vire
 * alcance de um bilhão sem ninguém notar.
 */
export const numero = z
  .number()
  .finite("Informe um número válido.")
  .min(-1_000_000_000, "Número fora da faixa.")
  .max(1_000_000_000, "Número fora da faixa.")
  .nullish();

export const criarSchema = z.object({
  weekNumber: z
    .number()
    .int("O número da semana precisa ser inteiro.")
    .min(1, "A semana começa em 1.")
    .max(53, "O ano não tem mais de 53 semanas."),
  periodStart: dia,
  periodEnd: dia,
});

export const resumoSchema = criarSchema.extend({
  reportId: z.string().min(1),
  highlight: textoLongo,
  learning: textoLongo,
  nextPriority: textoLongo,
});

export const secaoSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("delivery"),
    reportId: z.string().min(1),
    rows: z
      .array(
        z.object({
          day: textoCurto,
          block: textoCurto,
          expected: z
            .string()
            .trim()
            .min(1, "Toda entrega precisa de uma descrição.")
            .max(500, "Descrição muito longa."),
          health,
          evidence: evidencia,
          note: textoLongo,
        }),
      )
      .max(60, "Máximo de 60 entregas por semana."),
  }),
  z.object({
    kind: z.literal("metric"),
    reportId: z.string().min(1),
    rows: z
      .array(
        z.object({
          channel: z.string().trim().min(1, "Toda métrica precisa de um canal.").max(80, "Nome de canal muito longo."),
          metric: z.string().trim().min(1, "Toda linha precisa do nome da métrica.").max(120, "Nome de métrica muito longo."),
          previous: numero,
          current: numero,
          target: textoCurto,
          health,
          reading: textoLongo,
        }),
      )
      .max(60, "Máximo de 60 métricas por semana."),
  }),
  z.object({
    kind: z.literal("okr"),
    reportId: z.string().min(1),
    rows: z
      .array(
        z.object({
          objective: textoCurto,
          keyResult: z.string().trim().min(1, "Todo resultado-chave precisa de um nome.").max(300, "Nome muito longo."),
          measure: textoLongo,
          goalLabel: textoCurto,
          goalValue: numero,
          monthlyRead: z.boolean().optional(),
          achieved: numero,
          health,
          nextStep: textoLongo,
        }),
      )
      .max(60, "Máximo de 60 resultados-chave por semana."),
  }),
  z.object({
    kind: z.literal("agenda"),
    reportId: z.string().min(1),
    rows: z.array(z.object({ id: z.string().min(1), answer: textoLongo })).max(20, "Seção com linhas demais."),
  }),
]);

export const bloqueioSchema = z.object({
  reportId: z.string().min(1),
  /** Ausente = criar. */
  blockerId: z.string().min(1).optional(),
  title: z.string().trim().min(1, "Descreva o bloqueio.").max(500, "Descrição muito longa."),
  impact: textoLongo,
  needs: textoCurto,
  dueDate: dia.nullish(),
  health,
  resolution: textoLongo,
});

/* ------------------------------------------------- o quadro (abas 7 e 8) */

export const tarefaSchema = z.object({
  /** Ausente = criar. */
  taskId: z.string().min(1).optional(),
  title: z.string().trim().min(1, "Dê um nome à tarefa.").max(300, "Nome muito longo."),
  category: z.enum(["CONTEUDO", "PUBLICACAO", "COMUNIDADE", "RELATORIO", "PROCESSO"]),
  priority: z.enum(["ALTA", "MEDIA", "BAIXA"]),
  assigneeId: z.string().trim().max(60).nullish(),
  dueDate: dia.nullish(),
  evidence: evidencia,
  note: textoLongo,
});

export const moverSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(["BACKLOG", "A_FAZER", "EM_ANDAMENTO", "REVISAO", "PUBLICADO"]),
});

/** "2026-11-17" → meia-noite em UTC, a mesma régua das colunas `@db.Date`. */
export function lerDia(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** A primeira mensagem, que é a que a tela mostra. */
export const primeiroErro = (e: z.ZodError) => e.issues[0]?.message ?? "Dados inválidos.";
