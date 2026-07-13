import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { BackButton } from "@/components/shared/back-button";
import { SearchBox } from "@/components/shared/search-box";
import { Pagination } from "@/components/shared/pagination";
import { ClientesManager, type ClienteRow } from "./manager-client";

// Itens por pagina. A base tem dezenas de milhares de clientes, entao NUNCA
// carregamos todos: a consulta e paginada e a busca acontece no banco.
const PER_PAGE = 20;

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: { page?: string; q?: string };
}) {
  await requireRole(["VENDAS", "GESTAO"]);

  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);
  const q = (searchParams.q ?? "").trim();

  // Mesmo filtro serve para listar e para contar (total do rodape).
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { code: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  // As duas consultas correm em paralelo (nao uma depois da outra).
  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.customer.count({ where }),
  ]);

  const rows: ClienteRow[] = customers.map((c) => ({
    id: c.id, code: c.code, name: c.name,
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <BackButton href="/vendas" />
      <h1 className="mb-4 text-2xl font-bold text-vendas">Clientes</h1>

      <div className="mb-4">
        <SearchBox placeholder="Buscar por nome ou código..." className="max-w-sm" />
      </div>

      <ClientesManager customers={rows} />

      <div className="mt-4">
        <Pagination page={page} perPage={PER_PAGE} total={total} label="clientes" />
      </div>
    </div>
  );
}
