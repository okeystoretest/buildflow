// Checagem das guardas das imagens da LP de atacado.
// Rodar com: npx tsx scripts/checks/lp-assets.ts
//
// O QUE ESTA EM JOGO: estas funcoes decidem o que a rota de leitura PUBLICA
// (/api/lp) consegue servir. Se o caminho escapar de <UPLOAD_DIR>/atacado, um
// visitante sem sessao le comprovante de pagamento, nota fiscal e comprovante
// de entrega — tudo que /api/uploads protege de proposito. A travessia de
// caminho e a falha que esta rota mais convida, e e barrada em duas camadas:
// primeiro o texto (ehCaminhoDeImagemDaLp), depois o sistema de arquivos
// (caminhoAbsolutoDaLp, que canonicaliza).
import path from "path";
import {
  LUGARES_DE_IMAGEM,
  MAX_ALT,
  caminhoAbsolutoDaLp,
  ehCaminhoDeImagemDaLp,
  ehLugarDeImagem,
  normalizarManifesto,
  urlPublicaDaImagem,
} from "../../src/lib/lp-assets";

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
const bom = "atacado/okey/2026/10/hero_7b1c.webp";
check("caminho valido aceito", ehCaminhoDeImagemDaLp(bom), true);

const ruins: [string, unknown][] = [
  ["fora da pasta publica", "comprovantes/2026/10/nota.webp"],
  ["travessia com .. no meio", "atacado/../comprovantes/x.webp"],
  ["travessia no fim", "atacado/okey/../../x.webp"],
  ["segmento vazio", "atacado//x.webp"],
  ["ponto como segmento", "atacado/./x.webp"],
  ["absoluto", "/atacado/okey/x.webp"],
  ["barra invertida (Windows)", "atacado\\okey\\x.webp"],
  ["byte nulo", "atacado/okey/x.webp\0.png"],
  ["extensao nao servida", "atacado/okey/x.pdf"],
  ["sem extensao", "atacado/okey/x"],
  ["pdf disfarcado no nome", "atacado/okey/x.webp.pdf"],
  ["prefixo parecido", "atacadox/okey/x.webp"],
  ["vazio", ""],
  ["nao string", 42],
  ["nulo", null],
  ["longo demais", `atacado/okey/${"a".repeat(400)}.webp`],
];
for (const [nome, valor] of ruins) {
  check(`caminho recusado: ${nome}`, ehCaminhoDeImagemDaLp(valor), false);
}

// --- canonicalizacao: a segunda barreira -----------------------------------
// MEDIDO, nao afirmado: desligando a camada de TEXTO (o filtro de segmento em
// ehCaminhoDeImagemDaLp) e rodando esta checagem, as travessias de verdade
// ("atacado/../comprovantes/x.webp" e "atacado/okey/../../x.webp") continuaram
// recusadas aqui — so "atacado//x.webp" e "atacado/./x.webp" passaram, e esses
// dois resolvem para dentro da propria pasta publica. Ou seja: as duas camadas
// sao de fato independentes, e a de baixo pega o caso que importa.
const absoluto = caminhoAbsolutoDaLp(bom);
check("caminho valido resolve para dentro da pasta publica", typeof absoluto === "string", true);
if (absoluto) {
  const raiz = path.resolve(process.env.UPLOAD_DIR ?? "./uploads", "atacado");
  check("o absoluto fica sob <UPLOAD_DIR>/atacado", absoluto.startsWith(raiz + path.sep), true);
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
    "motivo-1": { arquivo: "atacado/../x.webp", alt: "mau" },
  }),
  { hero: { arquivo: bom, alt: "ok" } },
);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("lp-assets: todas as checagens passaram.");
