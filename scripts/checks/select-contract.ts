// Checagem das regras do SELECT (contrato de servico).
// Rodar com: npx tsx scripts/checks/select-contract.ts
//
// O que esta em jogo: estas funcoes decidem ate quando um contrato vale, o que
// a cliente deve e se uma adesao e renovacao ou troca. Um erro de um dia no
// fim do contrato faz dois Selects se sobreporem; um erro na geracao de
// parcelas cobra (ou deixa de cobrar) mensalidade de verdade.
import {
  addMonthsClamped,
  contractEndDate,
  buildInstallmentPlan,
  classifyAdesao,
  installmentState,
  contractState,
  cycleWindowFor,
  parseDayUTC,
  formatDayBR,
  effectiveEnd,
  money,
  allocatePayment,
  monthlyWithBuildSales,
  BUILD_SALES_MONTHLY,
  resolveResponsibleId,
  resolvePlanForm,
  parseMoney,
} from "../../src/lib/select-contract";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}
const d = (iso: string) => parseDayUTC(iso)!;
const br = (x: Date) => formatDayBR(x);

// ---------------------------------------------------------------------------
// Soma de meses de calendario
// ---------------------------------------------------------------------------
check("12 meses a partir de 01/03/2026", br(addMonthsClamped(d("2026-03-01"), 12)), "01/03/2027");
check("1 mes a partir de 31/01 recua para 28/02", br(addMonthsClamped(d("2026-01-31"), 1)), "28/02/2026");
check("1 mes a partir de 31/01 em bissexto recua para 29/02", br(addMonthsClamped(d("2028-01-31"), 1)), "29/02/2028");
check("1 mes a partir de 31/03 recua para 30/04", br(addMonthsClamped(d("2026-03-31"), 1)), "30/04/2026");
check("12 meses a partir de 29/02 bissexto", br(addMonthsClamped(d("2028-02-29"), 12)), "28/02/2029");
check("fim do contrato de 12 meses", br(contractEndDate(d("2026-10-07"), 12)), "07/10/2027");

// O fim e EXCLUSIVO: um Select novo pode comecar exatamente nele.
check(
  "novo Select pode comecar no fim do anterior",
  classifyAdesao({
    start: d("2027-03-01"),
    actives: [{ id: "a", startDate: d("2026-03-01"), endDate: d("2027-03-01"), planNameSnapshot: "Estrela", monthlyAmount: 597 }],
  }).kind,
  "RENOVACAO",
);

// ---------------------------------------------------------------------------
// Parcelas
// ---------------------------------------------------------------------------
const hoje = d("2026-10-07");

check(
  "contrato que comeca hoje gera as 12 parcelas",
  buildInstallmentPlan({ start: hoje, validityMonths: 12, monthlyAmount: 597, today: hoje }).length,
  12,
);
check(
  "primeira parcela vence no proprio inicio",
  br(buildInstallmentPlan({ start: hoje, validityMonths: 12, monthlyAmount: 597, today: hoje })[0].dueDate),
  "07/10/2026",
);
check(
  "ultima parcela vence um mes antes do fim",
  br(buildInstallmentPlan({ start: hoje, validityMonths: 12, monthlyAmount: 597, today: hoje })[11].dueDate),
  "07/09/2027",
);

// Retroativo: as de vencimento passado NAO sao geradas, e a numeracao do
// contrato e preservada (decisao 1 da spec).
const retro = buildInstallmentPlan({
  start: d("2026-01-07"),
  validityMonths: 12,
  monthlyAmount: 597,
  today: hoje,
});
check("contrato iniciado ha 9 meses gera 3 parcelas", retro.length, 3);
check("numeracao preservada: 10, 11 e 12", retro.map((p) => p.number), [10, 11, 12]);
check("primeira parcela gerada vence hoje", br(retro[0].dueDate), "07/10/2026");
check(
  "soma das parcelas geradas NAO e o valor do contrato",
  [money(retro.reduce((s, p) => s + p.amount, 0)), money(597 * 12)],
  [1791, 7164],
);

