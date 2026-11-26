import { z } from "zod";
import { prisma } from "@/lib/prisma";

/**
 * A CONFIGURAÇÃO DA IA — o modelo e a instrução que escrevem os roteiros.
 *
 * Antes isto era uma constante no código e uma variável de ambiente: trocar o
 * modelo exigia um deploy, e ajustar o tom do roteiro exigia um programador.
 * Agora mora no banco, numa linha só, e quem mexe é a Gestão.
 *
 * OS PADRÕES ABAIXO SÃO A SEMENTE, não um valor morto: o sistema funciona
 * sem ninguém abrir a tela de Gestão, exatamente como funcionava antes. A
 * linha só nasce quando alguém salva.
 */

/** O id fixo da linha única. Ver o comentário do modelo no schema. */
export const AI_SETTINGS_ID = "default";

/** O modelo padrão. O MESMO do Build.Connect, para os roteiros saírem iguais. */
export const MODELO_PADRAO = "gemini-2.5-flash";

export const INSTRUCAO_PADRAO =
  "Você é roteirista de conteúdo para redes sociais. Escreva em português do Brasil. Responda apenas com o roteiro.";

/**
 * O NOME DO MODELO É VALIDADO, e não é formalidade: ele vira um PEDAÇO DA URL
 * do provedor (`.../models/<modelo>:generateContent`). Sem esta regra, um
 * campo de texto na tela de Gestão seria alguém escrevendo caminho — uma
 * barra ou um `..` apontariam o pedido para outra rota da API.
 *
 * A regra é a mesma do Build.Connect: letra ou dígito no começo, depois letra,
 * dígito, ponto ou hífen.
 */
export const configSchema = z.object({
  model: z
    .string()
    .trim()
    .min(1, "Informe o modelo.")
    .max(80, "Nome do modelo muito longo.")
    .regex(
      /^[a-z0-9][a-z0-9.\-]*$/i,
      "Nome do modelo inválido. Use algo como gemini-2.5-flash.",
    ),
  instruction: z
    .string()
    .trim()
    .min(1, "A instrução não pode ficar vazia.")
    // 4 mil caracteres é muito mais do que uma instrução de comportamento
    // precisa, e é o que impede este campo de virar o roteiro em si.
    .max(4_000, "Instrução muito longa."),
});

export type ConfigDeIa = z.infer<typeof configSchema>;

export interface ConfigDeIaLida extends ConfigDeIa {
  /** A chave está no ambiente? O VALOR nunca sai daqui. */
  temChave: boolean;
  /** Nulo enquanto ninguém salvou: a tela mostra os padrões. */
  updatedAt: string | null;
  updatedPor: string | null;
}

/**
 * A configuração em vigor. NUNCA devolve nulo: sem linha salva, devolve os
 * padrões — é o que mantém o roteiro funcionando em qualquer instalação.
 */
export async function lerConfigDeIa(): Promise<ConfigDeIaLida> {
  const linha = await prisma.aiSettings.findUnique({
    where: { id: AI_SETTINGS_ID },
    select: {
      model: true,
      instruction: true,
      updatedAt: true,
      updatedBy: { select: { name: true } },
    },
  });

  return {
    model: linha?.model ?? MODELO_PADRAO,
    instruction: linha?.instruction ?? INSTRUCAO_PADRAO,
    // `Boolean` e não o valor: nem o comprimento da chave atravessa daqui.
    temChave: Boolean(process.env.GEMINI_API_KEY),
    updatedAt: linha?.updatedAt.toISOString() ?? null,
    updatedPor: linha?.updatedBy?.name ?? null,
  };
}
