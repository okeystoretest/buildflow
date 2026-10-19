/**
 * RETENÇÃO DAS CANDIDATURAS DE ATACADO (LGPD Arts. 15 e 16).
 *
 * O Art. 16 diz que o dado pessoal é eliminado quando a finalidade se cumpre.
 * A finalidade aqui é "analisar a sua candidatura a revenda" — e não existia
 * nenhum caminho de exclusão no sistema: nem automático, nem manual. Uma
 * candidatura de 2026 ficaria no banco em 2031, com foto da loja e CNPJ.
 *
 * ANCORAGEM NO ENVIO, não na decisão. 90 dias contados de `createdAt`, porque é
 * exatamente o que o rodapé da LP promete à lojista: "guardados por até 90 dias
 * a contar do envio". As duas pontas leem `RETENCAO_DIAS`, e
 * `scripts/checks/wholesale-content.ts` prende que continuem iguais — uma
 * página que promete 90 e um job que apaga em 180 é a página mentindo, e é o
 * tipo de divergência que ninguém percebe porque as duas metades parecem certas
 * lidas em separado.
 *
 * shortcut: candidatura APROVADA também é apagada no dia 90 contado do envio —
 * aprovada no dia 85, o contato da lojista desaparece em 5 dias, porque a
 * aprovação não cria Customer (decisão da spec) e o contato vive só aqui.
 * Upgrade quando a aprovação for mexida: ela passa a gravar o que o negócio
 * precisa guardar, numa tabela com finalidade própria declarada, e aí ESTE
 * prazo não precisa esticar. Caminho escolhido pelo dono em 16/10/2026 (opção
 * C): o prazo fica, o conserto é na aprovação, e fica para depois. Esticar os
 * 90 dias seria o conserto errado — guardaria todo mundo mais tempo para
 * resolver o caso de quem foi aprovado.
 */
import { prisma } from "@/lib/prisma";
import { deleteUploadedFile } from "@/lib/image";

/** Dias que uma candidatura fica guardada, contados do envio. Decisão do dono, 16/10/2026. */
export const RETENCAO_DIAS = 90;

/**
 * A fronteira: candidatura criada ANTES deste instante está vencida.
 *
 * Pura e com `agora` injetado para o script poder conferir o cálculo sem
 * esperar 90 dias. Estritamente anterior (`<`), nunca `<=`: no instante exato
 * do limite o prazo prometido ainda está sendo cumprido, e arredondar para
 * dentro apagaria um dia antes do que a página diz.
 */
export function limiteDeRetencao(agora: Date): Date {
  return new Date(agora.getTime() - RETENCAO_DIAS * 24 * 60 * 60 * 1000);
}

/**
 * Apaga UMA candidatura: as duas fotos e depois a linha, com o diário junto.
 *
 * ORDEM IMPORTA, e é a razão de isto ser uma função só em vez de estar copiado
 * nos dois chamadores. O arquivo sai ANTES da linha: apagar a linha primeiro
 * perde o caminho do arquivo, e o arquivo fica órfão no volume para sempre —
 * um vazamento de dado pessoal que nenhuma consulta mostra. O expurgo diário e
 * a exclusão manual da Gestão precisam obedecer à mesma ordem, e uma regra de
 * LGPD escrita duas vezes é uma regra que diverge na primeira correção.
 *
 * `deleteUploadedFile` já se recusa a sair da raiz de uploads e já ignora
 * arquivo ausente, então chamar duas vezes não quebra.
 *
 * Devolve quantos arquivos saíram. Lança se o banco recusar — quem chama
 * decide se isso derruba a operação (exclusão manual) ou se conta a falha e
 * segue (expurgo em lote).
 */
export async function apagarCandidatura(lead: {
  id: string;
  instagramImagePath: string | null;
  storeImagePath: string | null;
}): Promise<number> {
  let arquivos = 0;
  for (const caminho of [lead.instagramImagePath, lead.storeImagePath]) {
    if (!caminho) continue;
    await deleteUploadedFile(caminho);
    arquivos++;
  }
  // O diário de decisões aponta para a candidatura; sai junto, no mesmo
  // movimento, senão sobra um evento órfão falando de um lead que não existe.
  await prisma.$transaction([
    prisma.wholesaleLeadEvent.deleteMany({ where: { leadId: lead.id } }),
    prisma.wholesaleLead.delete({ where: { id: lead.id } }),
  ]);
  return arquivos;
}

export interface ResultadoDoExpurgo {
  apagados: number;
  arquivosApagados: number;
}

/**
 * Apaga as candidaturas vencidas e as duas fotos de cada uma, por
 * `apagarCandidatura` — a mesma rotina que a exclusão manual da Gestão usa.
 *
 * Uma transação por candidatura, não uma para todas: o expurgo é higiene, e um
 * registro problemático não deve impedir os outros 300 de serem apagados. O
 * `catch` conta a falha em vez de derrubar a rotina.
 */
export async function expurgarCandidaturasVencidas(
  agora: Date = new Date(),
): Promise<ResultadoDoExpurgo> {
  const limite = limiteDeRetencao(agora);
  const vencidas = await prisma.wholesaleLead.findMany({
    where: { createdAt: { lt: limite } },
    select: { id: true, instagramImagePath: true, storeImagePath: true },
  });

  let apagados = 0;
  let arquivosApagados = 0;

  for (const lead of vencidas) {
    try {
      arquivosApagados += await apagarCandidatura(lead);
      apagados++;
    } catch {
      // Conta como não apagado e segue. A próxima execução tenta de novo:
      // o WHERE por data continua casando enquanto a linha existir.
    }
  }

  return { apagados, arquivosApagados };
}