// Contrato que comeca dia 31: toda parcela recua no mes curto, mas volta ao 31.
const dia31 = buildInstallmentPlan({ start: d("2026-01-31"), validityMonths: 4, monthlyAmount: 100, today: d("2026-01-01") });
check("parcelas a partir do dia 31", dia31.map((p) => br(p.dueDate)), ["31/01/2026", "28/02/2026", "31/03/2026", "30/04/2026"]);

// ---------------------------------------------------------------------------
// Classificacao da adesao
// ---------------------------------------------------------------------------
const vigente = { id: "v", startDate: d("2026-03-01"), endDate: d("2027-03-01"), planNameSnapshot: "Estrela", monthlyAmount: 597 };

check("sem contrato ativo e adesao nova", classifyAdesao({ start: hoje, actives: [] }).kind, "NOVO");
check("inicio no meio do vigente e troca", classifyAdesao({ start: d("2026-08-01"), actives: [vigente] }).kind, "TROCA");
check("inicio apos o fim do vigente e renovacao", classifyAdesao({ start: d("2027-06-01"), actives: [vigente] }).kind, "RENOVACAO");
check("inicio igual ao do vigente e bloqueado", classifyAdesao({ start: d("2026-03-01"), actives: [vigente] }).kind, "BLOQUEADO");
check("inicio anterior ao do vigente e bloqueado", classifyAdesao({ start: d("2026-01-01"), actives: [vigente] }).kind, "BLOQUEADO");

// O caso que a spec original nao cobria: renovacao ja agendada no caminho.
const renovacaoAgendada = { id: "r", startDate: d("2027-03-01"), endDate: d("2028-03-01"), planNameSnapshot: "Rubi", monthlyAmount: 997 };
check(
  "troca com renovacao agendada e bloqueada em vez de cancelar em cascata",
  classifyAdesao({ start: d("2026-08-01"), actives: [vigente, renovacaoAgendada] }).kind,
  "BLOQUEADO",
);
check(
  "adesao dentro da renovacao agendada trata a renovacao como vigente",
  classifyAdesao({ start: d("2027-08-01"), actives: [vigente, renovacaoAgendada] }).kind,
  "TROCA",
);

// Encerramento por troca manda sobre o fim previsto.
const encerrado = { ...vigente, closedAt: d("2026-08-01") };
check("fim efetivo usa o closedAt", br(effectiveEnd(encerrado)), "01/08/2026");
check(
  "apos o encerramento antecipado, nova adesao e renovacao",
  classifyAdesao({ start: d("2026-09-01"), actives: [encerrado] }).kind,
  "RENOVACAO",
);

// ---------------------------------------------------------------------------
// Estados derivados
// ---------------------------------------------------------------------------
const parcela = { status: "PENDENTE" as const, amount: 597, paidAmount: 0, dueDate: d("2026-10-01") };
check("pendente com vencimento passado e vencida", installmentState(parcela, hoje), "VENCIDA");
check("pendente com vencimento futuro e pendente", installmentState({ ...parcela, dueDate: d("2026-11-01") }, hoje), "PENDENTE");
check("pagamento parcial vira PARCIAL", installmentState({ ...parcela, paidAmount: 300 }, hoje), "PARCIAL");
check("paga vence qualquer derivacao", installmentState({ ...parcela, status: "PAGA", paidAmount: 597 }, hoje), "PAGA");
check("cancelada vence qualquer derivacao", installmentState({ ...parcela, status: "CANCELADA" }, hoje), "CANCELADA");

