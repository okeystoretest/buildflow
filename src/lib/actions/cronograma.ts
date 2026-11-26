"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import {
  camposNormalizados,
  instanteDaAtividade,
  atividadeSchema,
  primeiroErro,
  type AtividadeInput,
} from "@/lib/cronograma-schemas";
import { gerarComModelo, montarPrompt } from "@/lib/cronograma-roteiro";
import { lerConfigDeIa } from "@/lib/ia-settings";
import { podeEditarAtividade } from "@/lib/cronograma";

/**
 * Escritas do Cronograma de Conteúdo.
 *
 * SÓ MEXEM NAS PEÇAS DAQUI. O que vem do Build.Connect é leitura e ponto: não
 * há action que o altere, e não é esquecimento — a sincronização é de mão
 * única (decisão do dono, 25/11/2026). Uma atividade do Connect nem tem id nesta
 * tabela, então toda busca abaixo (`findUnique` por id do nosso banco) já
 * devolve "não encontrada" para ela. A tela não oferece o lápis nesses cards;
 * isto aqui é o que garante que oferecer não bastaria.
 *
 * QUEM ENTRA: GESTAO e VENDAS, os mesmos papéis que veem o módulo Marketing.
 * QUEM ALTERA: só o AUTOR do registro — e GESTAO não tem override. No Connect
 * o Admin tem, para organizar a agenda do time; aqui a regra que o dono pediu
 * é "cada um edita o que é seu", sem exceção. Uma exceção para GESTAO seria
 * uma segunda regra para alguém descobrir por acidente.
 *
 * TODA ENTRADA PASSA POR `zod`: isto é a fronteira de confiança, e o que a
 * tela validou não vale mais nada quando chega aqui.
 */

const ROTA = "/marketing/cronograma";

/** Os papéis que escrevem no Cronograma. Os mesmos que o `nav.ts` deixa ver. */
const PAPEIS = ["GESTAO", "VENDAS"] as const;

/**
 * A atividade existe E é de quem está pedindo?
 *
 * As duas perguntas numa só função porque a resposta é a MESMA mensagem em
 * todas as actions, e separá-las já deu, no Connect, dois textos diferentes
 * para a mesma recusa.
 *
 * NÃO DIZ "não é sua" para atividade que não existe, nem "não existe" para atividade de
 * outro: as duas frases juntas contariam, a quem tentasse ids no braço, quais
 * ids existem.
 */
async function minhaAtividade(id: string, userId: string) {
  const atividade = await prisma.contentPost.findUnique({
    where: { id },
    select: { id: true, createdById: true },
  });
  if (!atividade) return { atividade: null, erro: "Atividade não encontrada." };
  // A MESMA FUNÇÃO que a tela usa para decidir se mostra o lápis. Uma cópia
  // da regra aqui divergiria da de lá sem dar erro nenhum.
  if (!podeEditarAtividade(atividade.createdById, userId)) {
    return { atividade: null, erro: "Só quem criou a atividade pode alterá-la." };
  }
  return { atividade, erro: null };
}

export async function criarAtividade(input: AtividadeInput): Promise<ActionResult<{ id: string }>> {
  const sessao = await requireRoleAction([...PAPEIS]);

  const lido = atividadeSchema.safeParse(input);
  if (!lido.success) return actionError(primeiroErro(lido.error));
  const dados = lido.data;

  const atividade = await prisma.contentPost.create({
    data: {
      title: dados.title,
      scheduledAt: instanteDaAtividade(dados.date, dados.time),
      funnel: dados.funnel,
      status: dados.status ?? "IDEIA",
      brand: dados.brand ?? null,
      notes: dados.notes || null,
      // String vazia do `<select>` vira nulo: "" não é id de ninguém, e o
      // Prisma recusaria a chave estrangeira com um erro que a tela não sabe
      // traduzir.
      ownerId: dados.ownerId || null,
      createdById: sessao.userId,
      ...camposNormalizados(dados),
    },
    select: { id: true },
  });

  revalidatePath(ROTA);
  return actionOk(atividade);
}

