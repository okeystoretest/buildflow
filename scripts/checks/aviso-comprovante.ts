// Checagem do AVISO DE COMPROVANTE QUE FALHOU.
// Rodar com: npx tsx scripts/checks/aviso-comprovante.ts
//
// O que esta em jogo: a falha silenciosa VOLTAR pela porta dos fundos. O
// comprovante que nao sobe passou a avisar em tela via `?comprovanteFalhou=N`,
// mas o parametro so vira aviso na pagina que o LE. O formulario de edicao
// mandava GESTAO/FINANCEIRO para `/fluxo?comprovanteFalhou=N`, e:
//   1) /fluxo nunca leu o parametro — nenhum aviso aparecia;
//   2) /fluxo sem ?loja= abre o seletor de loja, que renavega reescrevendo a
//      query — o parametro morria ali de qualquer forma.
// Resultado: o papel que mais depende do comprovante era o unico que nunca
// sabia que ele nao subiu. `tsc`, o build e as outras checagens passavam todos,
// porque template de string valido nao e template de string correto.
//
// A INVARIANTE: todo destino que recebe `?comprovanteFalhou=` precisa ser um
// caminho LITERAL (para esta checagem poder conferir) e a page desse caminho
// precisa ler o parametro.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

let falhas = 0;
function check(nome: string, fn: () => void) {
  try {
    fn();
  } catch (e) {
    falhas++;
    console.log(`FALHOU ${nome}\n  ${e instanceof Error ? e.message : String(e)}`);
  }
}

const PARAM = "comprovanteFalhou";
const RAIZ_PAGES = "src/app/(dashboard)";

/** Todos os .ts/.tsx de src/, recursivo. */
function fontes(dir: string, fora: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) fontes(p, fora);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) fora.push(p);
  }
  return fora;
}

const arquivos = fontes("src");

// Quem EMITE: `...?comprovanteFalhou=` dentro de um template de string.
const emissores: { arquivo: string; caminho: string }[] = [];
for (const arquivo of arquivos) {
  const src = readFileSync(arquivo, "utf8");
  // Regex LITERAL e nao new RegExp(PARAM): montar a partir de string exige
  // escapar a barra duas vezes, e um nivel perdido transforma `\?` em `?`, que
  // torna o grupo opcional e engole o proprio "?" do caminho. Se o parametro
  // for renomeado, a checagem 1) acusa — nenhum emissor encontrado.
  for (const m of src.matchAll(/`([^`]*?)\?comprovanteFalhou=/g)) {
    emissores.push({ arquivo, caminho: m[1] });
  }
}

// 1) Tem que existir emissor. Sem isto a checagem passaria vazia no dia em que
//    alguem renomear o parametro e esquecer de renomear aqui.
check("existe ao menos um emissor do aviso", () => {
  if (emissores.length === 0) throw new Error(`nenhum \`?${PARAM}=\` encontrado em src/`);
});

// 2) Nenhum emissor pode montar o caminho em tempo de execucao: destino
//    variavel nao da para conferir, e foi exatamente assim que o bug entrou
//    (`${destino}?comprovanteFalhou=` escondia /fluxo).
for (const e of emissores) {
  check(`${e.arquivo}: destino e caminho literal`, () => {
    if (e.caminho.includes("${")) {
      throw new Error(`destino montado em runtime ("${e.caminho}") — use caminho literal`);
    }
    if (!e.caminho.startsWith("/")) {
      throw new Error(`destino "${e.caminho}" nao comeca com "/"`);
    }
  });
}

// 3) A page de cada destino tem que LER o parametro.
for (const e of emissores) {
  if (e.caminho.includes("${") || !e.caminho.startsWith("/")) continue;
  const page = join(RAIZ_PAGES, e.caminho, "page.tsx");
  check(`${e.caminho} le o parametro (${page})`, () => {
    let conteudo: string;
    try {
      conteudo = readFileSync(page, "utf8");
    } catch {
      throw new Error(`page nao encontrada: ${page}`);
    }
    if (!conteudo.includes(PARAM)) {
      throw new Error(
        `${page} nunca menciona "${PARAM}" — o aviso seria emitido e nunca exibido`,
      );
    }
  });
}

console.log(
  falhas === 0
    ? `OK aviso-comprovante: ${emissores.length} emissor(es), todos apontando para page que le o parametro`
    : `aviso-comprovante: ${falhas} falha(s)`,
);
process.exit(falhas === 0 ? 0 : 1);