check(
  "contrato de inicio futuro aparece como agendado",
  contractState({ status: "ATIVO", startDate: d("2026-12-01"), endDate: d("2027-12-01") }, hoje),
  "AGENDADO",
);
check(
  "contrato que alcancou o fim aparece encerrado sem rotina nenhuma",
  contractState({ status: "ATIVO", startDate: d("2025-01-01"), endDate: d("2026-01-01") }, hoje),
  "ENCERRADO",
);
check(
  "contrato encerrado por troca aparece encerrado a partir do closedAt",
  contractState({ status: "ATIVO", startDate: d("2026-01-01"), endDate: d("2027-01-01"), closedAt: d("2026-09-01") }, hoje),
  "ENCERRADO",
);
check(
  "antes do closedAt o contrato trocado continua vigente",
  contractState({ status: "ATIVO", startDate: d("2026-01-01"), endDate: d("2027-01-01"), closedAt: d("2026-12-01") }, hoje),
  "ATIVO",
);

// ---------------------------------------------------------------------------
// Ciclo mensal do minimo de compras
// ---------------------------------------------------------------------------
const contratoCiclo = { startDate: d("2026-03-15"), endDate: d("2027-03-15") };
check(
  "ciclo do dia 15 vai de 15 a 15 (fim exclusivo)",
  (() => { const c = cycleWindowFor(contratoCiclo, d("2026-10-07"))!; return [c.index, br(c.from), br(c.to)]; })(),
  [7, "15/09/2026", "15/10/2026"],
);
check(
  "o proprio dia do inicio abre o ciclo 1",
  (() => { const c = cycleWindowFor(contratoCiclo, d("2026-03-15"))!; return [c.index, br(c.from)]; })(),
  [1, "15/03/2026"],
);
check(
  "vespera do inicio nao tem ciclo",
  cycleWindowFor(contratoCiclo, d("2026-03-14")),
  null,
);
check(
  "depois do fim nao tem ciclo",
  cycleWindowFor(contratoCiclo, d("2027-03-15")),
  null,
);
check(
  "ultimo ciclo e truncado no fim do contrato",
  (() => { const c = cycleWindowFor(contratoCiclo, d("2027-03-01"))!; return [c.index, br(c.from), br(c.to)]; })(),
  [12, "15/02/2027", "15/03/2027"],
);
check(
  "ciclo de contrato que comeca dia 31 acompanha o recuo",
  (() => { const c = cycleWindowFor({ startDate: d("2026-01-31"), endDate: d("2027-01-31") }, d("2026-03-01"))!; return [c.index, br(c.from), br(c.to)]; })(),
  [2, "28/02/2026", "31/03/2026"],
);

// ---------------------------------------------------------------------------
// Rateio de pagamento (adiantamento em cascata)
// ---------------------------------------------------------------------------
const P = (number: number, paidAmount = 0, status: "PENDENTE" | "PAGA" | "CANCELADA" = "PENDENTE") => ({
  id: `p${number}`, number, amount: 500, paidAmount, status,
});
const tres = [P(1), P(2), P(3)];

