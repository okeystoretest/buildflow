/**
 * PORTAO UNICO — roda todas as checagens de scripts/checks/.
 *
 * O que ele compra: achar o portao no `package.json`, e nao no YAML do CI. O
 * comentario do ci.yml ja prometia isto ("vira uma linha no dia em que existir
 * um npm run check"); agora existe, e o CI chama esta linha.
 *
 * UM PROCESSO POR CHECAGEM, e isto nao e exagero: cada script de checks/ chama
 * `process.exit` no fim. Num processo unico o PRIMEIRO exit mataria os outros
 * 40 — inclusive um `exit(0)` de sucesso.
 *
 * ABORTA NA PRIMEIRA FALHA, igual ao `bash -e` que o CI usava antes: o portao
 * mudou de lugar, nao de comportamento. Rodar as 41 para listar tudo que
 * quebrou gastaria os ~50s inteiros em todo PR vermelho, e o ganho (ver varias
 * falhas de uma vez) e do dev, que pode rodar o script que quiser direto.
 *
 * `npx` e nao `tsx` direto: assim funciona tambem fora do `npm run`, onde
 * node_modules/.bin nao esta no PATH. `shell: true` porque no Windows o
 * executavel e `npx.cmd`, que o spawn sem shell nao encontra.
 *
 *   npm run check
 */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const DIR = "scripts/checks";

// Todo .ts da pasta, igual ao laco que o CI rodava (`utils.ts` tambem e uma
// checagem de verdade — dos helpers puros de src/lib/utils.ts).
const arquivos = readdirSync(DIR)
  .filter((f) => f.endsWith(".ts"))
  .sort();

if (arquivos.length === 0) {
  console.error(`${DIR}: nenhuma checagem encontrada — o portao estaria passando vazio.`);
  process.exit(1);
}

for (const arquivo of arquivos) {
  const caminho = `${DIR}/${arquivo}`;
  console.log(`\n=== ${caminho}`);
  const r = spawnSync("npx", ["tsx", caminho], { stdio: "inherit", shell: true });
  if (r.status !== 0) {
    console.error(`\n${caminho} FALHOU (exit ${r.status}). Portao interrompido.`);
    process.exit(1);
  }
}

console.log(`\n${arquivos.length} checagens passaram.`);
