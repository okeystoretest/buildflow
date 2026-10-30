// Checagem da importacao das candidaturas antigas (a planilha da Gestao).
// Rodar com: npx tsx scripts/checks/wholesale-leads-import.ts
//
// O QUE ESTA EM JOGO: esta e a unica porta que grava candidatura SEM ninguem
// do outro lado para corrigir. No formulario publico a lojista ve a mensagem e
// arruma; aqui a planilha entra de madrugada e o defeito aparece semanas
// depois, numa lista que a Gestao usa para decidir quem revende a marca.
//
// Dois tipos de defeito importam, e os dois sao silenciosos:
//
// 1. FROUXIDAO — CNPJ de 13 digitos, UF inventada, Instagram com barra. Entram
//    no banco e quebram o aviso de repeticao (decisao 9), o filtro por estado e
//    qualquer link montado com o handle. Nada falha na hora da importacao.
//
// 2. INVENCAO — preencher o que a planilha nao tem. A ficha passa a AFIRMAR a
//    analista uma resposta que ninguem deu. A faixa de investimento e a pior:
//    e numerica, e seria lida como declarada.
//
// Por isso os campos se dividem em tres: obrigatorio (marca, nome), validado-se-
// preenchido (o resto do cadastro) e nulo-quando-vazio (as cinco respostas que a
// planilha nao tinha).
import {
  COLUNAS_IMPORT,
  chaveDeImportacao,
  converterLinha,
  ehEmail,
  mapearCabecalho,
  modeloCsv,
  normalizarNome,
} from "../../src/lib/wholesale-import";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`${ok ? "ok" : "FALHOU"} ${nome}`);
  if (!ok) {
    falhas++;
    console.log(`  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  }
}

const CABECALHO = COLUNAS_IMPORT.map((c) => c.nome);
const col = mapearCabecalho(CABECALHO);
check("o cabecalho do proprio modelo e reconhecido", col !== null, true);
if (!col) {
  console.log("\nsem mapa de cabecalho, o resto nao faz sentido.");
  process.exit(1);
}

/** Monta uma linha na ordem do modelo a partir de pares coluna=valor. */
function linha(valores: Record<string, string>): string[] {
  return CABECALHO.map((nome) => valores[nome] ?? "");
}
const erroDe = (valores: Record<string, string>): string => {
  const r = converterLinha(linha(valores), col);
  return "ok" in r ? "(aceitou)" : r.error;
};
const leadDe = (valores: Record<string, string>) => {
  const r = converterLinha(linha(valores), col);
  if (!("ok" in r)) throw new Error(`esperava aceitar, recusou: ${r.error}`);
  return r.lead;
};

// --- cabecalho -------------------------------------------------------------
// Por NOME e nao por posicao: quem preenche no Excel reordena e insere colunas
// sem perceber que isso importava. Lido por posicao, um arrasto gravaria cidade
// no campo de CNPJ — e passaria, porque os dois sao texto.
const trocado = mapearCabecalho(["nome", "marca", "cnpj"]);
check("mapeia por nome, em qualquer ordem", trocado && trocado["marca"], 1);
check("aceita cabecalho com acento e maiuscula", mapearCabecalho(["MARCA", "Nome"]) !== null, true);
check("sem marca/nome nao e cabecalho", mapearCabecalho(["a", "b", "c"]), null);

// --- o minimo: marca e nome ------------------------------------------------
const minimo = leadDe({ marca: "OKEY", nome: "Ana Paula" });
check("minimo aceito: marca + nome", minimo.contactName, "Ana Paula");
check("minimo: status assume EM_ANALISE", minimo.status, "EM_ANALISE");
check("minimo: texto sem dado fica vazio, nao nulo", [minimo.email, minimo.city, minimo.story], ["", "", ""]);
check(
  "minimo: as cinco respostas da planilha velha ficam NULAS",
  [minimo.serviceModel, minimo.foundUs, minimo.investmentBand, minimo.wantsVisit, minimo.storeImageKind],
  [null, null, null, null, null],
);
check("minimo: sem data, quem datar e o banco", minimo.createdAt, null);
check("marca ausente recusa", erroDe({ nome: "Ana" }), "marca é obrigatória (OKEY ou LOV_CLUB).");
check("nome ausente recusa", erroDe({ marca: "OKEY" }), "nome é obrigatório.");
check(
  "marca invalida recusa com a lista",
  erroDe({ marca: "OKEYY", nome: "Ana" }),
  'marca inválido ("OKEYY"). Use: OKEY, LOV_CLUB.',
);
// Acento: quem preenche copia o rotulo DA TELA ("Em analise"), nao o nome do
// enum. Recusar a grafia certa seria recusar quem fez o obvio.
check("status com acento e espaco e aceito", leadDe({ marca: "OKEY", nome: "Ana", status: "Em análise" }).status, "EM_ANALISE");
check("status vazio assume Em analise", leadDe({ marca: "OKEY", nome: "Ana" }).status, "EM_ANALISE");
check(
  "modelo de atendimento com acento e aceito",
  leadDe({ marca: "OKEY", nome: "Ana", modelo_atendimento: "Física e online" }).serviceModel,
  "FISICA_E_ONLINE",
);
// "lov club" com espaco: e assim que esta escrito numa planilha de gente.
check("marca com espaco no lugar do sublinhado passa", leadDe({ marca: "lov club", nome: "Ana" }).brand, "LOV_CLUB");

// --- validado se preenchido ------------------------------------------------
const base = { marca: "OKEY", nome: "Ana" };
check("CNPJ formatado vira so digitos", leadDe({ ...base, cnpj: "12.345.678/0001-95" }).cnpj, "12345678000195");
check("CNPJ com digito errado recusa", erroDe({ ...base, cnpj: "12.345.678/0001-99" }), 'CNPJ inválido ("12.345.678/0001-99").');
check("CNPJ curto recusa", erroDe({ ...base, cnpj: "1234567800019" }), 'CNPJ inválido ("1234567800019").');
check("telefone formatado vira so digitos", leadDe({ ...base, telefone: "(11) 98765-4321" }).phone, "11987654321");
check("telefone sem DDD recusa", erroDe({ ...base, telefone: "98765-4321" }), 'telefone inválido ("98765-4321").');
check("UF minuscula sobe para maiuscula", leadDe({ ...base, uf: "sp" }).state, "SP");
check("UF que nao existe recusa", erroDe({ ...base, uf: "XX" }), 'UF inválida ("XX").');
check("e-mail sem ponto no dominio recusa", erroDe({ ...base, email: "ana@loja" }), 'e-mail inválido ("ana@loja").');
// O que a lojista realmente cola do celular.
check(
  "URL de perfil do Instagram vira handle",
  leadDe({ ...base, instagram: "https://www.instagram.com/lojadaana/" }).instagram,
  "lojadaana",
);
check("Instagram com caractere fora da gramatica recusa", erroDe({ ...base, instagram: "loja da ana" }), 'Instagram inválido ("loja da ana").');

// --- datas -----------------------------------------------------------------
// MEIO-DIA UTC e deliberado: o conteiner roda em UTC e o pais e UTC-3, entao
// meia-noite UTC de 15/03 e 21h de 14/03 em Sao Paulo — a candidatura
// apareceria datada de um dia antes do que a planilha diz.
check(
  "dd/mm/aaaa vira meio-dia UTC",
  leadDe({ ...base, data_recebimento: "15/03/2026" }).createdAt?.toISOString(),
  "2026-03-15T12:00:00.000Z",
);
check("aaaa-mm-dd tambem serve", leadDe({ ...base, data_recebimento: "2026-03-15" }).createdAt?.toISOString(), "2026-03-15T12:00:00.000Z");
// 31/02 o Date rola para 03/03 em silencio: e o erro que ninguem ve.
check("31/02 recusa em vez de virar 03/03", erroDe({ ...base, data_recebimento: "31/02/2026" }), 'data_recebimento inválida ("31/02/2026").');
check("data em texto recusa", erroDe({ ...base, data_recebimento: "marco" }), 'data_recebimento inválida ("marco").');

// --- visita: tres estados --------------------------------------------------
// `false` nao serve de "nao informado": leria como "nao quer visita".
check("quer_visita vazio e NULO", leadDe(base).wantsVisit, null);
check("quer_visita sim", leadDe({ ...base, quer_visita: "Sim" }).wantsVisit, true);
check("quer_visita nao (com acento)", leadDe({ ...base, quer_visita: "Não" }).wantsVisit, false);
check("quer_visita com lixo recusa", erroDe({ ...base, quer_visita: "talvez" }), 'quer_visita inválido ("talvez"). Use sim ou nao.');

// --- decisao ---------------------------------------------------------------
const reprovada = leadDe({ ...base, status: "REPROVADO", motivo_reprovacao: "01" });
check("reprovada com codigo valido passa", [reprovada.status, reprovada.rejectionCode], ["REPROVADO", "01"]);
// O Excel trata "01" como numero e salva "1". Sem o padding, TODO motivo
// digitado a mao seria recusado e pareceria defeito da importacao.
check(
  "codigo que o Excel comeu o zero ainda casa",
  leadDe({ ...base, status: "REPROVADO", motivo_reprovacao: "1" }).rejectionCode,
  "01",
);
check("codigo de motivo inexistente recusa", erroDe({ ...base, status: "REPROVADO", motivo_reprovacao: "999" }), 'motivo_reprovacao inválido ("999").');
// O `rejectionCode` e o que a LISTA exibe: num aprovado, ele leria como reprovacao.
check(
  "motivo em candidatura aprovada recusa",
  erroDe({ ...base, status: "APROVADO", motivo_reprovacao: "01" }),
  "motivo_reprovacao só vale com status REPROVADO.",
);
check("reprovada SEM codigo passa (a tela sabe exibir isso)", leadDe({ ...base, status: "REPROVADO" }).rejectionCode, null);
// Decisao 8: CUIDADO sem justificativa e um alerta que ninguem sabe interpretar.
check("CUIDADO sem justificativa recusa", erroDe({ ...base, status: "CUIDADO" }), "status CUIDADO exige motivo_cuidado.");
check("CUIDADO com justificativa passa", leadDe({ ...base, status: "CUIDADO", motivo_cuidado: "CNPJ de terceiro" }).cautionReason, "CNPJ de terceiro");
// Decisao 19: o atendente e exibido em maiusculas, e a action da tela ja grava assim.
// A coluna "atendente" da planilha e a VENDEDORA DONA, e vincula de verdade
// (`sellerId`). Quem resolve para id e a action, que tem o banco; aqui so se
// prova que o valor chega inteiro, sem maiusculizar — nome e nome.
check("atendente vira a referencia da vendedora", leadDe({ ...base, atendente: "Mariana Alves" }).sellerRef, "Mariana Alves");
check("atendente aceita e-mail no lugar do nome", leadDe({ ...base, atendente: "ana@loja.com" }).sellerRef, "ana@loja.com");
check("atendente vazio nao inventa dona", leadDe(base).sellerRef, null);
// A coluna "auxiliar" e que alimenta a coluna Auxiliar da lista: texto livre,
// exibido em maiusculas (decisao 19), sem vinculo com usuario nenhum.
check("auxiliar sobe para maiusculas", leadDe({ ...base, auxiliar: "mariana" }).assistantName, "MARIANA");
check("auxiliar vazio fica nulo", leadDe(base).assistantName, null);
check("decidido_por chega inteiro", leadDe({ ...base, decidido_por: "gestao@empresa.com" }).decidedByRef, "gestao@empresa.com");

// --- compra: o eixo que entrou em 30/10/2026 -------------------------------
// Antes era o status "COMPROU". Virou coluna propria, e esta secao prende as
// tres coisas que a importacao tem de acertar: o default, a grafia que a Gestao
// de fato digita, e a planilha incoerente.
const aprovada = { marca: "OKEY", nome: "Ana", status: "APROVADO" };
// Planilha ANTIGA nao tem a coluna. Le "" e cai em CADENCIA, que e onde toda
// aprovada comeca — nao em COMPROU, e nao em nulo.
check("compra vazia vira CADENCIA", leadDe(base).purchaseState, "CADENCIA");
check("compra vazia em aprovada tambem vira CADENCIA", leadDe(aprovada).purchaseState, "CADENCIA");
// Quem preenche COPIA O ROTULO DA TELA, com acento e espaco — nao o nome do
// enum. Recusar "Nao comprou" seria recusar a grafia certa.
check("compra com acento e espaco e aceita", leadDe({ ...aprovada, compra: "Não comprou" }).purchaseState, "NAO_COMPROU");
check("compra em caixa baixa e aceita", leadDe({ ...aprovada, compra: "comprou" }).purchaseState, "COMPROU");
check("compra com hifen e aceita", leadDe({ ...aprovada, compra: "nao-comprou" }).purchaseState, "NAO_COMPROU");
check("compra inventada recusa", erroDe({ ...aprovada, compra: "TALVEZ" }), 'compra inválido ("TALVEZ"). Use: CADENCIA, COMPROU, NAO_COMPROU.');
// A MESMA invariante de `resolvePurchase`, na porta da importacao. Recusada com
// o motivo, e nao normalizada: escolher um dos dois lados por ela seria um
// palpite nosso sobre o negocio de uma empresa real.
check(
  "compra em candidatura nao aprovada recusa",
  erroDe({ marca: "OKEY", nome: "Ana", compra: "COMPROU" }),
  'compra "COMPROU" exige status APROVADO (veio "EM_ANALISE"). Corrija a linha: ou a candidatura foi aprovada, ou ela não tem compra.',
);
check(
  "compra em reprovada recusa",
  erroDe({ marca: "OKEY", nome: "Ana", status: "REPROVADO", motivo_reprovacao: "11", compra: "NAO_COMPROU" }),
  'compra "NAO_COMPROU" exige status APROVADO (veio "REPROVADO"). Corrija a linha: ou a candidatura foi aprovada, ou ela não tem compra.',
);
// CADENCIA explicito NAO e incoerencia: e o default escrito a mao, e recusa-lo
// faria o proprio modelo baixado ser recusado quando a linha nao e aprovada.
check("CADENCIA explicito passa em qualquer status", leadDe({ marca: "OKEY", nome: "Ana", compra: "CADENCIA" }).purchaseState, "CADENCIA");
// O VALOR LEGADO NA COLUNA ERRADA. Planilha antiga com "COMPROU" em `status` e
// recusada COM MENSAGEM. Aceitar em silencio cairia no default EM_ANALISE e
// zeraria a compra de uma lojista que comprou — sem ninguem notar.
check(
  "COMPROU na coluna status recusa (saiu do eixo)",
  erroDe({ marca: "OKEY", nome: "Ana", status: "COMPROU" }),
  'status inválido ("COMPROU"). Use: EM_ANALISE, APROVADO, REPROVADO, CUIDADO.',
);

// --- a regra de casamento por nome (usada pela action) ---------------------
// Espaco duplo e acento sao invisiveis em planilha: comparar cru faria a
// importacao recusar o nome certo.
check("nome: acento, caixa e espaco duplo colapsam", normalizarNome("  Mariana   Álves "), "mariana alves");
check("nome: duas grafias da mesma pessoa casam", normalizarNome("MARIANA ALVES") === normalizarNome("Mariana Álves"), true);
check("nome: pessoas diferentes nao casam", normalizarNome("Ana Paula") === normalizarNome("Ana Paulo"), false);
check("e-mail e reconhecido pelo @", [ehEmail("ana@loja.com"), ehEmail("Ana Paula")], [true, false]);

// --- derivados -------------------------------------------------------------
check("loja online deriva o tipo de foto", leadDe({ ...base, modelo_atendimento: "LOJA_ONLINE" }).storeImageKind, "LOJA_ONLINE");
check("loja fisica deriva o tipo de foto", leadDe({ ...base, modelo_atendimento: "LOJA_FISICA" }).storeImageKind, "ESPACO_FISICO");

// --- linha curta -----------------------------------------------------------
// O Excel corta as colunas vazias do fim da linha. Isso e normal, nao erro.
const curta = converterLinha(["OKEY", "", "Ana"], col);
check("linha truncada pelo Excel ainda e lida", "ok" in curta && curta.lead.contactName, "Ana");

// --- a chave que torna a importacao repetivel -------------------------------
// Sem ela, reimportar a planilha corrigida criava a candidatura DE NOVO. A
// chave sai do conteudo (a planilha nao tem id), e e por ela que o upsert sabe
// que aquela linha ja entrou.
const chaveDe = (v: Record<string, string>) => chaveDeImportacao(leadDe(v));
const comCnpj = { marca: "OKEY", nome: "Ana", cnpj: "12.345.678/0001-95" };
check(
  "mesma linha, duas importacoes: mesma chave",
  chaveDe(comCnpj) === chaveDe({ ...comCnpj, cidade: "Campinas", status: "APROVADO" }),
  true,
);
// E o que impede a planilha de sobrescrever um cadastro real: quem vem do
// formulario fica com a chave NULA, e `planilha:` so existe aqui.
check("a chave se anuncia como da planilha", chaveDe(comCnpj).startsWith("planilha:"), true);
// Marca diferente, mesma empresa: sao duas candidaturas, uma por marca.
check(
  "mesma empresa em marcas diferentes nao colide",
  chaveDe(comCnpj) === chaveDe({ ...comCnpj, marca: "LOV_CLUB" }),
  false,
);
check(
  "CNPJs diferentes nao colidem",
  chaveDe(comCnpj) === chaveDe({ ...comCnpj, cnpj: "11.222.333/0001-81" }),
  false,
);
// Planilha antiga sem CNPJ: a identidade cai no telefone, e so entao no nome.
const semCnpj = { marca: "OKEY", nome: "Ana Paula", telefone: "(11) 98765-4321" };
check("sem CNPJ, a identidade e o telefone", chaveDe(semCnpj).includes("tel:11987654321"), true);
check(
  "sem CNPJ e sem telefone, e o nome",
  chaveDe({ marca: "OKEY", nome: "Ana Paula" }),
  "planilha:OKEY:nome:ana paula",
);
// O nome entra normalizado: "ANA  PAULA" e "Ana Paula" sao a mesma linha.
check(
  "o nome na chave ignora caixa e espaco duplo",
  chaveDe({ marca: "OKEY", nome: "ANA  PAULA" }) === chaveDe({ marca: "OKEY", nome: "Ana Paula" }),
  true,
);
// O CNPJ manda sobre o telefone: celular muda, CNPJ nao.
check(
  "com CNPJ, trocar o telefone nao muda a chave",
  chaveDe({ ...comCnpj, telefone: "(11) 98765-4321" }) === chaveDe(comCnpj),
  true,
);

// --- o arquivo-modelo ------------------------------------------------------
const modelo = modeloCsv();
check("modelo comeca com BOM (Excel pt-BR le UTF-8)", modelo.startsWith("﻿"), true);
check("modelo usa ; (separador do Excel pt-BR)", modelo.split("\n")[0].includes(";"), true);
check(
  "o cabecalho do modelo e exatamente as colunas declaradas",
  modelo.replace("﻿", "").split("\n")[0].split(";"),
  CABECALHO,
);
// A linha de exemplo tem de IMPORTAR: um modelo cujo proprio exemplo e recusado
// manda a Gestao procurar defeito na planilha dela.
const exemplo = modelo.replace("﻿", "").split("\n")[1].split(";");
const rExemplo = converterLinha(exemplo, col);
check("a linha de exemplo do modelo passa na validacao", "ok" in rExemplo, true);
if (!("ok" in rExemplo)) console.log(`  recusa=${rExemplo.error}`);
check("o exemplo tem tantas celulas quantas colunas", exemplo.length, CABECALHO.length);

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("wholesale-leads-import: todas as checagens passaram.");
