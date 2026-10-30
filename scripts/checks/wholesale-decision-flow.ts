// Checagem da composição que a Server Action de decisão obedece.
// Rodar com: npx tsx scripts/checks/wholesale-decision-flow.ts
//
// O que está em jogo: a action junta duas regras puras (quem pode decidir, e
// o que o veredito grava). Esta checagem prende a ORDEM delas: permissão
// primeiro, invariante depois. Invertido, a mensagem de erro revelaria a
// existência e o estado de um lead a quem não pode vê-lo.
import {
  canDecideLead,
  resolveDecision,
  resolvePurchase,
  type WholesaleActor,
} from "../../src/lib/wholesale-permissions";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// Reproduz a ordem da action, sem banco: permissão primeiro, invariante depois.
function simular(
  actor: WholesaleActor,
  lead: { sellerId: string | null; status?: string },
  entrada: { toStatus: string; rejectionCode?: string | null; cautionReason?: string | null },
) {
  if (!canDecideLead(actor, lead)) return { error: "negado" };
  const d = resolveDecision(entrada);
  if ("error" in d) return { error: d.error };
  return { gravar: { status: entrada.toStatus, ...d } };
}

/**
 * A MESMA ordem em `setLeadPurchase`, que é onde ela passou a importar mais.
 *
 * `lead.status` entra junto do `sellerId` porque a action lê os dois na MESMA
 * consulta de permissão, e a invariante da compra depende do status. Invertida,
 * "Só uma candidatura aprovada tem estado de compra." contaria a quem NÃO pode
 * ver o lead que ele existe e que não está aprovado.
 */
function simularCompra(
  actor: WholesaleActor,
  lead: { sellerId: string | null; status: string },
  purchaseState: string,
) {
  if (!canDecideLead(actor, lead)) return { error: "negado" };
  const p = resolvePurchase({ purchaseState, status: lead.status });
  if ("error" in p) return { error: p.error };
  return { gravar: { purchaseState: p.purchaseState } };
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

// COMPROU como STATUS não existe mais: é "Status inválido.", igual a qualquer
// valor desconhecido. A compra tem eixo próprio, logo abaixo.
check(
  "comprou como status: recusa igual a status inventado",
  simular(atacado, { sellerId: "u1", status: "APROVADO" }, { toStatus: "COMPROU" }),
  { error: "Status inválido." },
);

// --- A compra, e a MESMA ordem ----------------------------------------------
// Esta é a asserção que o script existe para travar: a permissão vem ANTES da
// invariante. Uma candidatura de OUTRA vendedora recebe "negado", e não
// "só aprovada tem compra" — a segunda confirmaria a quem não pode ver o lead
// que ele existe e que não está aprovado.
check(
  "compra em lead de outra vendedora: nega ANTES de olhar o status",
  simularCompra(atacado, { sellerId: "u9", status: "EM_ANALISE" }, "COMPROU"),
  { error: "negado" },
);
check(
  "compra em lead próprio ainda em análise: o erro é da invariante",
  simularCompra(atacado, { sellerId: "u1", status: "EM_ANALISE" }, "COMPROU"),
  { error: "Só uma candidatura aprovada tem estado de compra." },
);
check(
  "compra em lead próprio já aprovado: grava",
  simularCompra(atacado, { sellerId: "u1", status: "APROVADO" }, "COMPROU"),
  { gravar: { purchaseState: "COMPROU" } },
);
check(
  "não comprou em lead próprio aprovado: grava",
  simularCompra(atacado, { sellerId: "u1", status: "APROVADO" }, "NAO_COMPROU"),
  { gravar: { purchaseState: "NAO_COMPROU" } },
);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-decision-flow: todas as checagens passaram.");
