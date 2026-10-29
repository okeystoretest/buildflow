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
//
// `lead.status` entra junto do `sellerId` porque a action lê os dois na MESMA
// consulta de permissão, e o veredito passa a depender do status atual (o
// COMPROU só vem de APROVADO). A ordem segue intacta: permissão primeiro,
// invariante depois.
function simular(
  actor: WholesaleActor,
  lead: { sellerId: string | null; status?: string },
  entrada: { toStatus: string; rejectionCode?: string | null; cautionReason?: string | null },
) {
  if (!canDecideLead(actor, lead)) return { error: "negado" };
  const d = resolveDecision({ ...entrada, fromStatus: lead.status ?? null });
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

// COMPROU: a permissão continua vindo ANTES da origem do status. Uma
// candidatura de OUTRA vendedora recebe "negado", e não "só aprovada pode" —
// a segunda mensagem confirmaria a quem não pode ver o lead que ele existe e
// que não está aprovado.
check(
  "comprou em lead de outra vendedora: nega ANTES de olhar a origem",
  simular(atacado, { sellerId: "u9", status: "EM_ANALISE" }, { toStatus: "COMPROU" }),
  { error: "negado" },
);
check(
  "comprou em lead próprio ainda em análise: o erro é do veredito",
  simular(atacado, { sellerId: "u1", status: "EM_ANALISE" }, { toStatus: "COMPROU" }),
  { error: "Só uma candidatura aprovada pode ser marcada como Comprou." },
);
check(
  "comprou em lead próprio já aprovado: grava",
  simular(atacado, { sellerId: "u1", status: "APROVADO" }, { toStatus: "COMPROU" }),
  { gravar: { status: "COMPROU", ok: true, rejectionCode: null, cautionReason: null } },
);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-decision-flow: todas as checagens passaram.");
