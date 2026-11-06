/**
 * ACOPLAMENTOS DE LAYOUT — os dois que nenhum vigia pegava (handoff 06/11/2026).
 *
 * 1. `h-16` VIVE EM DOIS ARQUIVOS. A regua horizontal da barra lateral (bloco
 *    da logo) e a da barra superior tem de cair no MESMO y, senao o botao de
 *    recolher sai do cruzamento das linhas. Trocar a altura num arquivo so nao
 *    quebra nada e nao avisa ninguem — ate alguem olhar e ver torto.
 *
 * 2. `overflow-x` E O BREAKPOINT `lg` TEM DE VIRAR JUNTOS. `overflow-x: hidden`
 *    faz o navegador computar `overflow-y: auto`, e isso transforma html/body
 *    em CONTEINER DE ROLAGEM — a partir dai `position: sticky` em qualquer
 *    descendente deixa de grudar. Foi esse o bug da barra lateral rolando junto
 *    e parando por cima do conteudo. O guard existe para o celular e precisa
 *    acabar exatamente onde a barra troca de `fixed` para `sticky`.
 *
 * Le os arquivos e compara os numeros. Nao desenha nada, nao abre navegador e
 * nao substitui os olhos — mas pega a troca de um lado so, que e o que
 * acontece de verdade.
 *
 * Rode com: npx tsx scripts/checks/layout-acoplamentos.ts
 */
import { readFileSync } from "node:fs";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe = "") {
  console.log(`${ok ? "ok" : "FALHOU"} ${nome}`);
  if (!ok) {
    falhas++;
    if (detalhe) console.log(`  ${detalhe}`);
  }
}

const SIDEBAR = "src/app/(dashboard)/sidebar.tsx";
const BARRA = "src/app/(dashboard)/barra-superior.tsx";
const CSS = "src/app/globals.css";
const TW = "tailwind.config.ts";

const sidebar = readFileSync(SIDEBAR, "utf8");
const barra = readFileSync(BARRA, "utf8");
const css = readFileSync(CSS, "utf8");
const tw = readFileSync(TW, "utf8");

// --- 1. As duas reguas na mesma altura -------------------------------------

/**
 * A altura da faixa de cabecalho de um arquivo: a classe `h-N` da linha que
 * tem `shrink-0` E `border-b`. E assim que as duas faixas sao escritas nos
 * dois arquivos, e e a borda de baixo que desenha a regua.
 */
function alturaDaFaixa(src: string): string | null {
  for (const linha of src.split("\n")) {
    if (!linha.includes("shrink-0") || !linha.includes("border-b")) continue;
    const m = linha.match(/\bh-(\d+)\b/);
    if (m) return m[1];
  }
  return null;
}

const hSidebar = alturaDaFaixa(sidebar);
const hBarra = alturaDaFaixa(barra);

check("barra lateral tem faixa com altura e borda embaixo", hSidebar !== null, SIDEBAR);
check("barra superior tem faixa com altura e borda embaixo", hBarra !== null, BARRA);
check(
  "as duas reguas horizontais tem a MESMA altura",
  hSidebar !== null && hSidebar === hBarra,
  `sidebar h-${hSidebar} vs barra superior h-${hBarra} — o botao de recolher sai do cruzamento das linhas`,
);

// --- 2. O guard de overflow e o breakpoint no mesmo ponto -------------------

// `lg` do Tailwind e 1024px por padrao. O config daqui so mexe em `screens`
// dentro de `container`, que NAO e breakpoint — mas se alguem redefinir `lg`,
// os dois lados descasam sem que uma linha de CSS mude.
check(
  "tailwind nao redefine o breakpoint lg",
  !/["']?lg["']?\s*:\s*["'][\d.]+(px|rem)["']/.test(tw),
  `${TW}: um lg diferente de 1024px descasa o globals.css da barra lateral`,
);

const media = css.match(/@media\s*\(min-width:\s*(\d+)px\)\s*\{[^}]*overflow-x:\s*visible/);
check(
  "globals.css devolve o overflow-x em 1024px",
  media?.[1] === "1024",
  media
    ? `${CSS}: media query em ${media[1]}px, esperado 1024px`
    : `${CSS}: nao achei o @media que devolve overflow-x: visible`,
);
check(
  "barra lateral vira sticky no lg",
  sidebar.includes("lg:sticky"),
  `${SIDEBAR}: sem lg:sticky a troca fixed->sticky mudou de lugar; o guard do globals.css tem de acompanhar`,
);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("\nlayout-acoplamentos: todas as checagens passaram.");
