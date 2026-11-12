/**
 * Checagem da retenção das candidaturas (LGPD Art. 16).
 *
 * Confere a ARITMÉTICA e a FRONTEIRA, que é o que se pode conferir sem banco:
 * `expurgarCandidaturasVencidas` fala com o Prisma e não entra aqui. O que
 * importa travar é o cálculo do limite e o sentido da comparação — um erro de
 * sinal apaga tudo, e um `<=` no lugar de `<` apaga um dia antes do prometido.
 *
 * Rode com: npx tsx scripts/checks/wholesale-retention.ts
 */
import { RETENCAO_DIAS, limiteDeRetencao, filtroDoExpurgo } from "../../src/lib/wholesale-retention";
import { chaveDeImportacao } from "../../src/lib/wholesale-import";
import { WHOLESALE_CONTENT } from "../../src/lib/wholesale-content";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`${ok ? "ok" : "FALHOU"} ${nome}`);
  if (!ok) {
    falhas++;
    console.log(`  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const DIA = 24 * 60 * 60 * 1000;
const agora = new Date("2026-10-16T12:00:00.000Z");

check("o prazo e de 90 dias", RETENCAO_DIAS, 90);

// O limite fica 90 dias ATRAS de agora. Sinal invertido poria o limite no
// futuro, e aí TODA candidatura estaria vencida — o expurgo apagaria a base.
const limite = limiteDeRetencao(agora);
check("o limite fica no passado", limite.getTime() < agora.getTime(), true);
check("o limite fica 90 dias atras", agora.getTime() - limite.getTime(), 90 * DIA);
check("o limite de 16/10 cai em 18/07", limite.toISOString().slice(0, 10), "2026-07-18");

// A fronteira, nos tres pontos que importam. O expurgo usa `createdAt < limite`.
const umMsAntes = new Date(limite.getTime() - 1);
const exatamenteNoLimite = new Date(limite.getTime());
const umMsDepois = new Date(limite.getTime() + 1);
check("candidatura 1ms mais velha que o limite vence", umMsAntes < limite, true);
check("candidatura exatamente no limite NAO vence", exatamenteNoLimite < limite, false);
check("candidatura 1ms mais nova que o limite NAO vence", umMsDepois < limite, false);

// Uma candidatura de hoje nunca pode estar vencida. Se esta linha ficar
// vermelha, o expurgo esta apagando o cadastro que acabou de chegar.
check("candidatura de hoje nao vence", agora < limite, false);

// Fuso: o calculo e em milissegundos de epoch, nao em componentes de data, para
// nao depender do fuso da maquina que roda a rotina. O mesmo instante avaliado
// com offset diferente tem de dar o mesmo limite.
const mesmoInstanteOutroFuso = new Date("2026-10-16T09:00:00.000-03:00");
check(
  "o limite nao depende do fuso",
  limiteDeRetencao(mesmoInstanteOutroFuso).getTime(),
  limite.getTime(),
);

// O numero que a PAGINA promete e o mesmo que o job usa. Esta e a razao de o
// aviso do rodape ler `privacidade.retencaoDias` em vez de trazer "90" escrito.
for (const marca of ["OKEY", "LOV_CLUB"] as const) {
  check(
    `o aviso da ${marca} promete o mesmo prazo que o expurgo`,
    WHOLESALE_CONTENT[marca].privacidade.retencaoDias,
    RETENCAO_DIAS,
  );
}


// --- QUEM O PRAZO ALCANÇA (decisão do dono, 12/11/2026) --------------------
// Os 90 dias valem para quem preencheu a LP. A candidatura carregada da
// planilha antiga não passou por lá e não tem essa promessa.
//
// Por que isto é uma checagem e não só um comentário: planilha histórica é,
// por definição, de mais de 90 dias. Enquanto o recorte não existia, TODA
// linha importada nascia vencida e sumia — com as fotos — na passada seguinte
// do expurgo. A Gestão importava e, na volta, encontrava a tela como antes.
// Uma cláusula apagada aqui num refactor repõe exatamente esse defeito, e ele
// é silencioso: ninguém reporta dado que desapareceu, só reimporta.
const filtro = filtroDoExpurgo(agora);
check("o expurgo olha so quem veio do formulario", filtro.importKey, null);
check("o expurgo mantem o corte por data", filtro.createdAt.lt.getTime(), limite.getTime());

// E as duas pontas têm de concordar sobre o que é "importada": `importKey`
// nulo é a candidatura do formulário, preenchido é a da planilha. Se
// `chaveDeImportacao` algum dia devolver vazio, o `importKey: null` acima
// passaria a casar com a planilha também, e o expurgo voltaria a apagá-la.
const chave = chaveDeImportacao({
  brand: "OKEY",
  cnpj: "11222333000181",
  phone: "85988887777",
  contactName: "Ana",
});
check("candidatura de planilha nasce COM chave", chave.length > 0, true);
check("a chave e reconhecivel como de planilha", chave.startsWith("planilha:"), true);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-retention: todas as checagens passaram.");
