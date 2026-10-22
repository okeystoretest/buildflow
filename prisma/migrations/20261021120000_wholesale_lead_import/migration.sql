-- CANDIDATURA IMPORTADA DE PLANILHA: cinco respostas passam a aceitar NULO.
--
-- A Gestao tinha as candidaturas antigas numa planilha, e ela nao registrava as
-- respostas da Secao 2/3 do formulario publico (modelo de atendimento, como nos
-- achou, faixa de investimento, visita) nem o tipo de foto da loja.
--
-- POR QUE NULO E NAO UM VALOR PADRAO: os dois enums de valor fechado tem
-- "OUTRO", e seria tentador usa-lo. Mas "OUTRO" e uma RESPOSTA — a ficha diria
-- a analista que a lojista respondeu "outro" quando ninguem perguntou nada. E
-- `wantsVisit` nao tem nem isso: `false` leria como "nao quer visita". A faixa
-- de investimento e a pior das cinco: ela e numerica e entraria em qualquer
-- leitura por faixa como se fosse declarada.
--
-- O formulario publico continua exigindo as cinco (validateApplyPayload nao
-- mudou): o nulo e exclusivo de quem veio pela importacao.
--
-- Reversivel e sem perda: DROP NOT NULL nao altera nenhuma linha existente.

ALTER TABLE "WholesaleLead" ALTER COLUMN "serviceModel"   DROP NOT NULL;
ALTER TABLE "WholesaleLead" ALTER COLUMN "storeImageKind" DROP NOT NULL;
ALTER TABLE "WholesaleLead" ALTER COLUMN "foundUs"        DROP NOT NULL;
ALTER TABLE "WholesaleLead" ALTER COLUMN "investmentBand" DROP NOT NULL;
ALTER TABLE "WholesaleLead" ALTER COLUMN "wantsVisit"     DROP NOT NULL;

-- CHAVE DA PLANILHA: marca a origem e torna a importacao repetivel.
--
-- Sem ela, reimportar o arquivo corrigido criava a candidatura de novo, e nao
-- havia como distinguir o que veio da planilha do que veio do formulario — uma
-- limpeza por "dados importados" nao teria clausula WHERE confiavel.
--
-- NULO = formulario publico. O Postgres aceita varios NULL num indice unico,
-- entao as candidaturas do formulario nao disputam a chave entre si; so as
-- importadas, que e onde a unicidade importa. Mesmo arranjo que
-- "Campaign_selectBrand_key" ja usa neste banco.
ALTER TABLE "WholesaleLead" ADD COLUMN IF NOT EXISTS "importKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "WholesaleLead_importKey_key"
  ON "WholesaleLead" ("importKey");
