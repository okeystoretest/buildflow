import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { BackButton } from "@/components/shared/back-button";
import { SearchBox } from "@/components/shared/search-box";
import { Pagination } from "@/components/shared/pagination";
import { ExcursoesManager, type ExcursaoRow } from "./manager-client";

const PER_PAGE = 20;

// Cadastro de Excursões (Vendas). Segue o padrão do Cadastro de Clientes:
// busca no servidor (?q=) e paginação no banco.
export default async function ExcursoesPage({
  searchParams,
}: {
  searchParams: { page?: string; q?: string };
}) {
  await requireRole(["VENDAS", "GESTAO", "FINANCEIRO"]);

  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);
  const q = (searchParams.q ?? "").trim();

  // Lista apenas excursões ativas (as inativadas somem do cadastro).
  const where = {
    active: true,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { address: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [excursoes, total] = await Promise.all([
    prisma.excursao.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.excursao.count({ where }),
  ]);

  const rows: ExcursaoRow[] = excursoes.map((e) => ({
    id: e.id,
    name: e.name,
    address: e.address,
    cutoffTime: e.cutoffTime ?? "",
    operatingDays: e.operatingDays ?? "",
    notes: e.notes ?? "",
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <BackButton href="/vendas" />
      <h1 className="mb-4 text-2xl font-bold text-vendas">Cadastrar Excursão</h1>

      <div className="mb-4">
        <SearchBox placeholder="Buscar por nome ou endereço..." className="max-w-sm" />
      </div>

      <ExcursoesManager excursoes={rows} />

      <div className="mt-4">
        <Pagination page={page} perPage={PER_PAGE} total={total} label="excursões" />
      </div>
    </div>
  );
}
