// Checagem das guardas das imagens da LP de atacado.
// Rodar com: npx tsx scripts/checks/lp-assets.ts
//
// O QUE ESTA EM JOGO: estas funcoes decidem o que a rota de leitura PUBLICA
// (/api/lp) consegue servir. Se o caminho escapar de <UPLOAD_DIR>/lp-publico, um
// visitante sem sessao le comprovante de pagamento, nota fiscal e comprovante
// de entrega — tudo que /api/uploads protege de proposito. A travessia de
// caminho e a falha que esta rota mais convida, e e barrada em duas camadas:
// primeiro o texto (ehCaminhoDeImagemDaLp), depois o sistema de arquivos
// (caminhoAbsolutoDaLp, que canonicaliza).
//
// E NAO E SO ESCAPAR. Ficar DENTRO da pasta tambem era falha: enquanto a pasta
// publica se chamava "atacado", ela era a MESMA que wholesale-apply.ts usa para
// as duas fotografias de cada candidata a revenda, com a mesma extensao .webp.
// Qualquer um lia a foto da loja de uma nao-cliente sem sessao, trocando
// /api/uploads por /api/lp. O caso "caminho de lead recusado" abaixo e o que
// prende isso: ele falha se alguem reaproximar os dois namespaces.
import path from "path";
import {
  LUGARES_DE_IMAGEM,
  MAX_ALT,
  PASTA_PUBLICA,
  ehCaminhoDeImagemDaLp,
  ehLugarDeImagem,
  normalizarManifesto,
  urlPublicaDaImagem,
} from "../../src/lib/lp-assets";
import { caminhoAbsolutoDaLp } from "../../src/lib/lp-assets-server";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// --- lugares: lista fechada ------------------------------------------------
check("sao quatro lugares", LUGARES_DE_IMAGEM.length, 4);
check("os quatro lugares, por nome", [...LUGARES_DE_IMAGEM], ["hero", "motivo-1", "motivo-2", "motivo-3"]);
for (const l of LUGARES_DE_IMAGEM) check(`lugar valido: ${l}`, ehLugarDeImagem(l), true);
for (const ruim of ["hero2", "motivo-4", "", "HERO", "__proto__", "../hero", null, 7, {}]) {
  check(`lugar recusado: ${JSON.stringify(ruim)}`, ehLugarDeImagem(ruim), false);
}

// --- caminho: o que a rota publica pode servir -----------------------------
const bom = "lp-publico/okey/2026/10/hero_7b1c.webp";
check("caminho valido aceito", ehCaminhoDeImagemDaLp(bom), true);

// A pasta publica NAO pode ser a pasta onde os leads gravam. Se esta afirmacao
// ficar vermelha, alguem apontou PASTA_PUBLICA de volta para "atacado" e as
// fotografias das candidatas voltaram a ser legiveis sem sessao.
// O `as string` existe porque o tipo de PASTA_PUBLICA e o literal, e o
// compilador recusa a comparacao como "sem sobreposicao" (TS2367). A afirmacao
// e de RUNTIME de proposito: ela tem de ficar vermelha se o valor mudar.
check("a pasta publica nao e a dos leads", (PASTA_PUBLICA as string) === "atacado", false);

