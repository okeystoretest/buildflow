// Checagem da conta de tempo do quadro de Acompanhamento.
// Rodar com: npx tsx scripts/checks/followup-kanban.ts
//
// O que esta em jogo: a especificacao de 27/11/2026 pede duas coisas que o
// `tsc` nao sabe conferir e a tela nao acusa, porque as duas erram CALANDO:
//
//  1. "Ao alterar o status, o contador deve pausar e registrar o tempo
//     decorrido no ULTIMO status" — somar por `toStatus` em vez de `fromStatus`
//     compila, desenha e mostra numeros plausiveis; sao apenas os numeros
//     errados, atribuidos ao status seguinte.
//  2. "Caso a atividade retorne a um status anterior, a contagem deve
//     prosseguir a partir do ponto em que parou" — um `Map.set` onde devia ser
//     soma faz a segunda passagem APAGAR a primeira. A tela continua mostrando
//     uma duracao; so que menor do que a verdade.
//
// E a terceira, que vem da escolha do dono de manter a paginacao: com cinco
// cards por pagina, um KPI ou um contador de coluna que conte a PAGINA mente
// sobre o quadro inteiro.
import {
  colunaDe,
  decidirMovimento,
  formatarDuracao,
  resumirFollowUps,
  rotuloDaColuna,
  tempoPorStatus,
  tempoTotal,
  type MovementItem,
} from "../../src/lib/followup-kanban";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  } else {
    console.log(`ok ${nome}`);
  }
}

/** Uma movimentacao, com o que a conta nao olha ja preenchido. */
const mov = (p: Partial<MovementItem>): MovementItem => ({
  id: "m",
  fromStatus: null,
  toStatus: "EM_ANDAMENTO",
  changedByName: "Gestor",
  elapsedMs: null,
  createdAt: "2026-11-27T10:00:00.000Z",
  ...p,
});

// --- a coluna de um status nulo ---------------------------------------------
// Todo registro quinzenal gravado antes de 17/11/2026 tem `status` nulo. Se
// nulo nao caisse numa coluna, esses registros desapareceriam do quadro — a
// tela nao daria erro, so mostraria menos cards do que existem.
check("status nulo cai em Nao Iniciado", colunaDe(null), "NAO_INICIADO");
check("status gravado se mantem", colunaDe("ENTREGUE"), "ENTREGUE");

// --- tempo por status: a REGRA DO RETORNO ------------------------------------
const movs: MovementItem[] = [
  mov({ fromStatus: "NAO_INICIADO", toStatus: "EM_ANDAMENTO", elapsedMs: 1_000 }),
  mov({ fromStatus: "EM_ANDAMENTO", toStatus: "PRECISA_REVISAO", elapsedMs: 60_000 }),
  mov({ fromStatus: "PRECISA_REVISAO", toStatus: "EM_ANDAMENTO", elapsedMs: 30_000 }),
  mov({ fromStatus: "EM_ANDAMENTO", toStatus: "ENTREGUE", elapsedMs: 90_000 }),
];
check("duas passagens pelo mesmo status SOMAM", tempoPorStatus(movs).EM_ANDAMENTO, 150_000);
check("o tempo pertence ao status de ONDE o card saiu", tempoPorStatus(movs).PRECISA_REVISAO, 30_000);
check("status nunca visitado e zero", tempoPorStatus(movs).EM_ESPERA, 0);
check(
  "movimento sem medicao nao conta",
  tempoPorStatus([mov({ fromStatus: "EM_ANDAMENTO", toStatus: "ENTREGUE", elapsedMs: null })]).EM_ANDAMENTO,
  0,
);

// --- tempo total ------------------------------------------------------------
check("total soma os fechados", tempoTotal(movs, null, 0), 181_000);
check(
  "total inclui a contagem aberta",
  tempoTotal(movs, "2026-11-27T10:00:00.000Z", Date.parse("2026-11-27T10:00:10.000Z")),
  191_000,
);
// Relogio do cliente atrasado em relacao ao `timerStartedAt` do servidor: a
// tela mostraria uma duracao NEGATIVA correndo para tras.
check(
  "inicio no futuro nao subtrai",
  tempoTotal([], "2026-11-27T10:00:10.000Z", Date.parse("2026-11-27T10:00:00.000Z")),
  0,
);

// --- formatacao -------------------------------------------------------------
// Zero e "—", nao "0min": zero afirmaria que houve medicao e ela deu nada,
// quando o caso real e "ninguem cronometrou este registro".
check("zero nao finge medicao", formatarDuracao(0), "—");
check("menos de um minuto nao vira zero", formatarDuracao(5_000), "<1min");
check("menos de uma hora em minutos", formatarDuracao(45 * 60_000), "45min");
check("horas e minutos", formatarDuracao(2 * 3_600_000 + 15 * 60_000), "2h15");
check("minuto de um digito vem com zero", formatarDuracao(2 * 3_600_000 + 5 * 60_000), "2h05");
check("mais de um dia em dias e horas", formatarDuracao(26 * 3_600_000), "1d 2h");

