// Checagem do ESCOPO do payload de tempo real.
// Rodar com: npx tsx scripts/checks/realtime-escopo.ts
//
// O que esta em jogo: dado pessoal saindo por uma porta que ninguem olha. O
// /api/events/poll devolvia `orderNumber` e `customerName` para QUALQUER papel
// autenticado, a cada 4 segundos. O MOTORISTA — muitas vezes terceirizado, e
// com duas telas de navegacao — recebia o nome da cliente de cada pedido de
// cada loja, sem nenhuma tela que mostre isso.
//
// A regra agora se amarra a quem EXIBE: os dois campos so vao quando `notify`
// e verdadeiro para aquele papel. Esta checagem existe para que um papel novo,
// ou um `notifyRoles` alargado por engano, nao reabra o vazamento em silencio.
import type { Role } from "@prisma/client";

let falhas = 0;
function check(nome: string, cond: boolean, detalhe = "") {
  if (!cond) {
    falhas++;
    console.log(`FALHOU ${nome}${detalhe ? "\n  " + detalhe : ""}`);
  }
}

/**
 * COPIA da transformacao da rota. Nao importo a rota: um route handler do App
 * Router nao e chamavel fora do Next sem montar Request/sessao, e o que precisa
 * ser travado aqui e a REGRA, nao o encanamento.
 *
 * shortcut: se a rota mudar a forma do payload, esta copia nao acusa sozinha —
 * o nome dos campos esta no nome das asserções abaixo para a busca encontrar.
 * Upgrade quando a transformacao sair da rota para um modulo proprio.
 */
function payload(e: { orderNumber?: string; customerName?: string; notifyRoles?: Role[] }, role: Role) {
  const notify = (e.notifyRoles ?? []).includes(role);
  return {
    orderId: "o1",
    ...(notify ? { orderNumber: e.orderNumber, customerName: e.customerName } : {}),
    notify,
  };
}

const evento = { orderNumber: "8030", customerName: "Maria Conceicao", notifyRoles: ["FINANCEIRO"] as Role[] };

// 1) Quem exibe, recebe.
const fin = payload(evento, "FINANCEIRO");
check("FINANCEIRO recebe orderNumber", fin.orderNumber === "8030");
check("FINANCEIRO recebe customerName", fin.customerName === "Maria Conceicao");
check("FINANCEIRO tem notify", fin.notify === true);

// 2) Quem NAO exibe, nao recebe. Este e o achado.
for (const role of ["MOTORISTA", "VENDAS", "LOGISTICA", "GESTAO"] as Role[]) {
  const p = payload(evento, role);
  check(`${role} NAO recebe customerName`, p.customerName === undefined,
    `recebeu "${p.customerName}" — dado pessoal saindo para papel que nao exibe`);
  check(`${role} NAO recebe orderNumber`, p.orderNumber === undefined);
  check(`${role} continua recebendo orderId (a tela precisa reagir)`, p.orderId === "o1");
}

// 3) Evento sem notifyRoles (o caso comum: emit com []) nao vaza para ninguem.
const semAlerta = { orderNumber: "8031", customerName: "Rita Lima" };
for (const role of ["FINANCEIRO", "MOTORISTA", "GESTAO"] as Role[]) {
  const p = payload(semAlerta, role);
  check(`evento sem notifyRoles nao vaza nome para ${role}`, p.customerName === undefined);
}

// 4) Lista vazia explicita se comporta como ausente.
check("notifyRoles: [] nao vaza", payload({ ...evento, notifyRoles: [] }, "FINANCEIRO").customerName === undefined);

console.log(falhas === 0 ? "realtime-escopo: OK" : `realtime-escopo: ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