const ruins: [string, unknown][] = [
  ["fora da pasta publica", "comprovantes/2026/10/nota.webp"],
  // As duas fotos que wholesale-apply.ts grava, na forma exata em que grava:
  // <folder>/<ano>/<mes>/<nome>_<uuid>.webp com folder "atacado".
  ["foto de loja de candidata", "atacado/2026/10/loja_11111111-2222-3333-4444-555555555555.webp"],
  ["print de instagram de candidata", "atacado/2026/10/instagram_11111111-2222-3333-4444-555555555555.webp"],
  ["pasta antiga da marca", "atacado/okey/2026/10/hero_7b1c.webp"],
  ["travessia com .. no meio", "lp-publico/../comprovantes/x.webp"],
  ["travessia no fim", "lp-publico/okey/../../x.webp"],
  ["segmento vazio", "lp-publico//x.webp"],
  ["ponto como segmento", "lp-publico/./x.webp"],
  ["absoluto", "/lp-publico/okey/x.webp"],
  ["barra invertida (Windows)", "lp-publico\\okey\\x.webp"],
  ["byte nulo", "lp-publico/okey/x.webp\0.png"],
  ["extensao nao servida", "lp-publico/okey/x.pdf"],
  ["sem extensao", "lp-publico/okey/x"],
  ["pdf disfarcado no nome", "lp-publico/okey/x.webp.pdf"],
  ["prefixo parecido", "lp-publicox/okey/x.webp"],
  ["vazio", ""],
  ["nao string", 42],
  ["nulo", null],
  ["longo demais", `lp-publico/okey/${"a".repeat(400)}.webp`],
];
for (const [nome, valor] of ruins) {
  check(`caminho recusado: ${nome}`, ehCaminhoDeImagemDaLp(valor), false);
}

// --- canonicalizacao: a segunda barreira -----------------------------------
// MEDIDO, nao afirmado: desligando a camada de TEXTO (o filtro de segmento em
// ehCaminhoDeImagemDaLp) e rodando esta checagem, as travessias de verdade
// ("lp-publico/../comprovantes/x.webp" e "lp-publico/okey/../../x.webp")
// continuaram recusadas aqui — so "lp-publico//x.webp" e "lp-publico/./x.webp"
// passaram, e esses dois resolvem para dentro da propria pasta publica. Ou seja:
// as duas camadas sao de fato independentes, e a de baixo pega o caso que importa.
const absoluto = caminhoAbsolutoDaLp(bom);
check("caminho valido resolve para dentro da pasta publica", typeof absoluto === "string", true);
if (absoluto) {
  const raiz = path.resolve(process.env.UPLOAD_DIR ?? "./uploads", PASTA_PUBLICA);
  check("o absoluto fica sob <UPLOAD_DIR>/lp-publico", absoluto.startsWith(raiz + path.sep), true);
}
for (const [nome, valor] of ruins) {
  if (typeof valor !== "string") continue;
  check(`sem caminho absoluto para: ${nome}`, caminhoAbsolutoDaLp(valor), null);
}

check("url publica monta sobre /api/lp", urlPublicaDaImagem(bom), `/api/lp/${bom}`);

// --- manifesto: le torto sem lancar ----------------------------------------
// O arquivo pode ter sido editado a mao, truncado por queda no meio de uma
// escrita antiga, ou escrito por uma versao futura deste codigo. A pagina
// publica tem de seguir de pe mostrando o espaco reservado.
check("nao objeto vira vazio", normalizarManifesto("{}"), {});
check("nulo vira vazio", normalizarManifesto(null), {});
check("array vira vazio", normalizarManifesto([{ arquivo: bom, alt: "x" }]), {});
check("chave desconhecida e descartada", normalizarManifesto({ rodape: { arquivo: bom, alt: "x" } }), {});
check(
  "entrada com caminho invalido e descartada",
  normalizarManifesto({ hero: { arquivo: "comprovantes/x.webp", alt: "x" } }),
  {},
);
check(
  "entrada valida sobrevive",
  normalizarManifesto({ hero: { arquivo: bom, alt: "Vitrine" } }),
  { hero: { arquivo: bom, alt: "Vitrine" } },
);
check(
  "alt nao string vira vazio",
  normalizarManifesto({ hero: { arquivo: bom, alt: 7 } }),
  { hero: { arquivo: bom, alt: "" } },
);
check(
  "alt e cortado no teto",
  normalizarManifesto({ hero: { arquivo: bom, alt: "a".repeat(MAX_ALT + 50) } })?.hero?.alt?.length,
  MAX_ALT,
);
check(
  "entrada boa sobrevive ao lado de entrada ruim",
  normalizarManifesto({
    hero: { arquivo: bom, alt: "ok" },
    "motivo-1": { arquivo: "lp-publico/../x.webp", alt: "mau" },
  }),
  { hero: { arquivo: bom, alt: "ok" } },
);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("lp-assets: todas as checagens passaram.");
