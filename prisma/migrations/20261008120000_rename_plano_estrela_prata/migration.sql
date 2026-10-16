-- Plano 1 do Select passa a se chamar "Estrela Prata".
--
-- Por que uma migration e nao so o seed: o seed e idempotente POR NOME
-- (findFirst where name). Trocar o nome la sozinho faria a proxima execucao
-- nao encontrar "Estrela Prata", CRIAR um plano novo e deixar o "Estrela"
-- antigo de pe — dois planos na tela de adesao, e os contratos ja vendidos
-- apontando para o orfao. O rename precisa acontecer na linha que ja existe.
--
-- Idempotente: o WHERE deixa de casar depois da primeira execucao.
UPDATE "SelectPlan" SET "name" = 'Estrela Prata' WHERE "name" = 'Estrela';

-- planNameSnapshot NAO e tocado de proposito.
--
-- O snapshot existe justamente para que mexer no cadastro do plano nao
-- reescreva contrato ja vendido (mesma regra que protege a mensalidade de um
-- reajuste). Um Select vendido como "Estrela" continua dizendo "Estrela", que
-- e o nome que estava no contrato no dia da assinatura.
