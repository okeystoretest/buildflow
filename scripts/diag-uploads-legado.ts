/**
 * DIAGNOSTICO — quanto caminho LEGADO "/uploads/..." ainda existe no banco.
 * SOMENTE LEITURA. Nao grava, nao apaga, nao migra.
 *
 *   DATABASE_URL="..." npx tsx scripts/diag-uploads-legado.ts
 *
 * POR QUE ELE EXISTE
 *
 * Havia a suspeita de que "/uploads" tinha "dois mecanismos, um morto". Nao
 * tem: a reescrita do next.config ("/uploads/:path*" -> "/api/uploads/:path*")
 * ALIMENTA a rota autenticada — e um adaptador para os caminhos gravados no
 * banco antes de 16/10/2026, nao um rival dela. Testado com sessao valida:
 * "/uploads/<inexistente>" responde "Nao encontrado." 404 da propria rota, e
 * nao 307 para /login nem 404 do Next.
 *
 * Entao a pergunta nao e "qual dos dois esta morto", e sim: AINDA EXISTE
 * caminho legado no banco? Voltar 0 em tudo = a reescrita virou decoracao e
 * pode sair. Qualquer numero > 0 = remover a reescrita transforma exatamente
 * esses arquivos (comprovante, nota fiscal, foto de candidatura) em 404
 * silencioso.
 *
 * Arquivo novo nasce com base "/api/uploads" (NEXT_PUBLIC_UPLOAD_BASE_URL),
 * entao o numero legado so pode diminuir, nunca crescer.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const LEGADO = "/uploads";

type Delegate = { count: (a: unknown) => Promise<number> };

const CAMPOS: {
  rotulo: string;
  conta: () => Promise<{ legado: number; preenchidos: number | null }>;
}[] = [];

function registrar(rotulo: string, delegate: Delegate, campo: string) {
  CAMPOS.push({
    rotulo,
    // AS DUAS CONTAGENS SAO INDEPENDENTES de proposito. Campo obrigatorio
    // (String sem "?") recusa `NOT: null`, e com as duas no mesmo await um erro
    // em "preenchidos" levava embora o "legado" — que e o numero que decide.
    // A primeira versao deste script dizia "0, pode remover" para seis campos
    // cujo legado ele nunca chegou a contar.
    conta: async () => {
      const legado = await delegate.count({ where: { [campo]: { startsWith: LEGADO } } });
      let preenchidos: number | null = null;
      try {
        preenchidos = await delegate.count({ where: { NOT: { [campo]: null } } });
      } catch {
        // Campo obrigatorio: todo registro tem valor, entao preenchidos = total.
        try {
          preenchidos = await delegate.count({});
        } catch {
          preenchidos = null;
        }
      }
      return { legado, preenchidos };
    },
  });
}

const p = prisma as unknown as Record<string, Delegate>;
registrar("Order.paymentProofPath", p.order, "paymentProofPath");
registrar("Order.paymentProof2Path", p.order, "paymentProof2Path");
registrar("Order.invoicePath", p.order, "invoicePath");
registrar("OrderPaymentProof.filePath", p.orderPaymentProof, "filePath");
registrar("OrderFinanceProof.filePath", p.orderFinanceProof, "filePath");
registrar("Proof.filePath", p.proof, "filePath");
registrar("TransportRequest.proofPath", p.transportRequest, "proofPath");
registrar("TransportImage.filePath", p.transportImage, "filePath");
registrar("SelectPayment.proofPath", p.selectPayment, "proofPath");
registrar("WholesaleLead.instagramImagePath", p.wholesaleLead, "instagramImagePath");
registrar("WholesaleLead.storeImagePath", p.wholesaleLead, "storeImagePath");

async function main() {
  console.log(`Caminhos que comecam com "${LEGADO}" (legado) x caminhos preenchidos:\n`);
  let totalLegado = 0;
  let desconhecidos = 0;

  for (const c of CAMPOS) {
    try {
      const { legado, preenchidos } = await c.conta();
      totalLegado += legado;
      const pre = preenchidos === null ? "     ?" : String(preenchidos).padStart(6);
      const marca = legado > 0 ? "  <== LEGADO" : "";
      console.log(
        `  ${c.rotulo.padEnd(34)} legado=${String(legado).padStart(5)}  preenchidos=${pre}${marca}`,
      );
    } catch (e) {
      // Chegar aqui significa que nem o `startsWith` rodou: o legado deste
      // campo e DESCONHECIDO, nao zero. Contado para nao virar silencio.
      desconhecidos++;
      const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
      console.log(`  ${c.rotulo.padEnd(34)} ERRO (legado DESCONHECIDO): ${msg}`);
    }
  }

  console.log(`\nTOTAL legado contado: ${totalLegado}`);
  if (desconhecidos > 0) {
    console.log(
      `INCONCLUSIVO: ${desconhecidos} campo(s) nao puderam ser contados.\n` +
        'NAO remova a reescrita com base neste resultado — "0" aqui nao prova ausencia.',
    );
  } else if (totalLegado === 0) {
    console.log(
      'Nenhum caminho legado. A reescrita de "/uploads" no next.config pode sair\n' +
        "com seguranca — mas confirme antes que este banco e o de PRODUCAO.",
    );
  } else {
    console.log(
      `${totalLegado} arquivo(s) dependem da reescrita de "/uploads". NAO remova a\n` +
        "reescrita: cada um deles viraria 404 silencioso.",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
