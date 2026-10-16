// Checagem da composição que a Server Action de decisão obedece.
// Rodar com: npx tsx scripts/checks/wholesale-decision-flow.ts
//
// O que está em jogo: a action junta duas regras puras (quem pode decidir, e
// o que o veredito grava). Esta checagem prende a ORDEM delas: permissão
// primeiro, invariante depois. Invertido, a mensagem de erro revelaria a
// existência e o estado de um lead a quem não pode vê-lo.
import { canDecideLead, resolveDecision, type WholesaleActor } from "../../src/lib/wholesale-permissions";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// Reproduz a ordem da action, sem banco.
function simular(
  actor: WholesaleActor,
  lead: { sellerId: string | null },
  entrada: { toStatus: string; rejectionCode?: string | null; cautionReason?: string | null },
) {
  if (!canDecideLead(actor, lead)) return { error: "negado" };
  const d = resolveDecision(entrada);
  if ("error" in d) return { error: d.error };
  return { gravar: { status: entrada.toStatus, ...d } };
}

const atacado: WholesaleActor = { userId: "u1", role: "VENDAS", salesModel: "ATACADO" };

check(
  "lead de outra vendedora: nega ANTES de olhar o veredito",
  simular(atacado, { sellerId: "u9" }, { toStatus: "REPROVADO" }),
  { error: "negado" },
);
check(
  "lead próprio sem código: o erro é do veredito",
  simular(atacado, { sellerId: "u1" }, { toStatus: "REPROVADO" }),
  { error: "Escolha o motivo da reprovação." },
);
check(
  "lead próprio reprovado com código: grava",
  simular(atacado, { sellerId: "u1" }, { toStatus: "REPROVADO", rejectionCode: "11" }),
  { gravar: { status: "REPROVADO", ok: true, rejectionCode: "11", cautionReason: null } },
);
check(
  "aprovar limpa o código anterior na gravação",
  simular(atacado, { sellerId: "u1" }, { toStatus: "APROVADO", rejectionCode: "11" }),
  { gravar: { status: "APROVADO", ok: true, rejectionCode: null, cautionReason: null } },
);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-decision-flow: todas as checagens passaram.");
