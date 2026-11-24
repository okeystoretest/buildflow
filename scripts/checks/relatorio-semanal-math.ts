/**
 * Checagem das contas do Relatório Semanal do Marketing.
 *
 * Cada caso CITA A CÉLULA DE ORIGEM da planilha
 * (`Relatorio-Semanal-Karen-Okey.xlsx`): é o que permite abrir o arquivo
 * antigo e comparar o número lado a lado quando alguém desconfiar da
 * ferramenta. Sem a citação, a checagem provaria que o código faz o que o
 * código faz.
 *
 * O QUE ISTO JÁ PEGOU (no repositório de origem, antes do porte): a primeira
 * semana de um ano que começa na sexta. `04/01/2027` saía como semana 2 com
 * um arredondamento ingênuo, e o relatório da virada apareceria duas vezes na
 * lista. Está no último caso daqui.
 *
 * Rode com: npx tsx scripts/checks/relatorio-semanal-math.ts
 */
import {
  contarEntregas,
  estaAtrasado,
  mediaDasSemanas,
  percentualDaMeta,
  resumirKanban,
  segundaDaSemana,
  semanaIso,
  somarDias,
  variacao,
  type MarketingTaskItem,
} from "../../src/lib/relatorio-semanal-math";
import { formatarVariacao } from "../../src/lib/relatorio-semanal-labels";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`${ok ? "ok" : "FALHOU"} ${nome}`);
  if (!ok) {
    falhas++;
    console.log(`  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

/* ------------------------------------------------- variação (aba 3, E2) */

check("variacao e (atual - anterior) / anterior, como em E2 da aba 3", variacao(100, 120), 0.2);
check("...e a queda sai negativa", variacao(120, 90), -0.25);
check("...e o empate e zero, nao traco", variacao(50, 50), 0);

// A planilha devolvia traço quando faltava um dos dois números.
check("sem o anterior nao ha variacao", variacao(undefined, 120), undefined);
check("sem o atual nao ha variacao", variacao(100, undefined), undefined);

// A planilha devolvia #DIV/0! aqui. Crescer de 0 para 40 não é "+∞%": é
// crescimento que não tem base de comparação.
check("semana anterior zerada nao vira variacao infinita", variacao(0, 40), undefined);

/* --------------------------------- % da meta (aba OKRs do Trimestre, E2) */

check("% da meta e realizado / meta", percentualDaMeta(18, 20), 0.9);
check("...e a meta cumprida da 1", percentualDaMeta(20, 20), 1);

// Metas como "0 falhas" ou "+20% vs trimestre" não têm número: a % é
// opcional na tela, em vez de uma divisão por zero disfarçada de resultado.
check("meta zero nao produz percentual", percentualDaMeta(5, 0), undefined);
check("meta sem numero nao produz percentual", percentualDaMeta(5, undefined), undefined);
check("sem realizado nao produz percentual", percentualDaMeta(undefined, 20), undefined);

/* ------------------------------ média de 4 semanas (aba OKRs Semanais, K2) */

// COUNT do Excel não conta célula vazia: três semanas dividem por três.
check("a media de 4 semanas ignora as semanas nao apuradas", mediaDasSemanas([10, 20, 30, undefined]), 20);
check("...uma semana so e a media dela mesma", mediaDasSemanas([10, undefined, undefined, undefined]), 10);
check("...e o zero APURADO entra na conta", mediaDasSemanas([0, 10]), 5);

// Zero diria que o KR não andou. Traço diz que ninguém mediu — e são
// decisões diferentes na reunião de sexta.
check("nenhuma semana apurada: sem media, nao zero", mediaDasSemanas([]), undefined);
check("...idem quando todas estao vazias", mediaDasSemanas([undefined, undefined]), undefined);

/* ------------------------------------- os COUNTIF do rodapé (aba 2) */

check(
  "os tres COUNTIF do rodape das entregas, mais o que falta responder",
  contarEntregas([
    { health: "NO_RITMO" },
    { health: "NO_RITMO" },
    { health: "ATENCAO" },
    { health: "TRAVADO" },
    { health: undefined },
    { health: null },
  ]),
  { onTrack: 2, attention: 1, blocked: 1, pending: 2 },
);

/* ------------------------------------------- atraso do cartão (aba 8) */

const HOJE = "2026-11-23";

check("atraso e prazo vencido e cartao nao publicado", estaAtrasado({ dueDate: "2026-11-20", status: "A_FAZER" }, HOJE), true);
check("prazo futuro nao e atraso", estaAtrasado({ dueDate: "2026-11-30", status: "A_FAZER" }, HOJE), false);
check("cartao publicado nunca esta atrasado, mesmo com prazo vencido", estaAtrasado({ dueDate: "2026-11-01", status: "PUBLICADO" }, HOJE), false);
// O prazo vale até o fim do dia: quem entrega hoje entregou no prazo.
check("hoje nao e atraso", estaAtrasado({ dueDate: HOJE, status: "A_FAZER" }, HOJE), false);
check("cartao sem prazo nao entra na conta de atrasados", estaAtrasado({ dueDate: undefined, status: "BACKLOG" }, HOJE), false);

/* ------------------------------------------- o painel do Kanban (aba 8) */

function tarefa(over: Partial<MarketingTaskItem> = {}): MarketingTaskItem {
  return {
    id: "t1",
    code: "K-01",
    title: "Tarefa",
    category: "CONTEUDO",
    priority: "MEDIA",
    enteredAt: "2026-11-16",
    status: "BACKLOG",
    overdue: false,
    ...over,
  };
}

const resumo = resumirKanban([
  tarefa({ id: "1", status: "BACKLOG", category: "CONTEUDO" }),
  tarefa({ id: "2", status: "A_FAZER", category: "CONTEUDO" }),
  tarefa({ id: "3", status: "PUBLICADO", category: "PUBLICACAO" }),
  tarefa({ id: "4", status: "PUBLICADO", category: "RELATORIO" }),
  tarefa({ id: "5", status: "REVISAO", category: "COMUNIDADE", overdue: true }),
]);

check("o painel conta o total", resumo.total, 5);
check("...os publicados", resumo.published, 2);
check("...e os atrasados", resumo.overdue, 1);

// A soma das fatias fecha em 1, como o C13 = SUM(C8:C12) da planilha.
const soma = resumo.byStatus.reduce((acc, linha) => acc + linha.share, 0);
check("as fatias de status somam 1", Math.abs(soma - 1) < 1e-9, true);

const conteudo = resumo.byCategory.find((c) => c.category === "CONTEUDO");
check("a matriz categoria x status conta a categoria", conteudo?.total, 2);
check("...e separa por status dentro dela", [conteudo?.counts.BACKLOG, conteudo?.counts.A_FAZER, conteudo?.counts.PUBLICADO], [1, 1, 0]);

// Toda categoria aparece, inclusive a vazia: a matriz da planilha tinha as
// cinco linhas sempre, e uma linha que desaparece esconde que ninguém está
// trabalhando naquela frente.
check("as cinco categorias aparecem sempre", resumo.byCategory.length, 5);
check("...inclusive a que esta vazia", resumo.byCategory.find((c) => c.category === "PROCESSO")?.total, 0);

const vazio = resumirKanban([]);
check("quadro vazio: total zero", vazio.total, 0);
check("...sem atrasados", vazio.overdue, 0);
check("...e sem divisao por zero nas fatias", vazio.byStatus.every((linha) => linha.share === 0), true);

/* ----------------------------------------------- semana e período (ISO) */

// 23/11/2026 é uma segunda; 27/11 é a sexta da mesma semana.
check("a segunda-feira da semana sai de qualquer dia dela", segundaDaSemana("2026-11-23"), "2026-11-23");
check("...inclusive da sexta", segundaDaSemana("2026-11-27"), "2026-11-23");
// O erro clássico de `- (getDay() - 1)`: domingo pularia para a segunda
// seguinte e o período sairia uma semana adiantado.
check("domingo pertence a semana que termina nele, nao a seguinte", segundaDaSemana("2026-11-29"), "2026-11-23");

check("somarDias anda dentro do mes", somarDias("2026-11-23", 4), "2026-11-27");
check("somarDias atravessa a virada de mes", somarDias("2026-11-30", 1), "2026-12-01");

check("no da semana segue o ISO-8601, como WEEKNUM(...;21) do Excel", semanaIso("2026-01-05"), 2);
check("...e a semana de 23/11/2026 e a 48", semanaIso("2026-11-23"), 48);

// 1º/01/2027 é sexta: pela regra ISO ainda é a semana 53 de 2026, a mesma de
// 28/12/2026. Um WEEKNUM ingênuo diria "semana 1" e o relatório da virada
// apareceria duas vezes na lista.
check("virada de ano: 28/12/2026 e a semana 53", semanaIso("2026-12-28"), 53);
check("...e 01/01/2027 e a MESMA semana 53", semanaIso("2027-01-01"), 53);
check("...a semana 1 so comeca em 04/01/2027", semanaIso("2027-01-04"), 1);

/* ------------------------------------------------------ rótulos da tela */

// O sinal é obrigatório na variação: "20%" e "+20%" se leem igual, mas uma
// queda de 20% sem o sinal passa por alta na leitura rápida de sexta.
check("a variacao positiva sai com sinal", formatarVariacao(0.2), "+20,0%");
check("a queda sai com o sinal negativo", formatarVariacao(-0.25), "-25,0%");
check("sem variacao, traco", formatarVariacao(undefined), "—");

// `iniciais()` virou helper de nome em src/lib/utils.ts, ao lado de
// shortName/firstName, assim que ganhou o segundo uso (o Avatar). As
// checagens dela moraram aqui por um momento e foram junto: quem vigia os
// helpers puros de utils.ts e scripts/checks/utils.ts.

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("relatorio-semanal-math: todas as checagens passaram.");
