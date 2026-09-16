// Checagem dos textos de notificacao ao motorista.
// Rodar com: npx tsx scripts/checks/notification-messages.ts
import { mensagemPagamentoEntrega } from "../../src/lib/notifications/messages";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// Texto exato definido pelo produto (herdado do aviso por WhatsApp).
check(
  "com comanda",
  mensagemPagamentoEntrega({ comandaNumber: "1234", orderNumber: "PED-9" }),
  "Pagamento da comanda 1234 efetuado com sucesso.",
);
check(
  "sem comanda usa o pedido",
  mensagemPagamentoEntrega({ comandaNumber: null, orderNumber: "PED-9" }),
  "Pagamento da comanda PED-9 efetuado com sucesso.",
);
check(
  "comanda em branco usa o pedido",
  mensagemPagamentoEntrega({ comandaNumber: "   ", orderNumber: "PED-9" }),
  "Pagamento da comanda PED-9 efetuado com sucesso.",
);

if (falhas) {
  console.log(`${falhas} falha(s)`);
  process.exit(1);
}
console.log("notification-messages: ok");