export async function editarAtividade(
  id: string,
  input: AtividadeInput,
): Promise<ActionResult<{ id: string }>> {
  const sessao = await requireRoleAction([...PAPEIS]);

  const { erro } = await minhaAtividade(id, sessao.userId);
  if (erro) return actionError(erro);

  const lido = atividadeSchema.safeParse(input);
  if (!lido.success) return actionError(primeiroErro(lido.error));
  const dados = lido.data;

  await prisma.contentPost.update({
    where: { id },
    data: {
      title: dados.title,
      scheduledAt: instanteDaAtividade(dados.date, dados.time),
      funnel: dados.funnel,
      // O status NÃO é opcional na edição como é na criação: o formulário de
      // edição mostra o campo preenchido, e tratar a ausência como "IDEIA"
      // rebaixaria uma atividade publicada por causa de um campo que não veio.
      ...(dados.status ? { status: dados.status } : {}),
      brand: dados.brand ?? null,
      notes: dados.notes || null,
      ownerId: dados.ownerId || null,
      ...camposNormalizados(dados),
    },
  });

  revalidatePath(ROTA);
  return actionOk({ id });
}

export async function excluirAtividade(id: string): Promise<ActionResult> {
  const sessao = await requireRoleAction([...PAPEIS]);

  const { erro } = await minhaAtividade(id, sessao.userId);
  if (erro) return actionError(erro);

  await prisma.contentPost.delete({ where: { id } });

  revalidatePath(ROTA);
  return actionOk(undefined);
}

/* -------------------------------------------------------------- roteiro */

/**
 * O roteiro da atividade: rascunho da IA, acabamento da pessoa.
 *
 * A MESMA REGRA DE AUTORIA das outras escritas, pela mesma `minhaAtividade`. O
 * roteiro é um campo da atividade, não um objeto à parte — quem não pode editar a
 * atividade não escreve nela por esta porta.
 *
 * SÓ PEÇA DAQUI, como tudo neste arquivo. O roteiro da atividade do Build.Connect
 * nem atravessa a fronteira (ele é cortado na resposta de lá, de propósito).
 */
export async function gerarRoteiro(id: string): Promise<ActionResult<{ texto: string }>> {
  const sessao = await requireRoleAction([...PAPEIS]);

  const { erro } = await minhaAtividade(id, sessao.userId);
  if (erro) return actionError(erro);

  const atividade = await prisma.contentPost.findUnique({
    where: { id },
    select: {
      title: true,
      scheduledAt: true,
      funnel: true,
      formats: true,
      formatOther: true,
      status: true,
      brand: true,
      platforms: true,
      notes: true,
      owner: { select: { name: true } },
    },
  });
  if (!atividade) return actionError("Atividade não encontrada.");

  // O MODELO E A INSTRUÇÃO VÊM DA GESTÃO (aba Inteligência Artificial), lidos
  // a cada geração: trocar o modelo lá vale na próxima geração, sem deploy.
  const config = await lerConfigDeIa();

  const resposta = await gerarComModelo(
    montarPrompt({
      ...atividade,
      scheduledAt: atividade.scheduledAt.toISOString(),
      responsavel: atividade.owner?.name?.trim().split(/\s+/)[0] || null,
    }),
    config.model,
    config.instruction,
  );
  if (!resposta.ok) return actionError(resposta.motivo);

  // GRAVA JÁ, antes de a tela confirmar: a chamada custa cota e segundos, e
  // uma aba fechada no meio jogaria fora um texto que já foi pago.
  await prisma.contentPost.update({
    where: { id },
    data: { script: resposta.texto, scriptById: sessao.userId, scriptUpdatedAt: new Date() },
  });

  revalidatePath(ROTA);
  return actionOk({ texto: resposta.texto });
}

/** O acabamento da pessoa sobre o rascunho. Texto vazio apaga o roteiro. */
export async function salvarRoteiro(id: string, texto: string): Promise<ActionResult> {
  const sessao = await requireRoleAction([...PAPEIS]);

  const { erro } = await minhaAtividade(id, sessao.userId);
  if (erro) return actionError(erro);

  const limpo = texto.trim();
  // 20 mil caracteres é mais do que qualquer roteiro de rede social, e é o que
  // impede esta porta de virar um depósito de texto no banco.
  if (limpo.length > 20_000) return actionError("Roteiro muito longo.");

  await prisma.contentPost.update({
    where: { id },
    data: {
      script: limpo || null,
      // Apagar o roteiro apaga a assinatura junto: "Escrito por X" sobre um
      // campo vazio é uma linha que fala de um texto que não existe mais.
      scriptById: limpo ? sessao.userId : null,
      scriptUpdatedAt: limpo ? new Date() : null,
    },
  });

  revalidatePath(ROTA);
  return actionOk(undefined);
}
