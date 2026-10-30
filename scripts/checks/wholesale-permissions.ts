// Checagem de acesso e de transição de status da Análise de Clientes.
// Rodar com: npx tsx scripts/checks/wholesale-permissions.ts
//
// O que está em jogo: quem pode ver e decidir sobre a candidatura de um
// negócio real, e se um veredito pode ficar sem motivo. A limpeza de campo
// órfão também vive aqui — sem ela a tela mostra um motivo que não vale mais.
import { WholesaleLeadStatus } from "@prisma/client";
import {
  canSeeLead,
  canDecideLead,
  canUseWholesaleTool,
  resolveDecision,
  resolvePurchase,
  PURCHASE_STATES,
  STATUS_VIVOS,
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

const atacado: WholesaleActor = { userId: "u1", role: "VENDAS", salesModel: "ATACADO" };
const varejo: WholesaleActor = { userId: "u2", role: "VENDAS", salesModel: "VAREJO" };
const gestao: WholesaleActor = { userId: "u3", role: "GESTAO", salesModel: null };
const financeiro: WholesaleActor = { userId: "u4", role: "FINANCEIRO", salesModel: null };

// --- quem usa a ferramenta (decisões 15, 16, 17) ---
check("VENDAS+ATACADO usa", canUseWholesaleTool(atacado), true);
check("VENDAS+VAREJO não usa", canUseWholesaleTool(varejo), false);
check("GESTAO usa", canUseWholesaleTool(gestao), true);
// FINANCEIRO fica fora apesar da paridade que permissions.ts dá em PEDIDOS:
// candidatura a revenda não é pedido (decisão 17).
check("FINANCEIRO não usa", canUseWholesaleTool(financeiro), false);

// --- escopo ---
check("atacado vê o próprio", canSeeLead(atacado, { sellerId: "u1" }), true);
check("atacado não vê o de outra", canSeeLead(atacado, { sellerId: "u9" }), false);
check("atacado não vê o sem dono", canSeeLead(atacado, { sellerId: null }), false);
check("gestão vê o de qualquer uma", canSeeLead(gestao, { sellerId: "u9" }), true);
check("gestão vê o sem dono", canSeeLead(gestao, { sellerId: null }), true);
check("varejo não vê nem o próprio", canSeeLead(varejo, { sellerId: "u2" }), false);
check("decidir segue o mesmo conjunto de ver", canDecideLead(atacado, { sellerId: "u1" }), true);
check("não decide o que não vê", canDecideLead(atacado, { sellerId: null }), false);

// --- invariantes do veredito (decisões 8 e 10) ---
check(
  "reprovar sem código: recusa",
  resolveDecision({ toStatus: "REPROVADO" }),
  { error: "Escolha o motivo da reprovação." },
);
check(
  "reprovar com código inexistente: recusa",
  resolveDecision({ toStatus: "REPROVADO", rejectionCode: "99" }),
  { error: "Motivo de reprovação inválido." },
);
check(
  "reprovar com código válido: aceita",
  resolveDecision({ toStatus: "REPROVADO", rejectionCode: "11" }),
  { ok: true, rejectionCode: "11", cautionReason: null },
);
check(
  "cuidado sem justificativa: recusa",
  resolveDecision({ toStatus: "CUIDADO" }),
  { error: "Descreva o motivo do alerta." },
);
check(
  "cuidado com justificativa só de espaços: recusa",
  resolveDecision({ toStatus: "CUIDADO", cautionReason: "   " }),
  { error: "Descreva o motivo do alerta." },
);
check(
  "cuidado com justificativa: aceita e apara",
  resolveDecision({ toStatus: "CUIDADO", cautionReason: "  CNPJ de terceiros  " }),
  { ok: true, rejectionCode: null, cautionReason: "CNPJ de terceiros" },
);

// --- COMPROU saiu do eixo do status -----------------------------------------
// Era o quinto status, e a única transição com origem restrita. Virou eixo
// próprio em 30/10/2026 (`resolvePurchase`, mais abaixo). O valor sobrou no
// enum do Postgres como legado, para o diário histórico seguir verdadeiro, mas
// `STATUS_VIVOS` não o lista — então pedi-lo como status é um pedido inválido
// como qualquer outro.
//
// Esta é a asserção que importa: um `?toStatus=COMPROU` montado à mão, ou uma
// planilha antiga, NÃO pode voltar a escrever o valor legado na coluna de
// status.
check(
  "comprou como status: recusa (saiu do eixo)",
  resolveDecision({ toStatus: "COMPROU" }),
  { error: "Status inválido." },
);
// Nenhum status tem origem restrita agora, e é isso que permitiu a
// `resolveDecision` voltar a ser função só da entrada — e a `decideLead`
// deixar de reconferir dentro da transação.
check(
  "aprovar não depende da origem",
  resolveDecision({ toStatus: "APROVADO" }),
  { ok: true, rejectionCode: null, cautionReason: null },
);

// --- Review Focus 4: campo órfão na troca de veredito ---
check(
  "ao aprovar, código de reprovação anterior é apagado",
  resolveDecision({ toStatus: "APROVADO", rejectionCode: "11", cautionReason: "algo" }),
  { ok: true, rejectionCode: null, cautionReason: null },
);
check(
  "ao reprovar, justificativa de cuidado anterior é apagada",
  resolveDecision({ toStatus: "REPROVADO", rejectionCode: "11", cautionReason: "fraude" }),
  { ok: true, rejectionCode: "11", cautionReason: null },
);
check(
  "ao marcar cuidado, código de reprovação anterior é apagado",
  resolveDecision({ toStatus: "CUIDADO", rejectionCode: "11", cautionReason: "fraude" }),
  { ok: true, rejectionCode: null, cautionReason: "fraude" },
);
check(
  "voltar para EM_ANALISE limpa os dois",
  resolveDecision({ toStatus: "EM_ANALISE", rejectionCode: "11", cautionReason: "fraude" }),
  { ok: true, rejectionCode: null, cautionReason: null },
);
check(
  "status inexistente: recusa",
  resolveDecision({ toStatus: "ARQUIVADO" }),
  { error: "Status inválido." },
);

// --- a premissa dos dois eixos ----------------------------------------------
// `COMPROU` existe no enum do Postgres (para o diário histórico seguir
// verdadeiro) e NÃO existe em `STATUS_VIVOS`. Esse par é o que sustenta o
// desenho inteiro, e é frágil de um jeito específico: alguém "arrumando" a
// lista para ficar igual ao enum reabriria o status como destino de escrita, e
// aí `decideLead` voltaria a produzir o valor legado — em silêncio, porque o
// Prisma aceita.
//
// A cura em `wholesale-compra.ts` existe para o caso de o valor REAPARECER. Se
// esta asserção cair, não é a cura que está errada: é a lista.
check("STATUS_VIVOS tem exatamente os quatro status vivos", [...STATUS_VIVOS], [
  "EM_ANALISE",
  "APROVADO",
  "REPROVADO",
  "CUIDADO",
]);
check(
  "COMPROU não é status vivo, mas segue no enum do Prisma",
  [
    (STATUS_VIVOS as readonly string[]).includes("COMPROU"),
    Object.keys(WholesaleLeadStatus).includes("COMPROU"),
  ],
  [false, true],
);
// Os dois enums têm um valor de MESMO NOME em eixos diferentes, e é por isso
// que `resolvePurchase` e `resolveDecision` não podem compartilhar validador.
check("COMPROU é estado de compra válido", (PURCHASE_STATES as readonly string[]).includes("COMPROU"), true);

// --- resolvePurchase: o eixo de compra --------------------------------------
// A invariante que `resolveDecision` guardava enquanto COMPROU era status, no
// lugar novo. Conferida aqui porque esconder o dropdown na linha não-aprovada é
// conveniência, não controle: o `purchaseState` chega do navegador e pode vir
// montado à mão.
for (const estado of ["CADENCIA", "COMPROU", "NAO_COMPROU"] as const) {
  check(`compra ${estado} em aprovada: aceita`, resolvePurchase({ purchaseState: estado, status: "APROVADO" }), {
    ok: true,
    purchaseState: estado,
  });
}
// Os três recusados pelo status, e não só o COMPROU: marcar "não comprou" numa
// reprovada também afirmaria que ela chegou a ter a chance de comprar.
for (const status of ["EM_ANALISE", "REPROVADO", "CUIDADO"] as const) {
  check(
    `compra em ${status}: recusa`,
    resolvePurchase({ purchaseState: "COMPROU", status }),
    { error: "Só uma candidatura aprovada tem estado de compra." },
  );
}
check(
  "compra inexistente: recusa",
  resolvePurchase({ purchaseState: "TALVEZ", status: "APROVADO" }),
  { error: "Estado de compra inválido." },
);
// Vazio não é "deixa como está": a action sempre manda um dos três, e um ""
// chegando aqui é pedido malformado. Fecha, não libera.
check(
  "compra vazia: recusa",
  resolvePurchase({ purchaseState: "", status: "APROVADO" }),
  { error: "Estado de compra inválido." },
);
// A ORDEM da conferência: estado inválido é reportado ANTES de olhar o status.
// Invertida, a mensagem "só aprovada tem compra" contaria o status da
// candidatura a quem mandou lixo no outro campo.
check(
  "estado inválido é reportado antes do status",
  resolvePurchase({ purchaseState: "TALVEZ", status: "REPROVADO" }),
  { error: "Estado de compra inválido." },
);
// O valor legado do enum de status NÃO é um estado de compra válido por
// acidente de nome: "COMPROU" existe nos dois enums, e `resolvePurchase` só
// conhece o do seu eixo.
check(
  "status legado não vira estado de compra",
  resolvePurchase({ purchaseState: "APROVADO", status: "APROVADO" }),
  { error: "Estado de compra inválido." },
);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-permissions: todas as checagens passaram.");
