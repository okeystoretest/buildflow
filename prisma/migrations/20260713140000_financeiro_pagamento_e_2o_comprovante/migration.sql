-- Build.Flow | Migration: Financeiro assume Banco/Forma de Pagamento + 2o comprovante
--
-- CONTEXTO:
--  - "Banco" e "Forma de Pagamento" sairam do formulario de Vendas e passaram
--    a ser preenchidos pelo FINANCEIRO na tela de Analise de Pedidos.
--  - Como o pedido agora NASCE sem forma de pagamento, a coluna precisa
--    aceitar NULL. A obrigatoriedade passa a ser validada na APROVACAO
--    (regra de negocio na action auditOrder), nao mais no banco.
--  - Novo campo para o SEGUNDO comprovante de pagamento (anexado pelo Financeiro).
--
-- SEGURANCA: nenhum dado e apagado. Pedidos antigos mantem seus valores.

-- 1) Solta a obrigatoriedade de "paymentMethodId" (pedido nasce sem ela).
ALTER TABLE "Order" ALTER COLUMN "paymentMethodId" DROP NOT NULL;

-- 2) Adiciona o caminho do segundo comprovante de pagamento.
--    Segue a regra do projeto: no banco vai apenas a STRING do caminho,
--    nunca o binario da imagem (o arquivo .webp fica no disco da VPS).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentProof2Path" TEXT;
