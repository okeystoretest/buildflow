-- Tabela da Loja de Origem (conceito novo, separado de Store).
CREATE TABLE "OriginStore" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "simplifiedFlow" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OriginStore_pkey" PRIMARY KEY ("id")
);

-- Loja de Origem no pedido (nullable: pedidos antigos nao tem).
ALTER TABLE "Order" ADD COLUMN "originStoreId" TEXT;

-- Relacao N-N User <-> OriginStore (limite de 2 e validado na aplicacao).
CREATE TABLE "_UserOriginStores" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);
CREATE UNIQUE INDEX "_UserOriginStores_AB_unique" ON "_UserOriginStores"("A", "B");
CREATE INDEX "_UserOriginStores_B_index" ON "_UserOriginStores"("B");

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_originStoreId_fkey"
  FOREIGN KEY ("originStoreId") REFERENCES "OriginStore"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "_UserOriginStores"
  ADD CONSTRAINT "_UserOriginStores_A_fkey"
  FOREIGN KEY ("A") REFERENCES "OriginStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_UserOriginStores"
  ADD CONSTRAINT "_UserOriginStores_B_fkey"
  FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
