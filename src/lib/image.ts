import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
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

// Base publica servida pelo Nginx (ou rota dev). Ex: /uploads
const PUBLIC_BASE = process.env.NEXT_PUBLIC_UPLOAD_BASE_URL ?? "/uploads";

const MAX_DIMENSION = 1600; // lado maior em px
const WEBP_QUALITY = 72; // 0-100; equilibrio tamanho/qualidade

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

  // Sanitiza nome e forca extensao .webp
  const safeName = opts.fileName.replace(/[^a-zA-Z0-9_-]/g, "") || `img_${Date.now()}`;
  const finalName = `${safeName}.webp`;
  const absolutePath = path.join(destDirAbs, finalName);

  // Pipeline sharp: auto-rotaciona (EXIF do celular), redimensiona se preciso, vira webp.
  let pipeline = sharp(input).rotate();

  const meta = await pipeline.metadata();
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
  const finalName = `${safeName}.pdf`;
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
