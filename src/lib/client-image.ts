"use client";

// Reduz a imagem no NAVEGADOR antes de enviar pela Server Action.
// Objetivo: não estourar o limite de body e poupar a rede do celular.
// O tratamento final (conversão para .webp, qualidade) continua no servidor
// com o sharp. Aqui só encolhemos para um tamanho de tráfego seguro.

export interface ShrinkOptions {
  maxDimension?: number; // lado maior, em px
  quality?: number; // 0..1 (JPEG intermediário só para transporte)
}

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export interface ShrinkResult {
  base64: string; // data URL pronta para enviar
  error?: undefined;
}
export interface ShrinkError {
  base64?: undefined;
  error: string;
}

export async function shrinkImageToBase64(
  file: File,
  opts: ShrinkOptions = {},
): Promise<ShrinkResult | ShrinkError> {
  if (!ALLOWED.includes(file.type)) {
    return { error: "Envie JPG, PNG ou HEIC." };
  }
  // Limite generoso de origem (antes de encolher).
  if (file.size > 25 * 1024 * 1024) {
    return { error: "Imagem muito grande (máx. 25MB)." };
  }

  const maxDim = opts.maxDimension ?? 1600;
  const quality = opts.quality ?? 0.8;

  try {
    const dataUrl = await readAsDataUrl(file);
    // HEIC/HEIF muitas vezes não desenham em canvas; nesse caso envia o original.
    if (file.type === "image/heic" || file.type === "image/heif") {
      return { base64: dataUrl };
    }

    const img = await loadImage(dataUrl);
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      if (width >= height) { height = Math.round((height * maxDim) / width); width = maxDim; }
      else { width = Math.round((width * maxDim) / height); height = maxDim; }
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { base64: dataUrl }; // fallback: manda original
    ctx.drawImage(img, 0, 0, width, height);

    // JPEG só para transporte; o servidor reconverte para webp.
    const out = canvas.toDataURL("image/jpeg", quality);
    return { base64: out };
  } catch {
    // Qualquer falha: cai para o arquivo original lido como data URL.
    try {
      const fallback = await readAsDataUrl(file);
      return { base64: fallback };
    } catch {
      return { error: "Não foi possível processar a imagem." };
    }
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("read error"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load error"));
    img.src = src;
  });
}

// ---------------------------------------------------------------------------
// Nota Fiscal: aceita IMAGEM ou PDF.
// ---------------------------------------------------------------------------

const MAX_PDF_MB = 15;

/**
 * Prepara o arquivo da Nota Fiscal para envio.
 *
 * - IMAGEM: encolhe no navegador (mesma logica de sempre); o servidor converte
 *   para .webp com o sharp.
 * - PDF: NAO passa por canvas/sharp (destruiria o documento). Apenas le em
 *   base64 e envia; o servidor grava o arquivo como esta.
 */
export async function prepareInvoiceFile(
  file: File,
  opts: ShrinkOptions = {},
): Promise<ShrinkResult | ShrinkError> {
  const ehPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (ehPdf) {
    if (file.size > MAX_PDF_MB * 1024 * 1024) {
      return { error: `PDF muito grande. Limite: ${MAX_PDF_MB}MB.` };
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      // Garante o prefixo correto para o servidor identificar o PDF.
      const base64 = dataUrl.startsWith("data:application/pdf")
        ? dataUrl
        : dataUrl.replace(/^data:[^;]*;/, "data:application/pdf;");
      return { base64 };
    } catch {
      return { error: "Nao foi possivel ler o PDF." };
    }
  }

  // Nao e PDF: segue o caminho normal de imagem.
  return shrinkImageToBase64(file, opts);
}
