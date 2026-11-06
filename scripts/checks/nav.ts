/**
 * Checagem do mapa de navegacao da barra lateral.
 *
 * O que esta em jogo e o que cada papel VE no menu. Um erro aqui nao abre
 * porta nenhuma — toda pagina confere o papel com `requireRole` — mas some
 * com a ferramenta do menu de quem precisa dela, e isso ninguem reporta como
 * bug: a pessoa so acha que o sistema nao tem aquilo.
 *
 * Rode com: npx tsx scripts/checks/nav.ts
 */
import {
  navParaSessao,
  moduloAtivo,
  ferramentaAtiva,
  escolherFavoritos,
  FAVORITO_FIXO,
  sanitizarUsos,
  MAX_FAVORITOS,
  MIN_USOS_FAVORITO,
  NAV,
  CONFIG,
  type NavModule,
} from "../../src/app/(dashboard)/nav";
import type { Role } from "@prisma/client";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`${ok ? "ok" : "FALHOU"} ${nome}`);
  if (!ok) {
    falhas++;
    console.log(`  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const bases = (role: Parameters<typeof navParaSessao>[0], flags = {}) =>
  navParaSessao(role, flags).map((m) => m.base);
const tools = (role: Parameters<typeof navParaSessao>[0], mod: string, flags = {}) =>
  navParaSessao(role, flags).find((m) => m.base === mod)?.tools.map((t) => t.href) ?? [];

// --- modulos por papel ------------------------------------------------------
check("GESTAO ve todos os modulos", bases("GESTAO").length, NAV.length);
// Gestao virou o botao de configuracoes do rodape: nao pode voltar a lista.
check("Gestao nao e um modulo da lista", NAV.some((m) => m.base === "/gestao"), false);
check("Configuracoes e so da GESTAO", CONFIG.roles, ["GESTAO"]);
check("MOTORISTA so ve o modulo dele", bases("MOTORISTA"), ["/motorista"]);
check("FINANCEIRO nao ve Logistica", bases("FINANCEIRO"), ["/fluxo", "/vendas", "/financeiro"]);

// --- a flag LIBERA, nunca restringe ----------------------------------------
// A vendedora de loja de fluxo simplificado entra em Logistica; a de loja
// padrao nao. Era a unica excecao do layout antigo e precisa sobreviver.
check("VENDAS sem loja simplificada nao ve Logistica", bases("VENDAS").includes("/logistica"), false);
check("VENDAS com loja simplificada ve Logistica", bases("VENDAS", { lojaSimplificada: true }).includes("/logistica"), true);
// Ela entra no modulo, mas as ferramentas sao de LOGISTICA/GESTAO: o quadro e
// tudo que ela deve ver.
check("...mas sem as ferramentas de Logistica", tools("VENDAS", "/logistica", { lojaSimplificada: true }), []);
// 6 = o quadro de entrada (Fluxo de Pedidos (LOG)) + os 5 relatorios.
check("LOGISTICA ve as 6 ferramentas de Logistica", tools("LOGISTICA", "/logistica").length, 6);

// --- ferramentas por papel dentro do modulo --------------------------------
// LOGISTICA entra em Motorista por Chamados e Dashboard, e NAO ve Entregas.
check("LOGISTICA em Motorista: sem Entregas", tools("LOGISTICA", "/motorista"), ["/motorista/chamados", "/motorista/dashboard"]);
check("MOTORISTA em Motorista: sem Dashboard", tools("MOTORISTA", "/motorista"), ["/motorista", "/motorista/chamados"]);
// "Meus Selects" e so da vendedora: Gestao e Financeiro tem /financeiro/select.
check("Meus Selects so para VENDAS", tools("GESTAO", "/vendas").includes("/vendas/select"), false);
check("...e aparece para VENDAS", tools("VENDAS", "/vendas").includes("/vendas/select"), true);
// Analise de Clientes depende da regra de atacado, nao do papel.
check("Analise de Clientes escondida sem a flag", tools("GESTAO", "/vendas").includes("/vendas/analise-clientes"), false);
check("Analise de Clientes com a flag", tools("GESTAO", "/vendas", { podeAnalisar: true }).includes("/vendas/analise-clientes"), true);

// --- clique no setor nao navega -------------------------------------------
// Pedido de 04/11/2026: clicar num setor so abre a lista de ferramentas. A
// abertura automatica da primeira foi desfeita, e e facil alguem recolocar um
// href "obvio" aqui sem perceber que muda o comportamento do menu inteiro.
for (const m of NAV) {
  if (m.tools.length === 0) {
    check(`${m.label}: tela unica aponta para si`, m.href, m.base);
  } else {
    check(`${m.label}: setor com ferramentas nao navega`, m.href, null);
  }
}

// --- rotulos e ordem, como o dono pediu ------------------------------------
// A ordem do menu e decisao de quem usa o sistema, nao consequencia do codigo:
// se alguem reordenar ou renomear sem pedido, isto quebra.
const rotulos = (base: string) => NAV.find((m) => m.base === base)!.tools.map((t) => t.label);
check("ordem do Comercial", rotulos("/vendas"), [
  "Cadastro de Clientes", "Gestão de Excursões", "Lançar Pedidos", "Qualificação de Clientes",
  "Agenda de Tarefas", "Vendas Realizadas", "Resultados de Campanhas", "Meus Selects",
  "Cronograma de Conteúdo",
  // Vitrine no fim, ao lado do Cronograma (pedido do dono, 06/11/2026): as duas
  // leem do Build.Connect e nenhuma escreve.
  "Vitrine",
]);
check("rotulos do Financeiro", rotulos("/financeiro"), [
  "Gestão de Pedidos", "Registo de Pedidos", "Contratos Select", "Repasse a Motoristas",
  "Situação do Pagamento", "Registro de Bancos", "Meios de Pagamento", "Empresas / CNPJs",
]);
check("rotulos da Logistica", rotulos("/logistica"), [
  "Movimentação de Pedidos", "Controle de Peças", "Controle de Pendências",
  "Monitor de Atrasos", "Tempo de Preparação", "Histórico de Entregas",
]);
// "Lançar Pedidos" vai para a INDEX do modulo (lista de pedidos + acoes), e
// nao para o formulario /vendas/novo.
check("Lançar Pedidos aponta para a index do Comercial", NAV.find((m) => m.base === "/vendas")!.tools.find((t) => t.label === "Lançar Pedidos")?.href, "/vendas");
check("o formulario /vendas/novo nao e item de menu", NAV.flatMap((m) => m.tools).some((t) => t.href === "/vendas/novo"), false);

// --- modulo ativo: prefixo mais longo --------------------------------------
const mods = NAV.map((m) => ({ base: m.base }));
// Sem "prefixo mais longo", /motorista venceria por vir antes na lista.
check("rota funda acende o modulo certo", moduloAtivo("/motorista/chamados/historico", mods), "/motorista");
check("rota exata acende o modulo", moduloAtivo("/vendas", mods), "/vendas");
// "/vendas-x" nao e filho de "/vendas": a barra tem que separar.
check("prefixo parecido nao acende", moduloAtivo("/vendas-outra-coisa", mods), null);
check("rota fora do mapa nao acende nada", moduloAtivo("/login", mods), null);

// --- integridade do mapa ----------------------------------------------------
const todosHrefs = NAV.flatMap((m) => [m.base, ...m.tools.map((t) => t.href)]);
check("nenhuma base duplicada entre modulos", new Set(NAV.map((m) => m.base)).size, NAV.length);
check("toda ferramenta vive sob a base do modulo", NAV.every((m) => m.tools.every((t) => t.href === m.base || t.href.startsWith(m.base + "/"))), true);
check("todo item tem rotulo", todosHrefs.length > 0 && NAV.every((m) => m.label !== "" && m.tools.every((t) => t.label !== "")), true);

/* ------------------------------------------------------------- favoritos */

// Quatro regras decidem o topo do menu (minimo, teto, existencia, desempate) e
// TODAS quebram em silencio: o menu continua abrindo, so com os atalhos
// errados. Ninguem reporta isso como bug.

const modsFav = navParaSessao("GESTAO", {});
const hrefsFav = modsFav.flatMap((m) => m.tools.map((t) => t.href));
const favsDe = (usos: Record<string, number>, m: NavModule[] = modsFav) =>
  escolherFavoritos(usos, m).map((f) => f.tool.href);

// MINIMO: abaixo do piso nao entra. Uma ferramenta aberta uma vez e acaso.
check(
  `abaixo de ${MIN_USOS_FAVORITO} aberturas nao vira favorito`,
  favsDe({ [hrefsFav[0]]: MIN_USOS_FAVORITO - 1 }),
  [],
);
check(
  `exatamente ${MIN_USOS_FAVORITO} ja vira`,
  favsDe({ [hrefsFav[0]]: MIN_USOS_FAVORITO }),
  [hrefsFav[0]],
);

// ORDEM: da mais aberta para a menos.
check(
  "ordena da mais aberta para a menos",
  favsDe({ [hrefsFav[0]]: 3, [hrefsFav[1]]: 9, [hrefsFav[2]]: 5 }),
  [hrefsFav[1], hrefsFav[2], hrefsFav[0]],
);

// TETO: o menu nao vira uma lista de tudo.
check(
  `no maximo ${MAX_FAVORITOS}`,
  favsDe(Object.fromEntries(hrefsFav.slice(0, MAX_FAVORITOS + 3).map((h, i) => [h, 50 - i]))).length,
  MAX_FAVORITOS,
);

// EXISTENCIA: o que nao esta no menu DESTA pessoa nao pode virar atalho —
// seria vazamento pela navegacao, e link quebrado no lugar mais visivel.
check(
  "href que nao existe no menu e ignorado",
  favsDe({ "/rota-que-nao-existe": 99, [hrefsFav[0]]: 3 }),
  [hrefsFav[0]],
);
const soVendasFav = navParaSessao("VENDAS", {});
const soDaGestaoFav = modsFav
  .flatMap((m) => m.tools.map((t) => t.href))
  .find((h) => !soVendasFav.flatMap((m) => m.tools.map((t) => t.href)).includes(h));
check(
  "ferramenta fora do menu da pessoa nao vira atalho dela",
  soDaGestaoFav ? favsDe({ [soDaGestaoFav]: 99 }, soVendasFav) : [],
  [],
);

// DESEMPATE estavel: com a mesma contagem a ordem nao pode dancar entre
// renders, senao o atalho muda de lugar debaixo do dedo.
const empateFav = { [hrefsFav[1]]: 7, [hrefsFav[0]]: 7 };
check("empate resolve igual nas duas chamadas", favsDe(empateFav), favsDe(empateFav));

// HIGIENE do valor que vem do navegador: pode ter sido editado a mao.
check("texto no lugar do numero sai", sanitizarUsos({ "/a": "9", "/b": 4 }), { "/b": 4 });
check("negativo e zero saem", sanitizarUsos({ "/a": -3, "/b": 0, "/c": 1 }), { "/c": 1 });
check("NaN e Infinity saem", sanitizarUsos({ "/a": NaN, "/b": Infinity, "/c": 2 }), { "/c": 2 });
check("lista no lugar do objeto vira vazio", sanitizarUsos([1, 2]), {});
check("nulo vira vazio", sanitizarUsos(null), {});

/* --------------------------------------------- qual ferramenta esta acesa */

// O par /vendas (Lancar Pedidos) e /vendas/clientes (Cadastro de Clientes): um
// href e PREFIXO do outro. Chamado com a lista inteira, so a mais especifica
// acende; chamado com uma ferramenta por vez, as duas acendiam — foi o defeito
// dos Favoritos em 05/11/2026.
const parDeVendas = [{ href: "/vendas" }, { href: "/vendas/clientes" }];
check("prefixo mais longo vence", ferramentaAtiva("/vendas/clientes", parDeVendas), "/vendas/clientes");
check("a mais curta sozinha acende", ferramentaAtiva("/vendas", parDeVendas), "/vendas");
check("subrota da mais longa continua nela", ferramentaAtiva("/vendas/clientes/9", parDeVendas), "/vendas/clientes");
check("ordem da lista nao decide", ferramentaAtiva("/vendas/clientes", [...parDeVendas].reverse()), "/vendas/clientes");
// Separa de verdade: /vendas-outra-coisa NAO e filha de /vendas.
check("irma com nome parecido nao casa", ferramentaAtiva("/vendas-outra", parDeVendas), null);
check("fora de todas devolve nulo", ferramentaAtiva("/financeiro", parDeVendas), null);

/* ------------------------------------------------- favorito fixo por papel */

// FAVORITO_FIXO quebra em silencio de DOIS jeitos, e nenhum aparece como bug:
// href com erro de digitacao (nao mostra atalho nenhum) e ferramenta que o
// papel deixou de ver (o atalho desaparece e ninguem liga uma coisa a outra).

const todasAsFerramentas = NAV.flatMap((m) => m.tools.map((t) => t.href));
for (const [papel, href] of Object.entries(FAVORITO_FIXO)) {
  check(`${papel}: o href fixo existe no NAV`, todasAsFerramentas.includes(href!), true);
  const doPapel = navParaSessao(papel as Role, {}).flatMap((m) => m.tools.map((t) => t.href));
  check(`${papel}: o papel VE a propria ferramenta fixa`, doPapel.includes(href!), true);
}

// GESTAO fica de fora de proposito: atravessa os quatro setores, nao tem uma
// ferramenta principal, e um palpite gastaria uma das quatro vagas dela.
check("GESTAO nao tem fixo", FAVORITO_FIXO.GESTAO, undefined);

const modsVendas = navParaSessao("VENDAS", {});
const FIXO_VENDAS = "/vendas";
const ferramentasVendas = modsVendas.flatMap((m) => m.tools.map((t) => t.href));
const outras = ferramentasVendas.filter((h) => h !== FIXO_VENDAS);
const favVendas = (usos: Record<string, number>) =>
  escolherFavoritos(usos, modsVendas, FIXO_VENDAS).map((f) => f.tool.href);

// Sem isto, a checagem do teto mais abaixo passaria sem testar nada.
check("Vendas tem ferramentas suficientes para testar o teto", outras.length >= MAX_FAVORITOS + 2, true);

// SEM USO NENHUM o fixo ja aparece: e exatamente o vao que ele existe para cobrir.
check("fixo aparece com zero uso", favVendas({}), [FIXO_VENDAS]);

// PRIMEIRO SEMPRE, mesmo perdendo no uso por muito.
check(
  "fixo fica em primeiro mesmo com outras muito mais usadas",
  favVendas({ [outras[0]]: 99, [outras[1]]: 50 })[0],
  FIXO_VENDAS,
);

// NAO DUPLICA quando a propria fixa tambem passa do minimo de usos.
const comUso = favVendas({ [FIXO_VENDAS]: 20, [outras[0]]: 5 });
check("fixo nao aparece duas vezes", comUso.filter((h) => h === FIXO_VENDAS).length, 1);
check("fixo usada continua em primeiro", comUso[0], FIXO_VENDAS);

// O TETO CONTA O FIXO: ele ocupa uma das quatro vagas, nao soma uma quinta.
const lotado = favVendas(
  Object.fromEntries(outras.slice(0, MAX_FAVORITOS + 2).map((h, i) => [h, 90 - i])),
);
check("teto continua valendo com o fixo dentro", lotado.length, MAX_FAVORITOS);
check("com o teto lotado o fixo ainda e o primeiro", lotado[0], FIXO_VENDAS);

// FIXO FORA DO MENU DA PESSOA nao entra: o mapa nao e porta lateral para uma
// ferramenta que o papel nao ve. /financeiro e ferramenta do Financeiro.
check(
  "fixo que o papel nao ve nao entra",
  escolherFavoritos({}, modsVendas, "/financeiro").map((f) => f.tool.href),
  [],
);

// Papel SEM fixo (Gestao) segue so pelo uso, como antes.
check("sem fixo, zero uso da lista vazia", escolherFavoritos({}, modsVendas, undefined), []);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("nav: todas as checagens passaram.");
