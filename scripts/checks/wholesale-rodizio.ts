/**
 * Checagem do rodízio das candidaturas do link geral.
 *
 * Confere a CONTA e as FRONTEIRAS, que é o que decide de quem é o lead. Um erro
 * de sinal aqui tira a candidatura de quem está dentro do prazo; um erro de
 * módulo devolve `undefined` e a atribuição falha em silêncio, com a lojista já
 * tendo preenchido tudo.
 *
 * Rode com: npx tsx scripts/checks/wholesale-rodizio.ts
 */
import {
  RODIZIO_PASSO_MS,
  voltasDoRodizio,
  donaDoRodizio,
} from "../../src/lib/wholesale-rodizio";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`${ok ? "ok" : "FALHOU"} ${nome}`);
  if (!ok) {
    falhas++;
    console.log(`  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const chegada = new Date("2026-10-17T10:00:00.000Z");
const depois = (ms: number) => new Date(chegada.getTime() + ms);

check("o passo e de 24h", RODIZIO_PASSO_MS, 86_400_000);

// --- a fronteira do dia, que e o coracao da regra ---------------------------
// As 23h59 do primeiro dia a candidatura AINDA e da primeira vendedora: o dia
// prometido nao se completou. Arredondar para cima tiraria o lead das maos de
// quem esta dentro do prazo.
check("no instante da chegada: 0 voltas", voltasDoRodizio(chegada, chegada), 0);
check("1 ms antes de completar 1 dia: 0 voltas", voltasDoRodizio(chegada, depois(RODIZIO_PASSO_MS - 1)), 0);
check("exatamente 1 dia: 1 volta", voltasDoRodizio(chegada, depois(RODIZIO_PASSO_MS)), 1);
check("1 ms depois de 1 dia: 1 volta", voltasDoRodizio(chegada, depois(RODIZIO_PASSO_MS + 1)), 1);
check("2 dias: 2 voltas", voltasDoRodizio(chegada, depois(2 * RODIZIO_PASSO_MS)), 2);
check("30 dias: 30 voltas", voltasDoRodizio(chegada, depois(30 * RODIZIO_PASSO_MS)), 30);

// Relogio torto (createdAt no futuro) nao pode virar volta negativa: no
// JavaScript um indice negativo devolve `undefined` e a atribuicao morre calada.
check("chegada no futuro: 0 voltas, nunca negativo", voltasDoRodizio(depois(RODIZIO_PASSO_MS), chegada), 0);
check("data invalida: 0 voltas", voltasDoRodizio(new Date(NaN), chegada), 0);

// --- de quem e a candidatura ------------------------------------------------
const ativas = ["ana", "bia", "cris"] as const;

check("indice 0, dia 0 -> a primeira", donaDoRodizio(0, 0, ativas), "ana");
check("indice 0, dia 1 -> a seguinte", donaDoRodizio(0, 1, ativas), "bia");
check("indice 0, dia 2 -> a terceira", donaDoRodizio(0, 2, ativas), "cris");
// Sem teto de voltas (decisao do dono): depois de passar por todas, recomeca.
check("indice 0, dia 3 -> volta para a primeira", donaDoRodizio(0, 3, ativas), "ana");
check("indice 0, dia 300 -> continua rodando", donaDoRodizio(0, 300, ativas), "ana");

// Candidaturas que chegam em sequencia caem em vendedoras diferentes: e isto
// que a SEQUENCE do banco garante, e o motivo de o indice existir.
check("tres chegadas seguidas no mesmo dia nao repetem a dona", [
  donaDoRodizio(0, 0, ativas),
  donaDoRodizio(1, 0, ativas),
  donaDoRodizio(2, 0, ativas),
], ["ana", "bia", "cris"]);
check("a quarta chegada recomeca o ciclo", donaDoRodizio(3, 0, ativas), "ana");

// Indice grande (a SEQUENCE nao reinicia) continua dando volta certa.
check("indice 1000, dia 0", donaDoRodizio(1000, 0, ativas), ativas[1000 % 3]);

// --- os casos de borda que derrubam em producao -----------------------------
check("sem vendedora ativa: null, nao erro", donaDoRodizio(0, 5, []), null);
check("uma vendedora so: sempre ela", donaDoRodizio(7, 99, ["ana"]), "ana");
// Soma negativa nao pode devolver undefined. `%` de negativo e negativo no
// JavaScript, e array[-1] e undefined — que viraria sellerId undefined.
check("soma negativa nao devolve undefined", donaDoRodizio(-5, 0, ativas) !== undefined, true);
check("soma negativa cai dentro do array", ativas.includes(donaDoRodizio(-5, 0, ativas) as never), true);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-rodizio: todas as checagens passaram.");