check(
  "pagamento exato quita so a parcela escolhida",
  allocatePayment({ amount: 500, targetId: "p1", installments: tres }).allocations,
  [{ installmentId: "p1", number: 1, amount: 500 }],
);
check(
  "pagamento parcial fica na propria parcela",
  allocatePayment({ amount: 300, targetId: "p1", installments: tres }).allocations,
  [{ installmentId: "p1", number: 1, amount: 300 }],
);
check(
  "700 numa mensalidade de 500 adianta 200 da proxima",
  allocatePayment({ amount: 700, targetId: "p1", installments: tres }).allocations,
  [
    { installmentId: "p1", number: 1, amount: 500 },
    { installmentId: "p2", number: 2, amount: 200 },
  ],
);
check(
  "excedente atravessa mais de uma parcela",
  allocatePayment({ amount: 1250, targetId: "p1", installments: tres }).allocations,
  [
    { installmentId: "p1", number: 1, amount: 500 },
    { installmentId: "p2", number: 2, amount: 500 },
    { installmentId: "p3", number: 3, amount: 250 },
  ],
);
check(
  "cascata respeita o que ja foi pago na parcela seguinte",
  allocatePayment({ amount: 700, targetId: "p1", installments: [P(1), P(2, 400), P(3)] }).allocations,
  [
    { installmentId: "p1", number: 1, amount: 500 },
    { installmentId: "p2", number: 2, amount: 100 },
    { installmentId: "p3", number: 3, amount: 100 },
  ],
);
check(
  "cascata pula parcela cancelada",
  allocatePayment({ amount: 700, targetId: "p1", installments: [P(1), P(2, 0, "CANCELADA"), P(3)] }).allocations,
  [
    { installmentId: "p1", number: 1, amount: 500 },
    { installmentId: "p3", number: 3, amount: 200 },
  ],
);
check(
  "cascata pula parcela ja quitada",
  allocatePayment({ amount: 700, targetId: "p1", installments: [P(1), P(2, 500, "PAGA"), P(3)] }).allocations,
  [
    { installmentId: "p1", number: 1, amount: 500 },
    { installmentId: "p3", number: 3, amount: 200 },
  ],
);
check(
  "cascata NAO volta para parcelas anteriores",
  allocatePayment({ amount: 900, targetId: "p3", installments: tres }).allocations,
  [{ installmentId: "p3", number: 3, amount: 500 }],
);
check(
  "sobra alem do que ha para cobrar e sinalizada",
  (() => {
    const r = allocatePayment({ amount: 900, targetId: "p3", installments: tres });
    return [r.leftover, r.capacity];
  })(),
  [400, 500],
);
check(
  "capacidade soma os saldos alcancaveis",
  allocatePayment({ amount: 1, targetId: "p1", installments: [P(1, 100), P(2), P(3, 0, "CANCELADA")] }).capacity,
  900,
);
check(
  "alvo inexistente nao aloca nada",
  allocatePayment({ amount: 500, targetId: "xx", installments: tres }),
  { allocations: [], leftover: 500, capacity: 0 },
);
check(
  "centavos nao vazam no rateio",
  allocatePayment({
    amount: 0.3,
    targetId: "a",
    installments: [
      { id: "a", number: 1, amount: 0.1, paidAmount: 0, status: "PENDENTE" },
      { id: "b", number: 2, amount: 0.2, paidAmount: 0, status: "PENDENTE" },
    ],
  }),
  {
    allocations: [
      { installmentId: "a", number: 1, amount: 0.1 },
      { installmentId: "b", number: 2, amount: 0.2 },
    ],
    leftover: 0,
    capacity: 0.3,
  },
);

// ---------------------------------------------------------------------------
check("parseDayUTC recusa data inexistente", parseDayUTC("2026-02-31"), null);
check("parseDayUTC recusa formato errado", parseDayUTC("07/10/2026"), null);
check("money arredonda centavos", money(0.1 + 0.2), 0.3);

// ---------------------------------------------------------------------------
// Build.Sales embutido na mensalidade
//
// O que esta em jogo: estes R$ 67,00 entram na mensalidade de TODO plano e
// multiplicam pela validade. Errar aqui erra o valor de cada contrato vendido
// em R$ 804,00 (12 meses) — e os contratos guardam snapshot, nao se corrigem
// depois mexendo no cadastro do plano.
check("Build.Sales vale R$ 67,00", BUILD_SALES_MONTHLY, 67);
check("Estrela Prata: 597 + Build.Sales", monthlyWithBuildSales(597), 664);
check("Rubi: 997 + Build.Sales", monthlyWithBuildSales(997), 1064);
check("Diamante: 1297 + Build.Sales", monthlyWithBuildSales(1297), 1364);
// Plano negociado: a soma vale igual sobre o valor digitado na adesao.
check("negociado: 1500 + Build.Sales", monthlyWithBuildSales(1500), 1567);
// Centavos nao podem virar dizima.
check("centavos: 597,50 + Build.Sales", monthlyWithBuildSales(597.5), 664.5);
check("centavos: 0,10 + Build.Sales", monthlyWithBuildSales(0.1), 67.1);
// Valor do contrato = mensalidade FINAL x validade. E a invariante que o
// painel do Financeiro exibe como "Valor do contrato".
check("valor do contrato do Estrela Prata (12 m)", money(monthlyWithBuildSales(597) * 12), 7968);
check("valor do contrato do Rubi (12 m)", money(monthlyWithBuildSales(997) * 12), 12768);
// E as parcelas saem com a mensalidade final, nao com a base do plano.
check(
  "parcelas saem com a mensalidade final",
  buildInstallmentPlan({
    start: d("2026-11-01"),
    validityMonths: 3,
    monthlyAmount: monthlyWithBuildSales(597),
    today: d("2026-11-01"),
  }).map((x) => x.amount),
  [664, 664, 664],
);

