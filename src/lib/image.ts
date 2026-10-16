import sharp from "sharp";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

/**
 * Tratamento de imagem do Build.Flow.
 *
 * REGRAS (fixas para todo o projeto):
 *  - Nunca salvamos binario no banco. Esta funcao salva no DISCO e devolve
 *    apenas o caminho relativo (string) para gravar no Postgres.
 *  - Toda foto e OBRIGATORIAMENTE convertida para .webp.
 *  - Redimensiona se passar do limite e reduz qualidade p/ economizar a VPS.
 *  - Arquivos organizados por ano/mes dentro de uma subpasta.
 */

// Pasta raiz absoluta dos uploads (configurada no .env).
//   Producao VPS: /var/www/app/uploads
//   Dev:          ./uploads
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";

// Base publica gravada no `filePath` dos registros novos.
//
// Default passou de "/uploads" para "/api/uploads": a rota /uploads nao servia
// arquivo com checagem de sessao propria, so a /api/uploads faz isso. Arquivos
// novos ja nascem apontando para a rota autenticada.
const PUBLIC_BASE = process.env.NEXT_PUBLIC_UPLOAD_BASE_URL ?? "/api/uploads";

// Bases que podem aparecer no inicio de um `filePath` gravado no banco. A
// ordem nao importa (o match e pelo mais longo), mas a LISTA importa: registros
// antigos guardaram "/uploads/..." e precisam continuar sendo localizaveis no
// disco depois da troca do default acima.
const KNOWN_PUBLIC_BASES = Array.from(
  new Set([PUBLIC_BASE, "/api/uploads", "/uploads"]),
).sort((a, b) => b.length - a.length);

const MAX_DIMENSION = 1600; // lado maior em px
const WEBP_QUALITY = 72; // 0-100; equilibrio tamanho/qualidade

/** Teto de pixels de ENTRADA. Mesmo valor que o sharp usa por padrao, escrito
 *  aqui para poder ser apertado por chamador. */
const DEFAULT_LIMIT_INPUT_PIXELS = 0x3fff ** 2; // 268.402.689

/** Teto do raster DESCOMPRIMIDO, em bytes. 256 MB e generoso para comprovante
 *  de celular e fecha a bomba de 2,4 GB. Chamador que sabe o tamanho util da
 *  propria imagem deve apertar. */
const DEFAULT_MAX_DECODED_BYTES = 256 * 1024 * 1024;

export interface ProcessedImage {
  /** Caminho relativo p/ gravar no banco. Ex: /uploads/comprovantes/2026/06/clx.webp */
  filePath: string;
  /** Caminho absoluto no disco (uso interno). */
  absolutePath: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
}

export interface ProcessImageOptions {
  /** Subpasta logica, ex "comprovantes". */
  folder?: string;
  /** Nome base do arquivo (sem extensao). Recomenda-se o id do registro. */
  fileName: string;
  maxDimension?: number;
  quality?: number;
  /** Teto de pixels de ENTRADA. Padrao: o do sharp (268.402.689). */
  limitInputPixels?: number;
  /** Teto do raster DESCOMPRIMIDO em bytes. Padrao: 256 MB. Ver o comentario da
   *  bomba de descompressao em processAndSaveImage. */
  maxDecodedBytes?: number;
}

/**
 * Recebe o buffer cru da imagem (vindo do upload do celular),
 * processa com sharp e grava .webp no disco.
 */
