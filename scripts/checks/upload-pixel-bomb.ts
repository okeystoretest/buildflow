// Checagem do teto de decodificacao de imagem (bomba de descompressao).
// Rodar com: npx tsx scripts/checks/upload-pixel-bomb.ts
//
// O QUE ESTA EM JOGO
// A auditoria de 15/10 mediu: um PNG de 1,9 MB com 16000x16000 em 16 bits RGBA
// passa em TODAS as guardas de formato e tamanho de arquivo — assinatura
// valida, MIME na allow-list, bem abaixo do teto de MB — e descomprime para
// 2,4 GB residentes no processo que serve o sistema inteiro. O teto de pixels
// padrao do sharp nao pega, porque 256 Mpx ficam SOB ele; o que pega e contar
// BYTES do raster, que 16 bits RGBA multiplica por 8.
//
// Esta checagem existe para que ninguem remova esse teto sem ficar vermelho. Ela
// prova as duas direcoes: que a guarda de FORMATO continua aceitando o arquivo
// (ou seja, nao foi ela que mudou) e que processAndSaveImage o RECUSA antes de
// alocar — conferido tambem pela memoria do proprio processo.
import { deflate } from "node:zlib";
import {
  processAndSaveImage,
  validateUploadDataUrl,
  deleteUploadedFile,
} from "../../src/lib/image";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// --- gerador de PNG minimo -------------------------------------------------
// Nenhuma fixture entra no repositorio: o IDAT e um deflate de linhas zeradas,
// entao o arquivo nasce em milissegundos e o teste nao depende de binario
// comitado que ninguem sabe de onde veio.

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(tipo: string, dados: Buffer): Buffer {
  const comprimento = Buffer.alloc(4);
  comprimento.writeUInt32BE(dados.length, 0);
  const corpo = Buffer.concat([Buffer.from(tipo, "ascii"), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo), 0);
  return Buffer.concat([comprimento, corpo, crc]);
}

function deflateAsync(entrada: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    deflate(entrada, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

/**
 * PNG valido, de pixels zerados, com profundidade e canais escolhidos.
 *
 * `profundidade` 16 com `corTipo` 6 (RGBA) custa 8 bytes por pixel ao
 * decodificar — e e exatamente esse multiplicador que a bomba usa.
 */
async function pngZerado(
  largura: number,
  altura: number,
  profundidade: 8 | 16,
  corTipo: 2 | 6,
): Promise<Buffer> {
  const canais = corTipo === 6 ? 4 : 3;
  const bytesPorLinha = 1 + largura * canais * (profundidade / 8);
  const cru = Buffer.alloc(altura * bytesPorLinha); // zeros: filtro 0 + pixels 0

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = profundidade;
  ihdr[9] = corTipo;
  ihdr[10] = 0; // compressao deflate
  ihdr[11] = 0; // filtro adaptativo
  ihdr[12] = 0; // nao entrelacado

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", await deflateAsync(cru)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- os casos --------------------------------------------------------------

async function main() {
  // 4000x4000 em 16 bits RGBA = 16 Mpx x 8 bytes = 128 MB de raster, num
  // arquivo de poucas centenas de KB. Menor que a bomba medida de 2,4 GB de
  // proposito: prova a mesma regra sem fazer esta checagem alocar meio giga.
  const bomba = await pngZerado(4000, 4000, 16, 6);
  const dataUrlBomba = `data:image/png;base64,${bomba.toString("base64")}`;

  check("a bomba e menor que o teto de 4MB por foto", bomba.length < 4 * 1024 * 1024, true);

  // Direcao 1: a guarda de FORMATO aceita. Se um dia isto virar erro, foi a
  // validacao de formato que mudou, nao o teto de decodificacao — e a mensagem
  // de falha precisa deixar isso obvio para quem for consertar.
  check("validacao por assinatura ACEITA a bomba (nao e ela que pega)", validateUploadDataUrl(dataUrlBomba, bomba, 4), null);

  // Direcao 2: processAndSaveImage recusa.
  let recusou = false;
  let mensagem = "";
  try {
    await processAndSaveImage(bomba, {
      folder: "checagem-bomba",
      fileName: "bomba",
      limitInputPixels: 50_000_000,
      maxDecodedBytes: 64 * 1024 * 1024,
    });
  } catch (err) {
    recusou = true;
    mensagem = err instanceof Error ? err.message : String(err);
  }
  check("processAndSaveImage RECUSA a bomba", recusou, true);
  check("a recusa e a do teto de raster", mensagem, "Imagem grande demais para processar.");

  // NAO ha assercao de memoria aqui, e a ausencia e deliberada. A primeira
  // versao desta checagem afirmava "recusou sem alocar o raster" comparando o
  // RSS antes e depois. Conferido por mutacao — desligando a guarda em
  // image.ts —, esse comparativo NAO ficou vermelho: nesta escala o sharp
  // decodifica em tiles e o RSS quase nao se move, então a linha passaria nos
  // dois mundos. Assercao que nao pode falhar nao e assercao, e linha verde
  // decorativa num script de checagem e pior que nenhuma linha: ela faz o
  // proximo leitor acreditar que ha cobertura onde nao ha. O que de fato prende
  // a guarda sao as duas assercoes acima, e as duas ficam vermelhas sem ela.
  // Provar que a recusa acontece ANTES da alocacao exigiria medir o processo
  // por fora, com a bomba de 2,4 GB de verdade — fora do idioma deste projeto.

  // Direcao 3: imagem legitima pequena continua passando com os MESMOS tetos
  // apertados — guarda que recusa tudo nao e guarda, e uma pagina quebrada.
  const legitima = await pngZerado(64, 64, 8, 2);
  let salva: { filePath: string } | null = null;
  let erroLegitima = "";
  try {
    salva = await processAndSaveImage(legitima, {
      folder: "checagem-bomba",
      fileName: "legitima",
      limitInputPixels: 50_000_000,
      maxDecodedBytes: 64 * 1024 * 1024,
    });
  } catch (err) {
    erroLegitima = err instanceof Error ? err.message : String(err);
  }
  check("imagem pequena legitima PASSA com os mesmos tetos", erroLegitima, "");
  check("e devolve um caminho para gravar", typeof salva?.filePath === "string", true);

  // Nao deixa residuo no disco de quem rodou a checagem.
  if (salva) await deleteUploadedFile(salva.filePath).catch(() => {});

  if (falhas > 0) {
    console.log(`\n${falhas} checagem(ns) falharam.`);
    process.exit(1);
  }
  console.log("upload-pixel-bomb: todas as checagens passaram.");
}

main().catch((err) => {
  console.log("FALHOU com excecao inesperada:", err);
  process.exit(1);
});