// ---------------------------------------------------------------------------
// Responsavel pela venda
// ---------------------------------------------------------------------------
// O que esta em jogo: o responsavel passou a vir do NAVEGADOR, e nao mais da
// sessao. Sem estas checagens, um POST montado a mao atribuiria a venda a
// qualquer usuario — inclusive a um Gestor, furando a regra de que todo Select
// pertence a um vendedor. A decisao inteira vive nesta funcao pura.
const vendedora = { id: "u-vanessa", role: "VENDAS", active: true };
const vendedorInativo = { id: "u-ex", role: "VENDAS", active: false };
const gestor = { id: "u-gestor", role: "GESTAO", active: true };

// VENDAS nao escolhe: e sempre o proprio, e o que vier do navegador e ignorado.
check(
  "VENDAS: responsavel e o proprio usuario",
  resolveResponsibleId({ actorRole: "VENDAS", actorId: "u-valdir" }),
  { responsibleId: "u-valdir" },
);
check(
  "VENDAS: id alheio enviado no payload e IGNORADO",
  resolveResponsibleId({
    actorRole: "VENDAS",
    actorId: "u-valdir",
    chosenId: vendedora.id,
    chosen: vendedora,
  }),
  { responsibleId: "u-valdir" },
);

// GESTAO e FINANCEIRO escolhem, e a escolha e obrigatoria.
check(
  "GESTAO sem escolher: recusa",
  resolveResponsibleId({ actorRole: "GESTAO", actorId: "u-gestor" }),
  { error: "Selecione o responsável pela venda." },
);
check(
  "GESTAO com escolha em branco: recusa",
  resolveResponsibleId({ actorRole: "GESTAO", actorId: "u-gestor", chosenId: "   " }),
  { error: "Selecione o responsável pela venda." },
);
check(
  "GESTAO com id inexistente: recusa",
  resolveResponsibleId({
    actorRole: "GESTAO",
    actorId: "u-gestor",
    chosenId: "u-fantasma",
    chosen: null,
  }),
  { error: "O responsável selecionado não existe." },
);
check(
  "GESTAO escolhendo vendedor INATIVO: recusa",
  resolveResponsibleId({
    actorRole: "GESTAO",
    actorId: "u-gestor",
    chosenId: vendedorInativo.id,
    chosen: vendedorInativo,
  }),
  { error: "O responsável selecionado está inativo." },
);
// O coracao da regra: so quem e de Vendas pode receber a venda.
check(
  "GESTAO escolhendo outro GESTOR: recusa",
  resolveResponsibleId({
    actorRole: "GESTAO",
    actorId: "u-gestor",
    chosenId: gestor.id,
    chosen: gestor,
  }),
  { error: "O responsável tem de ser um usuário de Vendas." },
);
check(
  "GESTAO escolhendo a si mesmo: recusa (Gestao nao e Vendas)",
  resolveResponsibleId({
    actorRole: "GESTAO",
    actorId: gestor.id,
    chosenId: gestor.id,
    chosen: gestor,
  }),
  { error: "O responsável tem de ser um usuário de Vendas." },
);
check(
  "GESTAO escolhendo vendedora ativa: aceita",
  resolveResponsibleId({
    actorRole: "GESTAO",
    actorId: "u-gestor",
    chosenId: vendedora.id,
    chosen: vendedora,
  }),
  { responsibleId: vendedora.id },
);
check(
  "FINANCEIRO escolhendo vendedora ativa: aceita",
  resolveResponsibleId({
    actorRole: "FINANCEIRO",
    actorId: "u-fernando",
    chosenId: vendedora.id,
    chosen: vendedora,
  }),
  { responsibleId: vendedora.id },
);
// O id gravado vem da LINHA DO BANCO, nao do texto recebido: se os dois
// divergirem, quem chamou leu o usuario errado e nada deve ser gravado.
check(
  "id pedido e linha carregada divergentes: recusa",
  resolveResponsibleId({
    actorRole: "GESTAO",
    actorId: "u-gestor",
    chosenId: "u-outro",
    chosen: vendedora,
  }),
  { error: "O responsável selecionado não existe." },
);

