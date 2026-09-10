// Checagem da regra "esta forma de envio e entregue por motorista?".
// Rodar com: npx tsx scripts/checks/driver-delivery.ts
//
// O que esta em jogo: a regra decide o que entra na coluna "Pronto" do quadro
// do Motorista e quem recebe push/WhatsApp de entrega disponivel. Errar para
// menos deixa o motorista sem saber do pacote; errar para mais chama a equipe
// de entrega para pedido que vai pelos Correios.
import {
  isEntregaDeMotorista,
  FORMA_EXCURSAO,
  FORMA_ENTREGA_LOCAL,
} from "../../src/lib/driver-delivery";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// --- as duas formas do produto, exatamente como cadastradas ---
check("excursao", isEntregaDeMotorista(FORMA_EXCURSAO), true);
check("entrega local", isEntregaDeMotorista(FORMA_ENTREGA_LOCAL), true);
check("constante excursao", FORMA_EXCURSAO, "1 - Excursão");
check("constante entrega local", FORMA_ENTREGA_LOCAL, "3 - Entrega Local");

// --- tolerancia: o nome e cadastro livre da Gestao e varia na digitacao ---
check("sem acento", isEntregaDeMotorista("1 - Excursao"), true);
check("caixa alta", isEntregaDeMotorista("3 - ENTREGA LOCAL"), true);
check("espaco extra", isEntregaDeMotorista("1  -   Excursão"), true);
check("espaco nas pontas", isEntregaDeMotorista("  3 - Entrega Local  "), true);

// --- o que NAO e entrega de motorista ---
check("correios", isEntregaDeMotorista("2 - Correios"), false);
check("transportadora", isEntregaDeMotorista("4 - Transportadora"), false);
check("nulo", isEntregaDeMotorista(null), false);
check("indefinido", isEntregaDeMotorista(undefined), false);
check("vazio", isEntregaDeMotorista(""), false);

// Nome PARECIDO nao basta: a regra e igualdade, nao "contem". Uma forma nova
// chamada "5 - Excursão Terceirizada" nao herda a entrega do motorista.
check("nome que apenas contem", isEntregaDeMotorista("5 - Excursão Terceirizada"), false);
check("so o numero", isEntregaDeMotorista("1"), false);
check("so o texto", isEntregaDeMotorista("Excursão"), false);

console.log(falhas === 0 ? "OK: driver-delivery" : `${falhas} falha(s) em driver-delivery`);
process.exit(falhas === 0 ? 0 : 1);
