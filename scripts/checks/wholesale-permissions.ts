// Checagem de acesso e de transição de status da Análise de Clientes.
// Rodar com: npx tsx scripts/checks/wholesale-permissions.ts
//
// O que está em jogo: quem pode ver e decidir sobre a candidatura de um
// negócio real, e se um veredito pode ficar sem motivo. A limpeza de campo
// órfão também vive aqui — sem ela a tela mostra um motivo que não vale mais.
import {
  canSeeLead,
  canDecideLead,
  canUseWholesaleTool,
  resolveDecision,
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

// --- COMPROU: a única transição com origem restrita -------------------------
// Comprar sem ter sido aprovada não é um caminho do negócio. A regra é
// conferida aqui porque o modal esconder a opção é conveniência, não controle:
// o `toStatus` chega do navegador e pode vir montado à mão.
check(
  "comprou a partir de aprovado: aceita",
  resolveDecision({ toStatus: "COMPROU", fromStatus: "APROVADO" }),
  { ok: true, rejectionCode: null, cautionReason: null },
);
check(
  "comprou direto de em análise: recusa",
  resolveDecision({ toStatus: "COMPROU", fromStatus: "EM_ANALISE" }),
  { error: "Só uma candidatura aprovada pode ser marcada como Comprou." },
);
check(
  "comprou a partir de reprovado: recusa",
  resolveDecision({ toStatus: "COMPROU", fromStatus: "REPROVADO" }),
  { error: "Só uma candidatura aprovada pode ser marcada como Comprou." },
);
check(
  "comprou a partir de cuidado: recusa",
  resolveDecision({ toStatus: "COMPROU", fromStatus: "CUIDADO" }),
  { error: "Só uma candidatura aprovada pode ser marcada como Comprou." },
);
// Sem `fromStatus` NÃO passa. É o caso que importa: se um dia alguém chamar
// `resolveDecision` esquecendo de ler o status atual, a regra tem de FECHAR, e
// não liberar o COMPROU por omissão.
check(
  "comprou sem status de origem: recusa",
  resolveDecision({ toStatus: "COMPROU" }),
  { error: "Só uma candidatura aprovada pode ser marcada como Comprou." },
);
// Reafirmar quem já comprou é aceito: não é pular etapa, e a action não grava
// evento quando o status não muda.
check(
  "comprou a partir de comprou: aceita",
  resolveDecision({ toStatus: "COMPROU", fromStatus: "COMPROU" }),
  { ok: true, rejectionCode: null, cautionReason: null },
);
// O motivo de reprovação anterior é apagado, como em todo outro veredito.
check(
  "ao marcar comprou, código de reprovação anterior é apagado",
  resolveDecision({ toStatus: "COMPROU", fromStatus: "APROVADO", rejectionCode: "11" }),
  { ok: true, rejectionCode: null, cautionReason: null },
);
// Os outros status NÃO ganharam origem restrita: `fromStatus` é indiferente
// para eles, e exigi-lo quebraria toda chamada que não o passa.
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

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-permissions: todas as checagens passaram.");
