/**
 * Gera os icones do app a partir de public/logo.png.
 *
 * POR QUE EXISTE: os icones anteriores foram achatados sobre BRANCO, e o
 * quadrado branco aparecia na aba do navegador. A logo de origem tem fundo
 * transparente; o que faltava era preservar isso ao redimensionar.
 *
 * FUNDO TRANSPARENTE, menos em dois casos onde transparente e PIOR:
 *  - apple-icon: o iOS pinta o vazio de PRETO.
 *  - maskable: o Android recorta o icone em circulo e preenche o resto; sem
 *    fundo opaco vira um disco preto. Alem disso o conteudo precisa caber na
 *    "safe zone" (circulo de 80% do lado), senao a borda da logo e cortada.
 *
 * Rode com: npx tsx scripts/gerar-icones.ts
 */
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const ORIGEM = "public/logo.png";
/** Fundo escuro do app (o mesmo `background_color` do manifest). */
const FUNDO_OPACO = { r: 0x0f, g: 0x16, b: 0x21, alpha: 1 };
const TRANSPARENTE = { r: 0, g: 0, b: 0, alpha: 0 };

/**
 * A logo COM O "F" SOLIDO e o fundo vazio.
 *
 * O arquivo de origem nao tem quase nenhum pixel opaco (37 de 89.088): o "F"
 * tem um degrade de OPACIDADE, solido em cima e desbotando para baixo. Ele foi
 * desenhado para ficar sobre branco — a parte clara do "F" E o branco de tras
 * aparecendo. Deixar essa transparencia passar para o icone faria metade da
 * logo sumir sobre uma aba escura.
 *
 * Entao: achata sobre branco (que captura as cores COMO FORAM DESENHADAS) e
 * depois recorta usando o proprio contorno, reforcado, como molde. Resultado:
 * as cores certas, solidas, com fundo vazio de verdade.
 */
async function logoSolida(): Promise<Buffer> {
  const { data, info } = await sharp(ORIGEM).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const saida = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    // A cor COMO FOI DESENHADA: o arquivo e translucido porque contava com o
    // branco atras. Compor sobre branco aqui recupera a cor final pretendida.
    saida[i] = Math.round(data[i] * a + 255 * (1 - a));
    saida[i + 1] = Math.round(data[i + 1] * a + 255 * (1 - a));
    saida[i + 2] = Math.round(data[i + 2] * a + 255 * (1 - a));
    // x4: o interior mais apagado do "F" (~64) vira opaco; a borda suavizada
    // (abaixo de 64) continua graduada, sem serrilhar.
    saida[i + 3] = Math.min(255, data[i + 3] * 4);
  }
  return sharp(saida, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

/** A logo centrada num quadrado de `lado`, ocupando `ocupacao` dele. */
async function quadrado(lado: number, ocupacao: number, fundo: typeof TRANSPARENTE) {
  const interno = Math.round(lado * ocupacao);
  const margem = Math.round((lado - interno) / 2);
  const logo = await sharp(await logoSolida())
    .resize(interno, interno, { fit: "contain", background: TRANSPARENTE })
    .toBuffer();
  return sharp({
    create: { width: lado, height: lado, channels: 4, background: fundo },
  })
    .composite([{ input: logo, top: margem, left: margem }])
    .png()
    .toBuffer();
}

/**
 * Embrulha um PNG num container .ico ("PNG-in-ICO"). Todo navegador atual le
 * este formato, e e o unico jeito de gerar .ico com o sharp, que nao escreve
 * ICO nativamente.
 */
function pngParaIco(png: Buffer, lado: number): Buffer {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0); // reservado
  dir.writeUInt16LE(1, 2); // 1 = icone
  dir.writeUInt16LE(1, 4); // 1 imagem
  const entrada = Buffer.alloc(16);
  entrada.writeUInt8(lado === 256 ? 0 : lado, 0); // 0 significa 256
  entrada.writeUInt8(lado === 256 ? 0 : lado, 1);
  entrada.writeUInt8(0, 2); // paleta: nenhuma
  entrada.writeUInt8(0, 3); // reservado
  entrada.writeUInt16LE(1, 4); // planos
  entrada.writeUInt16LE(32, 6); // bits por pixel
  entrada.writeUInt32LE(png.length, 8);
  entrada.writeUInt32LE(22, 12); // offset: 6 + 16
  return Buffer.concat([dir, entrada, png]);
}

async function main() {
  const favicon32 = await quadrado(32, 0.92, TRANSPARENTE);
  writeFileSync("public/favicon-32.png", favicon32);
  writeFileSync("public/favicon.ico", pngParaIco(favicon32, 32));
  writeFileSync("public/icon-192.png", await quadrado(192, 0.84, TRANSPARENTE));
  writeFileSync("public/icon-512.png", await quadrado(512, 0.84, TRANSPARENTE));
  // Safe zone do Android: a logo ocupa pouco mais da metade para nao ser
  // cortada quando o sistema recorta o icone em circulo.
  writeFileSync("public/icon-maskable-512.png", await quadrado(512, 0.58, FUNDO_OPACO));
  writeFileSync("public/apple-icon.png", await quadrado(180, 0.8, FUNDO_OPACO));
  console.log("icones gerados");
}

main().then(() => verificar());

/** Le de volta o que foi escrito. Gerar sem conferir nao e conserto. */
async function verificar() {
  let falhas = 0;
  const cantoDe = async (buf: Buffer) => {
    const { data } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return [data[0], data[1], data[2], data[3]] as const;
  };
  for (const f of ["favicon-32.png", "icon-192.png", "icon-512.png"]) {
    const [, , , a] = await cantoDe(readFileSync("public/" + f));
    const ok = a === 0;
    if (!ok) falhas++;
    console.log(`${ok ? "ok" : "FALHOU"} ${f}: canto alpha=${a} (espera 0 = transparente)`);
  }
  for (const f of ["apple-icon.png", "icon-maskable-512.png"]) {
    const [r, g, b, a] = await cantoDe(readFileSync("public/" + f));
    const ok = a === 255 && r === 0x0f && g === 0x16 && b === 0x21;
    if (!ok) falhas++;
    console.log(`${ok ? "ok" : "FALHOU"} ${f}: canto rgba=${r},${g},${b},${a} (espera 15,22,33,255)`);
  }
  // O .ico: cabecalho valido e o PNG de dentro transparente.
  const ico = readFileSync("public/favicon.ico");
  const cabecalhoOk = ico.readUInt16LE(0) === 0 && ico.readUInt16LE(2) === 1 && ico.readUInt16LE(4) === 1;
  const lado = ico.readUInt8(6);
  const offset = ico.readUInt32LE(18);
  const tamanho = ico.readUInt32LE(14);
  const interno = ico.subarray(offset, offset + tamanho);
  const [, , , alphaIco] = await cantoDe(interno);
  const icoOk = cabecalhoOk && lado === 32 && alphaIco === 0 && offset + tamanho === ico.length;
  if (!icoOk) falhas++;
  console.log(`${icoOk ? "ok" : "FALHOU"} favicon.ico: lado=${lado} canto alpha=${alphaIco} bytes=${ico.length}`);
  console.log(falhas === 0 ? "icones: OK" : `icones: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}
