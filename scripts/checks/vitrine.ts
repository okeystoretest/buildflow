/**
 * Checagem da leitura da Vitrine.
 *
 * O VOCABULÁRIO VEM DO OUTRO REPOSITÓRIO, igual ao cronograma: `VideoKind` e
 * `FileKind` são definidos no Build.Connect e esta tela só os traduz. O dia em
 * que alguém criar um tipo novo lá, um `Record` sem defesa mostraria
 * "undefined" num acervo que parece completo — ninguém reporta isso como bug,
 * só acha a tela estranha.
 *
 * O TAMANHO tem checagem própria porque é a única conta aqui, e erra de um jeito
 * que passa: "2,4 MB" e "2,4 MiB" são 400 KB diferentes e os dois parecem
 * certos. A vitrine existe para a pessoa reconhecer o arquivo que ela enviou,
 * então o número tem de bater com o que o Explorer/Finder mostrou a ela.
 *
 * Rode com: npx tsx scripts/checks/vitrine.ts
 */
import {
  dataCurta,
  resumoDoAcervo,
  rotuloDeTipoDeArquivo,
  rotuloDeTipoDeVideo,
  tamanhoLegivel,
  totalDeItens,
  vitrinesComAcervo,
} from "../../src/lib/vitrine";
import type { Vitrine } from "../../src/lib/integration/connect-vitrine";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`${ok ? "ok" : "FALHOU"} ${nome}`);
  if (!ok) {
    falhas++;
    console.log(`  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// --- rótulos: valor conhecido traduz, desconhecido cai no cru ---------------

check("tipo de vídeo conhecido traduz", rotuloDeTipoDeVideo("WORKSHOP"), "Workshop");
check("tipo de vídeo DESCONHECIDO cai no cru", rotuloDeTipoDeVideo("PODCAST"), "PODCAST");
check("tipo de arquivo conhecido traduz", rotuloDeTipoDeArquivo("XLSX"), "Excel");
check("tipo de arquivo DESCONHECIDO cai no cru", rotuloDeTipoDeArquivo("SVG"), "SVG");
check("rótulo de string vazia é vazio", rotuloDeTipoDeArquivo(""), "");

// --- tamanho ----------------------------------------------------------------

check("zero bytes", tamanhoLegivel(0), "0 B");
check("abaixo de 1 kB fica em bytes", tamanhoLegivel(999), "999 B");
check("1000 bytes viram 1,0 kB (base 1000, como o Explorer)", tamanhoLegivel(1000), "1,0 kB");
check("2,4 MB", tamanhoLegivel(2_400_000), "2,4 MB");
check("abaixo de 10 leva uma casa", tamanhoLegivel(9_800_000), "9,8 MB");
check("de 10 para cima não leva casa", tamanhoLegivel(412_700_000), "413 MB");
check("sobe até GB", tamanhoLegivel(3_200_000_000), "3,2 GB");
// Vem de outro serviço: não pode virar "NaN B" na tela.
check("valor negativo não é exibido", tamanhoLegivel(-1), "");
check("NaN não é exibido", tamanhoLegivel(Number.NaN), "");
check("Infinity não é exibido", tamanhoLegivel(Number.POSITIVE_INFINITY), "");

// --- data -------------------------------------------------------------------

check("ISO vira data curta em UTC", dataCurta("2026-11-06T23:40:00.000Z"), "06/11/2026");
check("data ilegível vira vazio", dataCurta("nao-e-data"), "");

// --- resumo e filtro de vazias ---------------------------------------------

function vitrine(fotos: number, videos: number, documentos: number, slug = "v"): Vitrine {
  return {
    slug,
    label: `Vitrine ${slug}`,
    setor: "Marketing",
    fotos: Array.from({ length: fotos }, (_, i) => ({
      id: `f${i}`,
      title: `foto ${i}`,
      createdAt: "2026-11-06T00:00:00.000Z",
    })),
    videos: Array.from({ length: videos }, (_, i) => ({
      id: `v${i}`,
      title: `video ${i}`,
      kind: "VIDEO",
      isNew: false,
      tags: [],
      createdAt: "2026-11-06T00:00:00.000Z",
    })),
    documentos: Array.from({ length: documentos }, (_, i) => ({
      id: `d${i}`,
      name: `doc ${i}`,
      kind: "PDF",
      sizeBytes: 1000,
      tags: [],
      createdAt: "2026-11-06T00:00:00.000Z",
    })),
    truncado: false,
  };
}

check("total soma os três tipos", totalDeItens(vitrine(12, 3, 1)), 16);
check("resumo com os três", resumoDoAcervo(vitrine(12, 3, 2)), "12 fotos · 3 vídeos · 2 documentos");
// "1 fotos" faz a pessoa duvidar do resto dos números da tela.
check("singular de cada tipo", resumoDoAcervo(vitrine(1, 1, 1)), "1 foto · 1 vídeo · 1 documento");
check("tipo com zero item é OMITIDO", resumoDoAcervo(vitrine(0, 4, 0)), "4 vídeos");
check("vitrine vazia tem resumo vazio", resumoDoAcervo(vitrine(0, 0, 0)), "");

// Card vazio é pior que card ausente: a pessoa clica, não acha nada e conclui
// que a tela quebrou.
check(
  "vitrine sem acervo sai da lista",
  vitrinesComAcervo([vitrine(0, 0, 0, "vazia"), vitrine(1, 0, 0, "cheia")]).map((v) => v.slug),
  ["cheia"],
);
check(
  "a ordem do Connect é preservada, não reordenada",
  vitrinesComAcervo([vitrine(1, 0, 0, "b"), vitrine(0, 0, 1, "a")]).map((v) => v.slug),
  ["b", "a"],
);
check("lista vazia não quebra", vitrinesComAcervo([]), []);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("vitrine: todas as checagens passaram.");
