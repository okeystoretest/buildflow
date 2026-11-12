// Checagem dos textos da apresentação agendada na LP de atacado.
// Rodar com: npx tsx scripts/checks/wholesale-presentation.ts
//
// O que está em jogo: estes textos viram o CARD da tarefa e o PUSH que chega no
// celular da vendedora. Ela não confere o banco — ela lê o card e vai. Hora
// formatada no fuso errado manda a vendedora três horas fora do compromisso, e
// esse é exatamente o erro que a coluna `presentationAt` existe para evitar.
import {
  textosDaApresentacao,
  dataDaApresentacao,
  horaDaApresentacao,
} from "../../src/lib/wholesale-presentation";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

// 17:30Z = 14:30 em Brasília (UTC-3). É o instante que `validarApresentacao`
// produz a partir de "14:30" digitado pela lojista.
const QUANDO = new Date("2027-03-10T17:30:00.000Z");

check("data no fuso do negócio", dataDaApresentacao(QUANDO), "10/03/2027");
check("hora no fuso do negócio", horaDaApresentacao(QUANDO), "14:30");

// A VIRADA DO DIA é o caso que separa os dois fusos. 02:00Z do dia 11 é
// 23:00 do dia 10 em Brasília: formatado em UTC, o card diria o dia errado.
const VIRADA = new Date("2027-03-11T02:00:00.000Z");
check("virada do dia: data de Brasília", dataDaApresentacao(VIRADA), "10/03/2027");
check("virada do dia: hora de Brasília", horaDaApresentacao(VIRADA), "23:00");

const t = textosDaApresentacao({
  contactName: "  Ana Souza  ",
  brand: "OKEY",
  phone: "85988887777",
  quando: QUANDO,
});

// A DATA TEM DE ESTAR NO TÍTULO. `DailyTask` não tem coluna de data e o quadro
// não filtra por dia: sem ela, um compromisso de daqui a duas semanas aparece
// hoje mostrando só "14:30", e a vendedora lê como hoje.
check("título traz a data", t.titulo.includes("10/03/2027"), true);
check("título traz a hora", t.titulo.includes("14:30"), true);
check("título traz o nome, sem os espaços da digitação", t.titulo.includes("— Ana Souza"), true);
check("título não guarda espaço em branco da borda", t.titulo, t.titulo.trim());

check("startTime no formato HH:MM que a coluna guarda", t.horario, "14:30");
check("horário casa com o formatador", t.horario, horaDaApresentacao(QUANDO));

check("telefone formatado para ligar", t.notas.includes("(85) 98888-7777"), true);
check("notas dizem de qual marca veio", t.notas.includes("OKEY"), true);

const lov = textosDaApresentacao({ ...{ contactName: "Bia", phone: "85988887777", quando: QUANDO }, brand: "LOV_CLUB" });
check("Lov Club pelo nome de exibição, não pelo enum", lov.notas.includes("Lov Club"), true);
check("nenhum texto vaza o enum cru", lov.notas.includes("LOV_CLUB"), false);

// O sininho e o push são lidos fora de contexto: precisam dizer QUEM e QUANDO
// sem o card ao lado.
for (const [nome, texto] of [["notificação", t.notificacao], ["push", t.push]] as const) {
  check(`${nome} diz quem`, texto.includes("Ana Souza"), true);
  check(`${nome} diz o dia`, texto.includes("10/03/2027"), true);
  check(`${nome} diz a hora`, texto.includes("14:30"), true);
}

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-presentation: todas as checagens passaram.");
