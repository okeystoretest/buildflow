// Checagem do TETO dos campos de texto do Acompanhamento (One-on-One e Quinzenal).
// Rodar com: npx tsx scripts/checks/followup-texto.ts
//
// O que esta em jogo: a TELA prometer um numero e o SERVIDOR cobrar outro.
//
// O `maxLength` do formulario e o `.max()` do schema saem da mesma constante
// (`MAX_TEXTO`, `MAX_TOPICO`) para nao poderem divergir. O que a constante
// compartilhada NAO alcanca e o que esta checagem segura: que o schema cobra de
// fato o numero exportado, e que o tema do Quinzenal continua com o teto curto
// proprio dele.
//
// Sem isto, trocar `textoOpcional(MAX_TOPICO)` por `textoOpcional()` num
// refactor nao quebra o `tsc`, nao quebra o `next build` e nao da erro na tela:
// o campo passa a deixar digitar 4.000 e o servidor recusa em 1.001 — e quem
// escreveu perde o texto no salvar, que e o unico momento em que descobre.
import { followUpSchema, MAX_TEXTO, MAX_TOPICO } from "../../src/lib/validations/followup";

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

/** Sem espaco: o schema da `.trim()` antes do `.max()`, e o teste mede o teto. */
const enche = (n: number) => "x".repeat(n);

const base = {
  collaboratorId: "cmxxxxxxxxxxxxxxxxxxxxxxx",
  heldOn: "2026-11-18",
  strengths: "ponto forte",
  improvement: "ponto de desenvolvimento",
  collaboratorView: "percepcao do colaborador",
  actionPlan: "plano de acao",
};
const quinzenal = (patch: Record<string, string>) =>
  followUpSchema.safeParse({ ...base, kind: "QUINZENAL", topic: "tema", ...patch }).success;
const umAum = (patch: Record<string, string>) =>
  followUpSchema.safeParse({ ...base, kind: "ONE_ON_ONE", performance: "indicadores", ...patch }).success;

// --- o teto comum, nas duas bordas ------------------------------------------
check("o payload base e valido (senao todo teste abaixo mente)", quinzenal({}), true);
check(`campo comum aceita exatamente ${MAX_TEXTO}`, quinzenal({ strengths: enche(MAX_TEXTO) }), true);
check(`campo comum recusa ${MAX_TEXTO + 1}`, quinzenal({ strengths: enche(MAX_TEXTO + 1) }), false);
check(`campo opcional aceita exatamente ${MAX_TEXTO}`, quinzenal({ support: enche(MAX_TEXTO) }), true);
check(`campo opcional recusa ${MAX_TEXTO + 1}`, quinzenal({ support: enche(MAX_TEXTO + 1) }), false);

// --- o tema do Quinzenal tem teto PROPRIO -----------------------------------
check("o tema tem teto proprio, menor que o comum", MAX_TOPICO < MAX_TEXTO, true);
check(`tema aceita exatamente ${MAX_TOPICO}`, quinzenal({ topic: enche(MAX_TOPICO) }), true);
check(`tema recusa ${MAX_TOPICO + 1}`, quinzenal({ topic: enche(MAX_TOPICO + 1) }), false);

// --- o campo exclusivo do One-on-One ----------------------------------------
check(`desempenho aceita exatamente ${MAX_TEXTO}`, umAum({ performance: enche(MAX_TEXTO) }), true);
check(`desempenho recusa ${MAX_TEXTO + 1}`, umAum({ performance: enche(MAX_TEXTO + 1) }), false);

console.log(falhas === 0 ? "followup-texto: OK" : `followup-texto: ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
