import { z } from "zod";

/**
 * O FORMULÁRIO DA PEÇA, em forma de regra. PURO: nada aqui vai ao banco nem à
 * rede, para poder ser conferido por script (`scripts/checks/cronograma.ts`).
 *
 * As regras são as MESMAS do Build.Connect, campo por campo e limite por
 * limite. Não por simetria: as duas agendas aparecem no mesmo calendário, e um
 * título que cabe lá e não cabe aqui faria a mesma atividade ser aceita de um lado
 * e recusada do outro, sem que a tela explicasse por quê.
 *
 * O QUE NÃO VEIO DE LÁ é o alcance (`visibility`). Lá ele existe porque a
 * mesma base serve três abas; aqui a ferramenta é uma só, e toda atividade aparece
 * para quem abre o Cronograma. Quem edita é o autor, e isso é `createdById`.
 *
 * DATA E HORA CHEGAM SEPARADAS, como no Connect: são dois campos no
 * formulário, e juntá-las no cliente deixaria a conversão de fuso do lado de
 * fora da fronteira de confiança — onde ela não vale nada.
 */

export const FUNIS = ["TOFU", "MOFU", "BOFU"] as const;
export const FORMATOS = [
  "REEL",
  "STORY",
  "FEED",
  "CARROSSEL",
  "LIVE",
  "LANCAMENTO",
  "OUTRO",
] as const;
export const STATUS = ["IDEIA", "EM_PRODUCAO", "AGENDADO", "PUBLICADO"] as const;
export const PLATAFORMAS = ["INSTAGRAM", "TIKTOK", "YOUTUBE"] as const;
export const BRANDS = ["OKEY", "LOV_CLUB"] as const;

export const atividadeSchema = z
  .object({
    title: z.string().trim().min(1, "Informe o título da atividade.").max(120, "Título muito longo."),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
    time: z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido."),
    funnel: z.enum(FUNIS),
    // `.min(1)` porque atividade sem formato nenhum não tem selo no calendário — e
    // o selo é o que distingue um card do outro numa célula de sete colunas.
    formats: z.array(z.enum(FORMATOS)).min(1, "Escolha ao menos um formato.").max(7),
    // Texto livre do formato "Outro". Limpo quando OUTRO sai da seleção.
    formatOther: z.string().trim().max(60, "Descrição do formato muito longa.").optional(),
    // Nº do line-up. Inteiro positivo, limpo quando LANCAMENTO sai da seleção.
    lineUp: z.number().int().positive("Nº do line-up inválido.").max(999999).optional(),
    status: z.enum(STATUS).optional(),
    brand: z.enum(BRANDS).optional(),
    platforms: z.array(z.enum(PLATAFORMAS)).max(3).optional(),
    notes: z.string().trim().max(500, "Observação muito longa.").optional(),
    /** Responsável pela produção. Vazio = sem dono definido. */
    ownerId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // "Outro" sem descrição é um formato sem nome — o card sairia ilegível.
    if (data.formats.includes("OUTRO") && !data.formatOther) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["formatOther"],
        message: "Descreva o formato do conteúdo.",
      });
    }
    // "Lançamento" sem número é um bloco vazio no calendário: o nº do line-up
    // é exatamente o que se procura no card.
    if (data.formats.includes("LANCAMENTO") && data.lineUp === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lineUp"],
        message: "Informe o nº do line-up.",
      });
    }
  });

export type AtividadeInput = z.infer<typeof atividadeSchema>;

/**
 * Listas sem duplicata e os dois campos condicionais limpos.
 *
 * LIMPAR É A PARTE QUE IMPORTA: sem isto, tirar OUTRO da seleção deixaria a
 * descrição antiga no banco, e ela voltaria a aparecer no dia em que alguém
 * marcasse OUTRO de novo — um texto que ninguém digitou naquela atividade.
 */
export function camposNormalizados(data: AtividadeInput) {
  return {
    // Sem duplicatas: as duas listas são conjuntos, não sequências.
    formats: Array.from(new Set(data.formats)),
    platforms: Array.from(new Set(data.platforms ?? [])),
    formatOther: data.formats.includes("OUTRO") ? (data.formatOther ?? null) : null,
    lineUp: data.formats.includes("LANCAMENTO") ? (data.lineUp ?? null) : null,
  };
}

/**
 * A data e a hora do formulário viram um instante EM UTC.
 *
 * `new Date("2026-11-25T14:00")` sem o `Z` é lido no fuso do SERVIDOR, e o
 * mesmo formulário gravaria instantes diferentes conforme a máquina que
 * atende. O calendário desta ferramenta desenha tudo em UTC (ver
 * `lib/cronograma.ts`), então gravar em UTC é o que faz a atividade cair na célula
 * em que a pessoa a soltou.
 */
export function instanteDaAtividade(date: string, time: string): Date {
  return new Date(`${date}T${time}:00.000Z`);
}

/** A primeira mensagem de erro do zod, que é a que a tela mostra. */
export function primeiroErro(erro: z.ZodError): string {
  return erro.issues[0]?.message ?? "Dados inválidos.";
}
