-- RATE LIMIT COMPARTILHADO ENTRE INSTANCIAS.
--
-- O contador vivia em memoria do processo. Restart, OOM ou redeploy zerava, e
-- com duas instancias o teto efetivo DOBRAVA em silencio: cada processo tinha
-- o seu balde, e nada na tela dizia que a contencao tinha virado o dobro do
-- que estava escrito no codigo. Protege o login (forca bruta), o link do
-- acompanhamento, a porta do Connect e a submissao publica da LP.
--
-- Uma linha por TENTATIVA, nao um contador por janela. E o que preserva a
-- janela DESLIZANTE que o modulo em memoria ja fazia: contador por janela fixa
-- deixaria passar o dobro do teto na emenda entre duas janelas, e trocar a
-- semantica por baixo de quatro chamadores existentes seria afrouxar a
-- contencao sem ninguem ter decidido isso.
--
-- Aditiva e idempotente: nada existente e alterado.
CREATE TABLE IF NOT EXISTS "RateLimitHit" (
  "id"  BIGSERIAL PRIMARY KEY,
  -- A chave ja vem composta de quem chama (ex.: "login:<ip>:<email>",
  -- "atacado:<ip>"). O formato e do chamador; aqui e texto opaco.
  "key" TEXT        NOT NULL,
  "at"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- O indice e (key, at) nessa ordem porque toda consulta e "as tentativas DESTA
-- chave dentro da janela": filtra por igualdade na chave e por faixa no tempo.
-- Invertido, cada checagem varreria por tempo todas as chaves.
CREATE INDEX IF NOT EXISTS "RateLimitHit_key_at_idx" ON "RateLimitHit"("key", "at");

-- Indice so de tempo para o expurgo das linhas velhas, que nao filtra por chave.
CREATE INDEX IF NOT EXISTS "RateLimitHit_at_idx" ON "RateLimitHit"("at");