export async function processAndSaveImage(
  input: Buffer,
  opts: ProcessImageOptions,
): Promise<ProcessedImage> {
  if (!input || input.length === 0) {
    throw new Error("Arquivo de imagem vazio ou invalido.");
  }

  const folder = opts.folder ?? "uploads";
  const quality = opts.quality ?? WEBP_QUALITY;
  const maxDim = opts.maxDimension ?? MAX_DIMENSION;

  // Estrutura ano/mes
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");

  // Pasta absoluta destino: <UPLOAD_DIR>/<folder>/<ano>/<mes>
  const destDirAbs = path.join(UPLOAD_DIR, folder, year, month);
  await mkdir(destDirAbs, { recursive: true });

  // Sanitiza nome e forca extensao .webp. Acrescenta um sufixo ALEATORIO
  // (UUID) para que o caminho final nao seja adivinhavel a partir de
  // orderId/campo/timestamp — defesa em profundidade mesmo com a rota
  // autenticada de /api/uploads.
  const safeName = opts.fileName.replace(/[^a-zA-Z0-9_-]/g, "") || `img_${Date.now()}`;
  const finalName = `${safeName}_${randomUUID()}.webp`;
  const absolutePath = path.join(destDirAbs, finalName);

  // Pipeline sharp: auto-rotaciona (EXIF do celular), redimensiona se preciso, vira webp.
  const limitInputPixels = opts.limitInputPixels ?? DEFAULT_LIMIT_INPUT_PIXELS;
  let pipeline = sharp(input, { limitInputPixels }).rotate();

  const meta = await pipeline.metadata();

  // BOMBA DE DESCOMPRESSAO. O teto que importa aqui e em BYTES do raster
  // descomprimido, nao em pixels nem no tamanho do arquivo.
  //
  // Um PNG de 1,9 MB com 16000x16000 em 16 bits RGBA passa em TODAS as guardas
  // que existiam: assinatura valida, MIME na allow-list, arquivo bem abaixo do
  // teto de MB. Mas 16 bits RGBA custa 8 bytes por pixel, e 256 Mpx — que ficam
  // SOB o limite de pixels padrao do sharp — descomprimem para 2,4 GB
  // residentes e ~12 s de decodificacao nativa, medidos. Num processo que serve
  // o dashboard inteiro, isso e o OOM killer levando pedidos, financeiro e
  // logistica junto; e como o rate limit por IP vive em memoria desse mesmo
  // processo, a queda zera a contagem e o ataque se repete de um IP so.
  //
  // metadata() custa milissegundos e NAO decodifica a imagem — e por isso que a
  // conta pode ser feita aqui, antes de qualquer alocacao. Lancar e deliberado:
  // os chamadores ja envolvem esta funcao em try/catch com mensagem propria.
  const maxDecodedBytes = opts.maxDecodedBytes ?? DEFAULT_MAX_DECODED_BYTES;
  const bytesDoRaster =
    (meta.width ?? 0) *
    (meta.height ?? 0) *
    (meta.channels ?? 4) *
    (meta.depth === "ushort" || meta.depth === "short" ? 2 : 1);
  if (bytesDoRaster > maxDecodedBytes) {
    throw new Error("Imagem grande demais para processar.");
  }

  if ((meta.width ?? 0) > maxDim || (meta.height ?? 0) > maxDim) {
    pipeline = pipeline.resize(maxDim, maxDim, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const outBuffer = await pipeline.webp({ quality }).toBuffer();
  await writeFile(absolutePath, outBuffer);

  // Le dimensoes finais
  const outMeta = await sharp(outBuffer).metadata();

  // Caminho relativo (publico) p/ gravar no banco
  const filePath = `${PUBLIC_BASE}/${folder}/${year}/${month}/${finalName}`.replace(
    /\/+/g,
    "/",
  );

  return {
    filePath,
    absolutePath,
    width: outMeta.width ?? null,
    height: outMeta.height ?? null,
    sizeBytes: outBuffer.length,
  };
}

/** Valida tipo/tamanho do arquivo antes de processar. */
export function validateUpload(file: File, maxMb = 15): string | null {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
  if (!allowed.includes(file.type)) {
    return "Formato nao suportado. Envie JPG, PNG ou HEIC.";
  }
  if (file.size > maxMb * 1024 * 1024) {
    return `Imagem muito grande. Limite: ${maxMb}MB.`;
  }
  return null;
}

// Limite por arquivo em upload de comprovante.
//
// NOVE megabytes, nao quinze: o teto real nao e escolhido aqui, e o
// `serverActions.bodySizeLimit` de 12mb do next.config. O base64 infla o
// binario em 4/3, entao um arquivo de 15MB chega como ~20MB de payload e
// morre no limite do Next antes de qualquer action rodar — com erro opaco, em
// vez da mensagem que escrevemos. Prometer 15MB era prometer o que nao se
// cumpre.
export const MAX_UPLOAD_MB = 9;

// MIMEs aceitos quando o data-URL declara um. Mesma lista do validateUpload
// acima, para os dois caminhos (File e base64) nao divergirem.
//
// SVG esta FORA DE PROPOSITO: e XML executavel, e o sharp o entrega ao
// librsvg. Comprovante nenhum precisa ser SVG, e aceitar um significa expor o
// parser a bytes de quem envia.
const ALLOWED_UPLOAD_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

/**
 * Formato REAL do arquivo, pelos magic bytes. Devolve null no que nao
 * reconhece.
 *
 * Esta e a checagem que vale: o MIME do data-URL e declarado por quem envia e
 * o `accept=` do <input> e conforto de tela — nenhum dos dois decide nada.
 */
function sniffUploadFormat(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  const hex = (de: number, ate: number) => buffer.subarray(de, ate).toString("hex");
  const ascii = (de: number, ate: number) => buffer.subarray(de, ate).toString("ascii");

  if (hex(0, 3) === "ffd8ff") return "image/jpeg";
  if (hex(0, 8) === "89504e470d0a1a0a") return "image/png";
  // WebP e um container RIFF: "RIFF" ....(tamanho).... "WEBP". Sem conferir o
  // segundo marcador, um .wav ou .avi passaria por imagem.
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  // HEIC/HEIF do celular: caixa "ftyp" com marca heic/heix/mif1/msf1...
  if (ascii(4, 8) === "ftyp") {
    const marca = ascii(8, 12).toLowerCase();
    if (["heic", "heix", "hevc", "heim", "heis", "hevm", "hevs", "mif1", "msf1"].includes(marca)) {
      return "image/heic";
    }
  }
  if (ascii(0, 4) === "%PDF") return "application/pdf";
  return null;
}

/**
 * Valida um comprovante recebido como data-URL base64, ANTES de ele chegar ao
 * sharp ou ao disco. Devolve a mensagem de erro, ou null quando esta liberado.
 *
 * Espelha o `validateUpload(file)` acima, que serve ao caminho de upload por
 * objeto File. Os dois caminhos existem no projeto e precisam da mesma regra:
 * quem corrige um e esquece o outro deixa metade da porta aberta.
 *
 * Ordem de propósito: tamanho (barato), depois o MIME declarado quando houver,
 * depois os magic bytes — que mandam. Um data-URL sem prefixo `data:` cai
 * direto na conferencia de assinatura, que e a autoritativa de todo modo.
 */
export function validateUploadDataUrl(
  dataUrl: string,
  buffer: Buffer,
  maxMb = MAX_UPLOAD_MB,
): string | null {
  if (!buffer || buffer.length === 0) return "Arquivo vazio ou invalido.";
  if (buffer.length > maxMb * 1024 * 1024) {
    return `Arquivo muito grande (max. ${maxMb}MB).`;
  }

  const declarado = /^data:([^;,]+)[;,]/.exec(dataUrl)?.[1]?.trim().toLowerCase();
  if (declarado && !ALLOWED_UPLOAD_MIME.includes(declarado)) {
    return "Formato nao suportado. Envie JPG, PNG, HEIC, WebP ou PDF.";
  }

  const real = sniffUploadFormat(buffer);
  if (!real) {
    return "O arquivo nao e uma imagem ou PDF valido.";
  }
  // Declarar PDF e mandar imagem (ou o contrario) nao e so inconsistencia: o
  // MIME declarado e que escolhe entre saveDocument e o pipeline do sharp.
  if (declarado === "application/pdf" && real !== "application/pdf") {
    return "O arquivo foi enviado como PDF, mas nao e um PDF.";
  }
  if (declarado && declarado !== "application/pdf" && real === "application/pdf") {
    return "O arquivo e um PDF, mas foi enviado como imagem.";
  }

  return null;
}

/**
 * Salva um PDF no disco, SEM passar pelo sharp.
 *
 * Por que separado: o sharp so entende imagem (raster). Um PDF e um documento
 * vetorial/paginado — jogar no pipeline .webp() quebraria. Aqui o arquivo e
 * gravado como esta, mantendo a mesma organizacao (<folder>/<ano>/<mes>) e a
 * mesma regra do projeto: no banco vai apenas a STRING do caminho.
 */
export async function saveDocument(
  input: Buffer,
  opts: { folder?: string; fileName: string },
): Promise<ProcessedImage> {
  if (!input || input.length === 0) {
    throw new Error("Arquivo vazio ou invalido.");
  }

  // Assinatura de PDF: os arquivos comecam com "%PDF" (25 50 44 46).
  // Confere o conteudo real, nao so o nome/MIME informado pelo navegador.
  const assinatura = input.subarray(0, 4).toString("ascii");
  if (assinatura !== "%PDF") {
    throw new Error("Arquivo nao e um PDF valido.");
  }

  const folder = opts.folder ?? "uploads";
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");

  const destDirAbs = path.join(UPLOAD_DIR, folder, year, month);
  await mkdir(destDirAbs, { recursive: true });

  const safeName = opts.fileName.replace(/[^a-zA-Z0-9_-]/g, "") || `doc_${Date.now()}`;
  const finalName = `${safeName}_${randomUUID()}.pdf`;
  const absolutePath = path.join(destDirAbs, finalName);

  await writeFile(absolutePath, input);

  const filePath = `${PUBLIC_BASE}/${folder}/${year}/${month}/${finalName}`.replace(
    /\/+/g,
    "/",
  );

  return {
    filePath,
    absolutePath,
    width: null,   // PDF nao tem dimensao raster
    height: null,
    sizeBytes: input.length,
  };
}

/** Detecta se o data-URL/base64 recebido e um PDF. */
export function isPdfDataUrl(dataUrl: string): boolean {
  return /^data:application\/pdf/i.test(dataUrl);
}

/**
 * Converte o caminho publico gravado no banco (ex.:
 * "/api/uploads/comprovantes-entrega/2026/09/x.webp") no caminho ABSOLUTO do
 * arquivo dentro de UPLOAD_DIR.
 *
 * Devolve null quando o resultado escaparia da raiz de uploads — o caminho vem
 * do banco, mas quem serve o arquivo nao deve depender disso para nao virar um
 * path traversal caso um registro seja gravado torto.
 *
 * Existe para que outros handlers que servem arquivo (ex.: o comprovante de
 * entrega no acompanhamento do cliente) reaproveitem a MESMA conversao de base
 * publica -> disco, em vez de reimplementarem a lista de bases conhecidas.
 */
export function resolveUploadedFilePath(publicPath: string): string | null {
  if (!publicPath) return null;
  let rel = publicPath;
  const base = KNOWN_PUBLIC_BASES.find((b) => rel.startsWith(b));
  if (base) rel = rel.slice(base.length);
  rel = rel.replace(/^\/+/, "");
  if (!rel) return null;

  const root = path.resolve(UPLOAD_DIR);
  const absolute = path.resolve(root, rel);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) return null;
  return absolute;
}

/**
 * Remove do DISCO um arquivo previamente salvo, a partir do caminho relativo
 * gravado no banco (ex.: "/uploads/comprovantes-pagamento/2026/07/x.webp").
 *
 * Converte o caminho publico (PUBLIC_BASE) de volta para o caminho absoluto
 * em UPLOAD_DIR. Falhas (arquivo ja inexistente) sao ignoradas de proposito:
 * o objetivo e garantir que o arquivo nao fique orfao, nao travar o fluxo.
 */
export async function deleteUploadedFile(publicPath: string): Promise<void> {
  try {
    if (!publicPath) return;
    // A conversao caminho publico -> disco (incluindo a lista de bases antigas)
    // vive em resolveUploadedFilePath: duas copias dessa regra divergiriam.
    const absolutePath = resolveUploadedFilePath(publicPath);
    if (!absolutePath) return;
    await unlink(absolutePath);
  } catch {
    // Arquivo ja pode nao existir; ignorar silenciosamente.
  }
}
