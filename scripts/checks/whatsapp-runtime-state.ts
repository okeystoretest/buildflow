// Reproduz a causa raiz do "QR nao aparece": o Next compila connection.ts em
// mais de um bundle (chunks/5259.js para a instrumentacao, chunks/3992.js para
// a Server Action), e cada bundle tem seu proprio registro de modulos. Estado
// em `let` de modulo vira N conjuntos independentes de variaveis: o boot
// conecta num, o painel le outro e nunca ve o QR.
//
// Aqui simulamos isso limpando o cache de modulos e importando de novo — uma
// instancia nova, com registro limpo, exatamente como o segundo bundle.
//
// Rodar com: npx tsx scripts/checks/whatsapp-runtime-state.ts
import { createRequire } from "node:module";

const req = createRequire(__filename);
const caminho = req.resolve("../../src/lib/whatsapp/runtime-state");

let falhas = 0;
function check(nome: string, cond: boolean) {
  if (!cond) { falhas++; console.log(`FALHOU ${nome}`); }
}

// Instancia A: escreve.
const a = req(caminho) as typeof import("../../src/lib/whatsapp/runtime-state");
const rtA = a.getRuntime();
rtA.state = "CONECTADO";
rtA.qr = "codigo-de-teste";
rtA.connectedNumber = "5511988887777";

// Instancia B: modulo recarregado do zero, como um segundo bundle.
delete req.cache[caminho];
const b = req(caminho) as typeof import("../../src/lib/whatsapp/runtime-state");
check("modulo realmente recarregado", a !== b);

const rtB = b.getRuntime();
check("estado compartilhado entre instancias", rtB.state === "CONECTADO");
check("QR compartilhado entre instancias", rtB.qr === "codigo-de-teste");
check("numero compartilhado entre instancias", rtB.connectedNumber === "5511988887777");
check("mesmo objeto de runtime", rtA === rtB);

// Escrita pela instancia B tambem e vista pela A.
rtB.state = "AGUARDANDO_QR";
check("escrita reversa visivel", a.getRuntime().state === "AGUARDANDO_QR");

console.log(falhas === 0 ? "OK: whatsapp-runtime-state" : `${falhas} falha(s) em whatsapp-runtime-state`);
process.exit(falhas === 0 ? 0 : 1);
