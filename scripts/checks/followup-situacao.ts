// Checagem do recorte de SITUACAO da lista de conversas (Acompanhamento).
// Rodar com: npx tsx scripts/checks/followup-situacao.ts
//
// O que esta em jogo: UMA regra que erra EM SILENCIO.
//
// `FollowUp.status` aceita nulo — todo registro quinzenal gravado antes de
// 17/11/2026 tem nulo — e em SQL `null <> 'ENTREGUE'` NAO e verdadeiro. Trocar
// o `OR` por um `{ not: "ENTREGUE" }` "mais simples" nao quebra o `tsc`, nao
// quebra o `next build` e nao da erro na tela: a aba "Em aberto" apenas passa a
// esconder justamente os registros antigos, que e o contrario do que ela
// promete. Nada no portao via isso ate esta checagem existir.
import { filtroDeSituacao } from "../../src/lib/validations/followup";

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

// --- os tres recortes -------------------------------------------------------
check("sem situacao nao filtra status", filtroDeSituacao(""), {});
check("situacao desconhecida nao filtra status", filtroDeSituacao("qualquer-coisa"), {});
check("concluidos e exatamente ENTREGUE", filtroDeSituacao("concluidos"), {
  status: "ENTREGUE",
});
check("abertos e o OR com os dois ramos", filtroDeSituacao("abertos"), {
  OR: [{ status: null }, { status: { not: "ENTREGUE" } }],
});

// --- o ponto exato que ja mordeu -------------------------------------------
// Separado da igualdade acima de proposito: se um dia a forma do `where` mudar
// por um motivo legitimo, esta linha continua dizendo o que nao pode sumir.
const abertos = filtroDeSituacao("abertos");
const ramos = Array.isArray(abertos.OR) ? abertos.OR : [];
check(
  "abertos TEM de ter um ramo aceitando status nulo",
  ramos.some((r) => r.status === null),
  true,
);
check(
  "abertos TEM de ter um ramo excluindo ENTREGUE",
  ramos.some(
    (r) => typeof r.status === "object" && r.status !== null && r.status.not === "ENTREGUE",
  ),
  true,
);

console.log(falhas === 0 ? "followup-situacao: OK" : `followup-situacao: ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
