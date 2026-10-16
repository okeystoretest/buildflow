// Checagem da validacao de comprovante recebido como data-URL base64.
// Rodar com: npx tsx scripts/checks/upload-validation.ts
//
// O que esta em jogo: o `accept=` do <input> e o MIME do data-URL sao
// declarados por quem envia, e o que escapa daqui vai parar no parser do
// sharp. Um SVG que passe desta porta e entregue ao librsvg — foi exatamente
// o caminho que a auditoria de 08/10/2026 encontrou (CVE-2026-96889).
// Os magic bytes sao a unica checagem que nao se pode mentir.
import sharp from "sharp";
import { validateUploadDataUrl, MAX_UPLOAD_MB } from "../../src/lib/image";

let falhas = 0;
function check(nome: string, dataUrl: string, buffer: Buffer, esperado: "aceita" | "recusa") {
  const erro = validateUploadDataUrl(dataUrl, buffer);
  const obtido = erro === null ? "aceita" : "recusa";
  if (obtido !== esperado) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${esperado}\n  obtido  =${obtido}${erro ? ` (${erro})` : ""}`);
  }
}

const quadrado = { create: { width: 8, height: 8, channels: 3 as const, background: "red" } };

async function main() {
  const png = await sharp(quadrado).png().toBuffer();
  const jpeg = await sharp(quadrado).jpeg().toBuffer();
  const webp = await sharp(quadrado).webp().toBuffer();
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>',
  );
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(64, 0x20)]);
  const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt ")]);

  // --- o caminho que a auditoria fechou ---
  check("SVG declarado como SVG", "data:image/svg+xml;base64,", svg, "recusa");
  check("SVG com MIME mentiroso (declara PNG)", "data:image/png;base64,", svg, "recusa");
  check("SVG sem prefixo data:", "", svg, "recusa");

  // --- o que precisa seguir funcionando ---
  check("PNG real", "data:image/png;base64,", png, "aceita");
  check("JPEG real", "data:image/jpeg;base64,", jpeg, "aceita");
  check("WebP real", "data:image/webp;base64,", webp, "aceita");
  check("PDF real", "data:application/pdf;base64,", pdf, "aceita");
  // Nem todo chamador manda o prefixo; a assinatura e que decide.
  check("PNG em base64 cru, sem data:", "", png, "aceita");

  // --- bordas ---
  // RIFF sozinho e container de WAV e AVI tambem: sem o segundo marcador
  // "WEBP" um audio passaria por imagem.
  check("WAV disfarcado de WebP", "data:image/webp;base64,", wav, "recusa");
  // O MIME declarado e que roteia entre saveDocument e o sharp: divergir dele
  // manda o arquivo para o processador errado.
  check("PDF declarado como imagem", "data:image/png;base64,", pdf, "recusa");
  check("imagem declarada como PDF", "data:application/pdf;base64,", png, "recusa");
  check("buffer vazio", "data:image/png;base64,", Buffer.alloc(0), "recusa");
  check(
    `acima do limite de ${MAX_UPLOAD_MB}MB`,
    "data:image/png;base64,",
    Buffer.concat([png, Buffer.alloc((MAX_UPLOAD_MB + 1) * 1024 * 1024)]),
    "recusa",
  );

  if (falhas > 0) {
    console.log(`\n${falhas} checagem(ns) falharam.`);
    process.exit(1);
  }
  console.log("upload-validation: todas as checagens passaram.");
}

main();
