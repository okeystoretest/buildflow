// Checagem das regras dos ITENS DE CAMPANHA (CRUD do Histórico de Vendas).
// Rodar com: npx tsx scripts/checks/campaign-items.ts
//
// O que esta em jogo: o valor e a quantidade destes itens sao a pontuacao do
// Ranking > Performance na Campanha. Item aceito sem referencia, com quantidade
// zero ou com valor fora da faixa entra direto na disputa entre vendedoras; e
// agregado derivado errado (campaignId/itemCount) faz o Rank discordar da tela
// que o alimenta.
import {
  normalizeCampaignItem,
  aggregateCampaignFields,
  sumCampaignValue,
  campaignItemAuditNote,
  MAX_REFERENCE_LENGTH,
  MAX_ITEM_QUANTITY,
  MAX_ITEM_VALUE,
} from "../../src/lib/campaign-items";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}
function checkErro(nome: string, res: ReturnType<typeof normalizeCampaignItem>) {
  if (res.ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=recusa\n  obtido  =aceito ${JSON.stringify(res.item)}`);
  }
}

const base = { campaignId: "camp1", reference: "REF-102", quantity: 2, value: 150.5 };

// --- o caminho feliz ---
check("item valido", normalizeCampaignItem(base), { ok: true, item: base });
check(
  "referencia normalizada (espacos colapsados e aparados)",
  normalizeCampaignItem({ ...base, reference: "  REF   102  " }),
  { ok: true, item: { ...base, reference: "REF 102" } },
);
check(
  "valor arredondado para centavos",
  normalizeCampaignItem({ ...base, value: 10.005 }),
  { ok: true, item: { ...base, value: 10.01 } },
);
check(
  "valor zero e aceito (peca de campanha sem valor lancado)",
  normalizeCampaignItem({ ...base, value: 0 }),
  { ok: true, item: { ...base, value: 0 } },
);
check(
  "valor como string (vem de input text)",
  normalizeCampaignItem({ ...base, value: "150.50" }),
  { ok: true, item: base },
);

// --- o que NAO pode entrar ---
checkErro("sem campanha", normalizeCampaignItem({ ...base, campaignId: "" }));
checkErro("campanha so com espacos", normalizeCampaignItem({ ...base, campaignId: "   " }));
checkErro("sem referencia", normalizeCampaignItem({ ...base, reference: "" }));
checkErro("referencia so com espacos", normalizeCampaignItem({ ...base, reference: "   " }));
checkErro(
  "referencia acima do limite",
  normalizeCampaignItem({ ...base, reference: "R".repeat(MAX_REFERENCE_LENGTH + 1) }),
);
checkErro("quantidade zero", normalizeCampaignItem({ ...base, quantity: 0 }));
checkErro("quantidade negativa", normalizeCampaignItem({ ...base, quantity: -3 }));
checkErro("quantidade fracionaria", normalizeCampaignItem({ ...base, quantity: 1.5 }));
checkErro("quantidade nao numerica", normalizeCampaignItem({ ...base, quantity: "duas" }));
checkErro(
  "quantidade acima do limite",
  normalizeCampaignItem({ ...base, quantity: MAX_ITEM_QUANTITY + 1 }),
);
checkErro("valor negativo", normalizeCampaignItem({ ...base, value: -1 }));
checkErro("valor nao numerico", normalizeCampaignItem({ ...base, value: "abc" }));
checkErro("valor acima do limite", normalizeCampaignItem({ ...base, value: MAX_ITEM_VALUE + 1 }));

// --- limites exatos: o teto E aceito, o passo alem nao ---
check(
  "referencia no limite exato",
  normalizeCampaignItem({ ...base, reference: "R".repeat(MAX_REFERENCE_LENGTH) }).ok,
  true,
);
check(
  "quantidade no limite exato",
  normalizeCampaignItem({ ...base, quantity: MAX_ITEM_QUANTITY }).ok,
  true,
);
check("valor no limite exato", normalizeCampaignItem({ ...base, value: MAX_ITEM_VALUE }).ok, true);

// --- agregados legados do pedido (campaignId / itemCount) ---
check("agregado de lista vazia", aggregateCampaignFields([]), { campaignId: null, itemCount: 0 });
check(
  "agregado usa a campanha do PRIMEIRO item e soma as quantidades",
  aggregateCampaignFields([
    { campaignId: "camp1", quantity: 2 },
    { campaignId: "camp2", quantity: 3 },
  ]),
  { campaignId: "camp1", itemCount: 5 },
);
check(
  "agregado de um unico item",
  aggregateCampaignFields([{ campaignId: "camp9", quantity: 7 }]),
  { campaignId: "camp9", itemCount: 7 },
);

// --- soma de valores: centavos por dentro, sem erro de ponto flutuante ---
check("soma vazia", sumCampaignValue([]), 0);
check("soma exata de centavos", sumCampaignValue([{ value: 0.1 }, { value: 0.2 }]), 0.3);
check(
  "soma de tres itens",
  sumCampaignValue([{ value: 150.5 }, { value: 49.5 }, { value: 100 }]),
  300,
);

// --- nota de auditoria ---
// O Intl separa "R$" do numero com espaco INSEPARAVEL (U+00A0), nao com espaco
// comum. As notas vao gravadas assim no historico do pedido; se a expectativa
// usasse espaco comum, a checagem falharia por um caractere invisivel.
const NB = " ";
const item = { campaignName: "Setembro", reference: "REF-102", quantity: 2, value: 150.5 };
check(
  "nota de adicao",
  campaignItemAuditNote("add", item),
  `Item de campanha adicionado: REF-102 x2 — R$${NB}150,50 (Setembro)`,
);
check(
  "nota de exclusao",
  campaignItemAuditNote("remove", item),
  `Item de campanha excluído: REF-102 x2 — R$${NB}150,50 (Setembro)`,
);
check(
  "nota de edicao lista so o que mudou",
  campaignItemAuditNote("update", { ...item, quantity: 5 }, item),
  "Item de campanha editado (REF-102): quantidade 2 -> 5",
);
check(
  "nota de edicao com varias mudancas",
  campaignItemAuditNote("update", { ...item, quantity: 5, value: 200 }, item),
  `Item de campanha editado (REF-102): quantidade 2 -> 5; valor R$${NB}150,50 -> R$${NB}200,00`,
);
check(
  "nota de edicao que nao mudou nada descreve o item",
  campaignItemAuditNote("update", item, item),
  `Item de campanha editado: REF-102 x2 — R$${NB}150,50 (Setembro)`,
);
check(
  "nota de edicao ignora diferenca abaixo do centavo",
  campaignItemAuditNote("update", { ...item, value: 150.504 }, item),
  `Item de campanha editado: REF-102 x2 — R$${NB}150,50 (Setembro)`,
);
check(
  "nota de edicao registra a troca de campanha",
  campaignItemAuditNote("update", { ...item, campaignName: "Outubro" }, item),
  "Item de campanha editado (REF-102): campanha Setembro -> Outubro",
);

if (falhas > 0) {
  console.log(`
${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("Itens de campanha: todas as checagens passaram.");
