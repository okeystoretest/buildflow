// Checagem dos helpers puros de src/lib/utils.ts.
// Rodar com: npx tsx scripts/checks/utils.ts
import { shortName } from "../../src/lib/utils";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// --- shortName: primeiro + segundo nome, para caber no card ---
check("dois nomes", shortName("Ana Paula"), "Ana Paula");
check("tres nomes", shortName("Ana Paula Rodrigues"), "Ana Paula");
check("nome composto longo", shortName("Maria Fernanda Souza Lima"), "Maria Fernanda");
check("nome unico", shortName("Ana"), "Ana");

// Particulas (de/da/do/dos/das/e) NAO contam como o segundo nome. Pegar os dois
// primeiros pedacos literalmente devolveria "Maria da", que le como nome
// cortado no meio — o oposto do objetivo. Pulamos a particula e levamos o
// sobrenome seguinte.
check("particula da", shortName("Maria da Silva Souza"), "Maria Silva");
check("particula de", shortName("Ana de Souza Lima"), "Ana Souza");
check("particula dos", shortName("Joao dos Santos Pereira"), "Joao Santos");
check("particula e", shortName("Rita e Souza Alves"), "Rita Souza");
// Particula no fim, sem sobrenome depois: devolve so o primeiro nome, em vez
// de terminar a exibicao numa preposicao solta.
check("so particula depois", shortName("Maria de"), "Maria");

// --- Entradas sujas nao podem quebrar o card ---
check("espacos extras", shortName("  Ana   Paula   Rodrigues "), "Ana Paula");
check("vazio", shortName(""), "");
check("so espacos", shortName("   "), "");

console.log(falhas === 0 ? "OK: utils" : `${falhas} falha(s) em utils`);