// ---------------------------------------------------------------------------
// Leitura de valor digitado
// ---------------------------------------------------------------------------
// Ponto E virgula: ponto e separador de milhar, virgula e decimal (pt-BR).
check("parseMoney 1.297,50", parseMoney("1.297,50"), 1297.5);
check("parseMoney 1.297.500,99", parseMoney("1.297.500,99"), 1297500.99);
// So virgula: decimal.
check("parseMoney 797,50", parseMoney("797,50"), 797.5);
check("parseMoney 0,10", parseMoney("0,10"), 0.1);
// So PONTO, e aqui estava o defeito: apagar todo ponto fazia 1297.50 virar
// 129750 — erro de 100x em dinheiro, calado. A regra desempata pelo numero de
// casas depois do ponto: 1 ou 2 e decimal, 3 e milhar (convencao pt-BR).
check("parseMoney 1297.50 e decimal", parseMoney("1297.50"), 1297.5);
check("parseMoney 797.5 e decimal", parseMoney("797.5"), 797.5);
check("parseMoney 10.5 e decimal", parseMoney("10.5"), 10.5);
check("parseMoney 1.297 e milhar", parseMoney("1.297"), 1297);
check("parseMoney 10.500 e milhar", parseMoney("10.500"), 10500);
check("parseMoney 1.297.500 e milhar", parseMoney("1.297.500"), 1297500);
// Sem separador nenhum.
check("parseMoney 597", parseMoney("597"), 597);
check("parseMoney 6000", parseMoney("6000"), 6000);
check("parseMoney ignora espacos", parseMoney(" 6 000 "), 6000);
// Nao-numeros.
check("parseMoney em branco e null", parseMoney("   "), null);
check("parseMoney de texto e null", parseMoney("abc"), null);
check("parseMoney de undefined e null", parseMoney(undefined), null);
check("parseMoney de pontuacao solta e null", parseMoney(","), null);

// ---------------------------------------------------------------------------
// Cadastro de plano (aba Planos, em Gestao)
// ---------------------------------------------------------------------------
// O que esta em jogo: um plano cadastrado sem valores APARECE na lista do Novo
// Select e morre em "O plano nao tem valores cadastrados" quando alguem clica
// em Revisar. Os limites aqui tem de ser os MESMOS de resolveValues, senao a
// Gestao cadastra um plano que a adesao recusa.
const planoDeTabela = {
  name: "Esmeralda",
  editableValues: false,
  validityMonths: "12",
  monthlyAmount: "797",
  minMonthlyPurchase: "8.000",
};

