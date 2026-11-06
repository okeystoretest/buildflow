/**
 * Checagem dos cabecalhos das ferramentas.
 *
 * A regra nao mudou: TODA ferramenta do menu abre uma tela com titulo e
 * descricao. O LUGAR mudou (06/11/2026). Antes cada pagina desenhava o proprio
 * `<PageHeader>` e esta checagem lia o arquivo da rota atras das duas linhas;
 * hoje quem desenha e a barra superior do layout, lendo o `NAV`.
 *
 * Por isso a checagem ficou mais curta E mais forte: em vez de procurar texto
 * em 21 arquivos, ela confere a unica fonte. O titulo nem precisa ser
 * verificado — `label` e obrigatorio no tipo, entao ferramenta sem titulo nao
 * compila. Sobra a descricao, que e opcional no tipo (rota que nao e
 * ferramenta de menu nao tem) e por isso precisa de vigia aqui.
 *
 * Confere tambem que a rota EXISTE: um `href` para uma pagina que nao existe
 * e um item de menu que leva a 404, e isso o TypeScript nao pega.
 *
 * Rode com: npx tsx scripts/checks/page-headers.ts
 */
import { existsSync } from "node:fs";
import { NAV, cabecalhoDaRota } from "../../src/app/(dashboard)/nav";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe = "") {
  console.log(`${ok ? "ok" : "FALHOU"} ${nome}`);
  if (!ok) {
    falhas++;
    if (detalhe) console.log(`  ${detalhe}`);
  }
}

const BASE = "src/app/(dashboard)";

/** O arquivo que desenha a rota. `null` quando nao existe. */
function arquivoDaRota(href: string): string | null {
  const direto = `${BASE}${href === "/" ? "" : href}/page.tsx`;
  if (existsSync(direto)) return direto;
  // Segmento dinamico: /financeiro/ferramentas/status -> .../[tool]/page.tsx
  const partes = href.split("/").filter(Boolean);
  for (let i = partes.length - 1; i >= 0; i--) {
    const pasta = `${BASE}/${partes.slice(0, i).join("/")}`;
    for (const din of ["[tool]", "[id]", "[slug]"]) {
      const alvo = `${pasta}/${din}/page.tsx`.replace("//", "/");
      if (existsSync(alvo)) return alvo;
    }
  }
  return null;
}

const vistos = new Set<string>();
for (const m of NAV) {
  for (const t of m.tools) {
    if (vistos.has(t.href)) continue;
    vistos.add(t.href);

    check(`${t.label}: a rota ${t.href} existe`, arquivoDaRota(t.href) !== null, "nenhum page.tsx encontrado");
    check(`${t.label}: tem descricao no NAV`, Boolean(t.descricao?.trim()), t.href);

    // A barra le pelo prefixo MAIS LONGO. Se a arbitragem errar, a tela mostra
    // o titulo de outra ferramenta — defeito invisivel no codigo e obvio na
    // tela, que e exatamente o que escapa da revisao.
    const cab = cabecalhoDaRota(t.href, NAV);
    check(`${t.label}: a barra resolve o titulo certo`, cab?.titulo === t.label, `barra diz "${cab?.titulo}"`);
    check(`${t.label}: a barra mostra o setor "${m.label}"`, cab?.trilha === m.label, `barra diz "${cab?.trilha}"`);
  }
}

// Modulo de tela unica (Rank, Fluxo) e pagina tambem: precisa de descricao, e
// NAO deve mostrar trilha — "Rank de Vendas · Rank de Vendas" e ruido.
for (const m of NAV.filter((x) => x.tools.length === 0)) {
  check(`${m.label}: tela unica tem descricao`, Boolean(m.descricao?.trim()), m.base);
  const cab = cabecalhoDaRota(m.base, NAV);
  check(`${m.label}: tela unica nao repete o nome na trilha`, cab?.trilha === null, `trilha="${cab?.trilha}"`);
}

// Rota fora do NAV devolve o titulo do MODULO, nunca vazio: "Comercial" acima
// de uma tela de edicao e menos errado que um cabecalho em branco.
const detalhe = cabecalhoDaRota("/vendas/abc123/editar", NAV);
check("rota de detalhe cai no titulo do modulo", detalhe?.titulo === "Comercial", `titulo="${detalhe?.titulo}"`);
check("rota de detalhe nao inventa descricao", detalhe?.descricao === null, `descricao="${detalhe?.descricao}"`);
// "COMERCIAL" em cima de "Comercial" e o mesmo texto duas vezes: quando o
// titulo cai no modulo, nao ha nivel acima para mostrar.
check("rota de detalhe nao repete o nome na trilha", detalhe?.trilha === null, `trilha="${detalhe?.trilha}"`);
const formulario = cabecalhoDaRota("/vendas/novo", NAV);
check("formulario fora do menu nao repete o nome", formulario?.trilha === null, `trilha="${formulario?.trilha}"`);
check("rota fora do painel nao tem cabecalho", cabecalhoDaRota("/qualquer-coisa", NAV) === null);

console.log(`\n${vistos.size} ferramentas verificadas.`);
if (falhas > 0) {
  console.log(`${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("page-headers: todas as checagens passaram.");
