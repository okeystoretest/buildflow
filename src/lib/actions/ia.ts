"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { gerarComModelo } from "@/lib/cronograma-roteiro";
import {
  AI_SETTINGS_ID,
  configSchema,
  lerConfigDeIa,
  type ConfigDeIa,
} from "@/lib/ia-settings";

/**
 * A configuração da IA do sistema.
 *
 * SÓ GESTAO. Não é uma preferência de quem usa: o modelo decide o custo de
 * cada geração e a instrução decide o que o sistema escreve em nome da casa.
 *
 * A CHAVE NÃO PASSA POR AQUI, nem para entrar nem para sair. Ela mora em
 * `GEMINI_API_KEY`, no ambiente (ver o schema de `AiSettings`).
 */

/** A tela que consome a configuração. Revalidada para pegar o modelo novo. */
const ROTA_CRONOGRAMA = "/marketing/cronograma";
const ROTA_GESTAO = "/gestao";

export async function salvarConfigDeIa(input: ConfigDeIa): Promise<ActionResult> {
  const sessao = await requireRoleAction(["GESTAO"]);

  const lido = configSchema.safeParse(input);
  if (!lido.success) return actionError(lido.error.issues[0]?.message ?? "Dados inválidos.");

  // `upsert` e não `update`: a linha só nasce quando alguém salva pela
  // primeira vez, e até lá o sistema roda nos padrões. Um `update` falharia
  // exatamente nesse primeiro salvamento.
  await prisma.aiSettings.upsert({
    where: { id: AI_SETTINGS_ID },
    create: { id: AI_SETTINGS_ID, ...lido.data, updatedById: sessao.userId },
    update: { ...lido.data, updatedById: sessao.userId },
  });

  revalidatePath(ROTA_GESTAO);
  revalidatePath(ROTA_CRONOGRAMA);
  return actionOk(undefined);
}

/**
 * Uma geração de mentira, para provar que a configuração FUNCIONA.
 *
 * Existe porque o erro de configuração aparece tarde demais sem ela: um nome
 * de modelo errado ou uma chave vencida só dariam as caras quando alguém do
 * Marketing clicasse "Gerar com IA" no meio do trabalho — e a pessoa que pode
 * consertar (a Gestão) não é a que recebe o erro.
 *
 * USA O MESMO CAMINHO da geração de verdade (`gerarComModelo`), com o modelo
 * e a instrução que estão na TELA e ainda não foram salvos: testar o que está
 * guardado, e não o que se acabou de digitar, provaria a configuração errada.
 */
export async function testarIa(input: ConfigDeIa): Promise<ActionResult<{ amostra: string }>> {
  await requireRoleAction(["GESTAO"]);

  const lido = configSchema.safeParse(input);
  if (!lido.success) return actionError(lido.error.issues[0]?.message ?? "Dados inválidos.");

  const r = await gerarComModelo(
    "Responda com uma única frase curta confirmando que você está funcionando.",
    lido.data.model,
    lido.data.instruction,
  );
  if (!r.ok) return actionError(r.motivo);

  // Cortada: é um recibo de que o caminho funciona, não uma amostra de texto.
  return actionOk({ amostra: r.texto.slice(0, 300) });
}

/** A configuração em vigor, para a action do roteiro. */
export async function configDeIaEmVigor() {
  return lerConfigDeIa();
}
