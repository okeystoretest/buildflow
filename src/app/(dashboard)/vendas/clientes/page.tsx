import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { BackButton } from "@/components/shared/back-button";
import { ClientesManager, type ClienteRow } from "./manager-client";

export default async function ClientesPage() {
  await requireRole(["VENDAS", "GESTAO"]);
  const customers = await prisma.customer.findMany({ orderBy: { name: "asc" } });

  const rows: ClienteRow[] = customers.map((c) => ({
    id: c.id, code: c.code, name: c.name,
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <BackButton href="/vendas" />
      <h1 className="mb-4 text-2xl font-bold text-vendas">Clientes</h1>
      <ClientesManager customers={rows} />
    </div>
  );
}