check(
  "plano de tabela: nome e tres valores",
  resolvePlanForm(planoDeTabela),
  {
    plan: {
      name: "Esmeralda",
      editableValues: false,
      validityMonths: 12,
      monthlyAmount: 797,
      minMonthlyPurchase: 8000,
    },
  },
);
check(
  "plano de tabela aceita centavos",
  resolvePlanForm({ ...planoDeTabela, monthlyAmount: "797,50" }),
  {
    plan: {
      name: "Esmeralda", editableValues: false, validityMonths: 12,
      monthlyAmount: 797.5, minMonthlyPurchase: 8000,
    },
  },
);
// O nome e aparado, mas NAO truncado: ele vira planNameSnapshot do contrato.
check(
  "nome e aparado",
  resolvePlanForm({ ...planoDeTabela, name: "  Esmeralda  " }),
  {
    plan: {
      name: "Esmeralda", editableValues: false, validityMonths: 12,
      monthlyAmount: 797, minMonthlyPurchase: 8000,
    },
  },
);
check(
  "nome em branco: recusa",
  resolvePlanForm({ ...planoDeTabela, name: "   " }),
  { error: "Informe o nome do plano." },
);
check(
  "nome com 121 caracteres: RECUSA, nao corta",
  resolvePlanForm({ ...planoDeTabela, name: "x".repeat(121) }),
  { error: "Nome do plano muito longo (máx. 120 caracteres)." },
);
check(
  "nome com 120 caracteres: aceita",
  "plan" in resolvePlanForm({ ...planoDeTabela, name: "x".repeat(120) }),
  true,
);

// Negociado: os tres valores vao NULOS ao banco, mesmo que a tela mande algo.
check(
  "negociado zera os valores de tabela",
  resolvePlanForm({
    name: "Diamante (Wincon)",
    editableValues: true,
    validityMonths: "12",
    monthlyAmount: "1500",
    minMonthlyPurchase: "20000",
  }),
  {
    plan: {
      name: "Diamante (Wincon)", editableValues: true, validityMonths: 12,
      monthlyAmount: null, minMonthlyPurchase: null,
    },
  },
);
// A validade continua obrigatoria no negociado: ela e o padrao sugerido na
// adesao, e a coluna do banco nao aceita nulo.
check(
  "negociado sem validade: recusa",
  resolvePlanForm({
    name: "Negociado", editableValues: true, validityMonths: "",
    monthlyAmount: "", minMonthlyPurchase: "",
  }),
  { error: "Validade inválida (de 1 a 120 meses)." },
);

// Limites de validade: os mesmos de resolveValues.
for (const [v, rotulo] of [["0", "zero"], ["121", "121"], ["12,5", "fracionada"], ["abc", "texto"]] as const) {
  check(
    `validade ${rotulo}: recusa`,
    resolvePlanForm({ ...planoDeTabela, validityMonths: v }),
    { error: "Validade inválida (de 1 a 120 meses)." },
  );
}
check("validade 1: aceita", "plan" in resolvePlanForm({ ...planoDeTabela, validityMonths: "1" }), true);
check("validade 120: aceita", "plan" in resolvePlanForm({ ...planoDeTabela, validityMonths: "120" }), true);

// Plano de tabela SEM valores e justamente o defeito que esta aba poderia
// introduzir: tem de ser recusado na gravacao.
check(
  "tabela sem mensalidade: recusa",
  resolvePlanForm({ ...planoDeTabela, monthlyAmount: "" }),
  { error: "Informe a mensalidade (maior que zero)." },
);
check(
  "tabela com mensalidade zero: recusa",
  resolvePlanForm({ ...planoDeTabela, monthlyAmount: "0" }),
  { error: "Informe a mensalidade (maior que zero)." },
);
check(
  "tabela com mensalidade negativa: recusa",
  resolvePlanForm({ ...planoDeTabela, monthlyAmount: "-10" }),
  { error: "Informe a mensalidade (maior que zero)." },
);
check(
  "tabela sem minimo de compras: recusa",
  resolvePlanForm({ ...planoDeTabela, minMonthlyPurchase: "" }),
  { error: "Informe o mínimo de compras mensal (maior que zero)." },
);
check(
  "valor acima do teto: recusa",
  resolvePlanForm({ ...planoDeTabela, monthlyAmount: "10000000" }),
  { error: "Valor acima do limite permitido." },
);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("select-contract: todas as checagens passaram.");