// --- o resumo conta o CONJUNTO DO FILTRO, nao a pagina ----------------------
const linhas = [
  { status: null, reviewOn: "2026-01-10" },
  { status: "EM_ANDAMENTO" as const, reviewOn: null },
  { status: "PRECISA_REVISAO" as const, reviewOn: null },
  { status: "ENTREGUE" as const, reviewOn: "2026-01-10" },
];
const r = resumirFollowUps(linhas, "2026-11-27");
check("nulo entra no total", r.total, 4);
check("nulo nao conta como entregue", r.entregues, 1);
check("em andamento conta so o proprio status", r.emAndamento, 1);
check("reavaliacao vencida ignora o entregue", r.reavaliacaoVencida, 1);
check(
  "sem prazo nao vence",
  resumirFollowUps([{ status: "EM_ANDAMENTO", reviewOn: null }], "2026-11-27").reavaliacaoVencida,
  0,
);
check(
  "prazo no futuro nao vence",
  resumirFollowUps([{ status: "EM_ANDAMENTO", reviewOn: "2026-12-30" }], "2026-11-27").reavaliacaoVencida,
  0,
);
// O prazo de HOJE nao esta vencido — vence depois que o dia passa.
check(
  "prazo de hoje nao vence",
  resumirFollowUps([{ status: "EM_ANDAMENTO", reviewOn: "2026-11-27" }], "2026-11-27").reavaliacaoVencida,
  0,
);

// --- o cabecalho da coluna sob paginacao ------------------------------------
// A escolha do dono (27/11/2026) foi manter a paginacao no quadro. O preco
// aceito e este rotulo: sem ele o topo da coluna diria "3" havendo 11, e a
// tela mentiria sobre o que existe fora da pagina.
check("coluna completa mostra so o numero", rotuloDaColuna(3, 3), "3");
check("coluna paginada diz quanto esconde", rotuloDaColuna(3, 11), "3 de 11");
check("coluna vazia na pagina mas cheia no filtro", rotuloDaColuna(0, 7), "0 de 7");

// --- a decisao de gravar (ou nao) uma movimentacao --------------------------
// Parte PURA das actions: o que vai para a trilha, apurado com o relogio do
// SERVIDOR. Esta aqui porque e onde o tempo errado entraria na auditoria.
check(
  "mover para o mesmo status nao e movimento",
  decidirMovimento("EM_ANDAMENTO", "EM_ANDAMENTO", null, 0),
  null,
);
check(
  "mover parado grava sem medicao",
  decidirMovimento("EM_ANDAMENTO", "ENTREGUE", null, 0)?.elapsedMs,
  null,
);
check(
  "mover contando mede do servidor",
  decidirMovimento(
    "EM_ANDAMENTO",
    "ENTREGUE",
    "2026-11-27T10:00:00.000Z",
    Date.parse("2026-11-27T10:01:00.000Z"),
  )?.elapsedMs,
  60_000,
);
check(
  "mover de status nulo sai de Nao Iniciado",
  decidirMovimento(null, "EM_ANDAMENTO", null, 0)?.fromStatus,
  "NAO_INICIADO",
);
check(
  "relogio invertido nao grava negativo",
  decidirMovimento(
    "EM_ANDAMENTO",
    "ENTREGUE",
    "2026-11-27T10:01:00.000Z",
    Date.parse("2026-11-27T10:00:00.000Z"),
  )?.elapsedMs,
  0,
);
// A PAUSA e uma movimentacao de mesmo status: e o unico jeito de registrar o
// trecho contado sem mover o card. Por isso `decidirMovimento` recusa o
// mesmo-status (acima) e `pausa` o aceita — sao perguntas diferentes.
check(
  "a pausa grava o trecho no proprio status",
  decidirMovimento(
    "EM_ANDAMENTO",
    "EM_ANDAMENTO",
    "2026-11-27T10:00:00.000Z",
    Date.parse("2026-11-27T10:00:30.000Z"),
    { pausa: true },
  ),
  { fromStatus: "EM_ANDAMENTO", toStatus: "EM_ANDAMENTO", elapsedMs: 30_000 },
);
check(
  "pausa sem contagem aberta nao grava nada",
  decidirMovimento("EM_ANDAMENTO", "EM_ANDAMENTO", null, 0, { pausa: true }),
  null,
);

console.log(falhas === 0 ? "\nTODAS OK" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
