"use server";

import { revalidatePath } from "next/cache";
import { requireRoleAction } from "@/lib/auth";
import { actionError, actionOk, type ActionResult } from "@/types/action";
import {
  deleteUploadedFile,
  processAndSaveImage,
  validateUploadDataUrl,
} from "@/lib/image";
import {
  MAX_ALT,
  PASTA_PUBLICA,
  ehLugarDeImagem,
  type LugarDeImagem,
} from "@/lib/lp-assets";
import {
  caminhoRelativoDaLp,
  escreverManifesto,
  lerManifesto,
} from "@/lib/lp-assets-server";

/**
 * Troca de imagem da LP pública, feita pelo dono sem deploy.
 *
 * Esta action é o OPOSTO de `wholesale-apply`: aqui existe sessão e ela é a
 * autoridade inteira. O gatilho oculto na página não protege nada — ele só
 * evita exibir controles a quem não vai usá-los. Quem decide é
 * `requireRoleAction(["GESTAO"])`, no servidor, a cada chamada.
 */

// Mesmos tetos de decodificação da porta pública: a imagem útil aqui tem 1600 px
// de lado, e esta é a única outra entrada de arquivo do mundo /atacado.
const TETOS_DE_DECODIFICACAO = {
  limitInputPixels: 50_000_000,
  maxDecodedBytes: 64 * 1024 * 1024,
} as const;

const MAX_FOTO_MB = 4;

export interface SalvarImagemInput {
  marcaSlug: string;
  lugar: string;
  /**
   * data-URL já encolhida no navegador, ou VAZIA para só atualizar a descrição.
   *
   * O campo "Descrição da imagem" é editável na tela e, antes, só viajava
   * carona num arquivo novo: quem corrigisse um erro de digitação e saísse da
   * página perdia o texto sem aviso, e quem escolhesse o arquivo antes de
   * digitar gravava a descrição antiga. Campo de texto editável sem ação de
   * salvar promete persistência que não existia.
   */
  imagem: string;
  alt: string;
}

export async function salvarImagemDaLp(
  input: SalvarImagemInput,
): Promise<ActionResult<{ arquivo: string }>> {
  // `requireRoleAction` LANÇA para quem não tem o papel, e exceção em Server
  // Action vira 500 opaco. Aqui ela é capturada e traduzida.
  try {
    await requireRoleAction(["GESTAO"]);
  } catch {
    return actionError("Sem permissão para alterar as imagens desta página.");
  }

  if (!input || typeof input !== "object") {
    return actionError("Requisição inválida.");
  }
  if (!ehLugarDeImagem(input.lugar)) {
    // Lista fechada: o lugar chega do navegador e viraria chave no manifesto.
    return actionError("Lugar de imagem desconhecido.");
  }
  const lugar: LugarDeImagem = input.lugar;

  const marcaSlug = typeof input.marcaSlug === "string" ? input.marcaSlug : "";
  if (marcaSlug !== "okey" && marcaSlug !== "lov-club") {
    return actionError("Marca desconhecida.");
  }

  const alt = typeof input.alt === "string" ? input.alt.trim().slice(0, MAX_ALT) : "";

  const dataUrl = typeof input.imagem === "string" ? input.imagem : "";

  // CAMINHO SÓ-DESCRIÇÃO: sem imagem nova, nada é decodificado, nada é escrito
  // no volume e nada é apagado — só o `alt` da entrada que já existe. Exigir que
  // ela exista é o que impede este caminho de criar entrada apontando para
  // arquivo nenhum.
  if (dataUrl === "") {
    const atual = await lerManifesto(marcaSlug);
    const entrada = atual[lugar];
    if (!entrada) {
      return actionError("Envie uma imagem antes de descrever este lugar.");
    }
    if (entrada.alt === alt) {
      return actionOk({ arquivo: entrada.arquivo });
    }
    try {
      await escreverManifesto(marcaSlug, { ...atual, [lugar]: { ...entrada, alt } });
    } catch (err) {
      console.error("[lp-assets] falha ao gravar a descrição:", err);
      return actionError("Não foi possível salvar a descrição. Tente novamente.");
    }
    revalidatePath(`/atacado/${marcaSlug}`);
    return actionOk({ arquivo: entrada.arquivo });
  }

  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const buffer = Buffer.from(base64, "base64");

  // Mesmo caminho endurecido da porta pública: assinatura por magic bytes
  // manda, o MIME declarado não decide nada, e SVG não tem assinatura para
  // casar (foi o risco da CVE-2026-96889, fechado na auditoria de 08/10).
  const erroFormato = validateUploadDataUrl(dataUrl, buffer, MAX_FOTO_MB);
  if (erroFormato) {
    return actionError(`Imagem recusada: ${erroFormato}`);
  }
  // PDF passa pela validação acima (ela serve também a comprovante) e explodiria
  // no sharp. Conferido pela ASSINATURA, não pelo MIME declarado.
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%PDF") {
    return actionError("Envie uma foto (JPG ou PNG), não um PDF.");
  }

  const anterior = await lerManifesto(marcaSlug);

  let salva;
  try {
    salva = await processAndSaveImage(buffer, {
      folder: `${PASTA_PUBLICA}/${marcaSlug}`,
      fileName: lugar,
      ...TETOS_DE_DECODIFICACAO,
    });
  } catch (err) {
    console.error("[lp-assets] sharp falhou ao processar a imagem:", err);
    return actionError("Não foi possível processar esta imagem. Tente um JPG ou PNG.");
  }

  // O manifesto guarda o caminho RELATIVO a uploads, e a rota pública de leitura
  // o remonta — é o que mantém o resto do volume fora do alcance. Derivado do
  // caminho em DISCO, não do público: a base pública é configurável, e um
  // `replace` de uma base só gravava caminho inválido em silêncio.
  const relativo = caminhoRelativoDaLp(salva.absolutePath);
  if (!relativo) {
    console.error("[lp-assets] caminho gravado fora da pasta pública:", salva.absolutePath);
    await deleteUploadedFile(salva.filePath).catch(() => {});
    return actionError("Não foi possível salvar a imagem. Tente novamente.");
  }

  try {
    await escreverManifesto(marcaSlug, { ...anterior, [lugar]: { arquivo: relativo, alt } });
  } catch (err) {
    console.error("[lp-assets] falha ao gravar o manifesto:", err);
    // O arquivo já está no disco e ninguém aponta para ele: apaga, para a falha
    // não deixar lixo no volume.
    await deleteUploadedFile(salva.filePath).catch(() => {});
    return actionError("Não foi possível salvar a imagem. Tente novamente.");
  }

  // A anterior só sai depois de o manifesto novo estar gravado: se a ordem fosse
  // inversa, uma falha no meio deixaria a página apontando para arquivo apagado.
  const substituida = anterior[lugar]?.arquivo;
  if (substituida && substituida !== relativo) {
    await deleteUploadedFile(`/api/uploads/${substituida}`).catch(() => {});
  }

  revalidatePath(`/atacado/${marcaSlug}`);
  return actionOk({ arquivo: relativo });
}
