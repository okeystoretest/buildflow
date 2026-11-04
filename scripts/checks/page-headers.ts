/**
 * Checagem dos cabecalhos das ferramentas.
 *
 * A regra e: TODA ferramenta do menu abre uma tela com titulo e descricao.
 * Sem isto, a tela nova nasce sem descricao, ninguem nota na revisao, e a
 * padronizacao se perde uma tela por vez.
 *
 * A checagem e textual de proposito — ler o arquivo e mais barato e mais
 * estavel do que renderizar a pagina so para conferir duas linhas.
 *
 * Rode com: npx tsx scripts/checks/page-headers.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { NAV } from "../../src/app/(dashboard)/nav";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe = "") {
  console.log(`${ok ? "ok" : "FALHOU"} ${nome}`);
  if (!ok) {
    falhas++;
    if (detalhe) console.log(`  ${detalhe}`);
  }
}

const BASE = "src/app/(dashboard)";

/** O arquivo que desenha a rota, considerando segmento dinamico. */
function arquivoDaRota(href: string): string | null {
  const direto = `${BASE}${href === "/" ? "" : href}/page.tsx`;
  if (existsSync(direto)) return direto;
  // Rota servida por um segmento dinamico (ex.: ferramentas/[tool]).
  const partes = href.split("/").filter(Boolean);
  for (let i = partes.length - 1; i >= 0; i--) {
    const alt = `${BASE}/${[...partes.slice(0, i), `[${"tool"}]`].join("/")}/page.tsx`;
    if (existsSync(alt)) return alt;
  }
  return null;
}

/**
 * Titulo + descricao: via <PageHeader> (o caminho padrao) ou escritos a mao
 * como <h1> seguido de um <p> de apoio. As telas que montam o titulo com
 * icone ainda usam a segunda forma, e elas cumprem a regra do mesmo jeito.
 */
function temCabecalho(src: string): { titulo: boolean; descricao: boolean } {
  const pageHeader = /<PageHeader[\s\S]*?descricao=/.test(src);
  if (pageHeader) return { titulo: true, descricao: true };
  const titulo = /<h1[\s>]/.test(src);
  const descricao = /<p className="[^"]*text-sm[^"]*text-muted-foreground[^"]*">/.test(src);
  return { titulo, descricao };
}

const vistos = new Set<string>();
for (const m of NAV) {
  for (const t of m.tools) {
    if (vistos.has(t.href)) continue;
    vistos.add(t.href);
    const arq = arquivoDaRota(t.href);
    if (!arq) {
      check(`${t.label}: a rota ${t.href} existe`, false, "nenhum page.tsx encontrado");
      continue;
    }
    const src = readFileSync(arq, "utf8");
    const { titulo, descricao } = temCabecalho(src);
    check(`${t.label}: tem titulo`, titulo, arq);
    check(`${t.label}: tem descricao`, descricao, arq);
  }
}

console.log(`\n${vistos.size} ferramentas verificadas.`);
if (falhas > 0) {
  console.log(`${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("page-headers: todas as checagens passaram.");
