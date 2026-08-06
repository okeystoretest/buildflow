import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";
import { Pagination } from "@/components/shared/pagination";
import { EntregasList } from "@/components/shared/entregas-list";
import { entregaInclude, toEntregaItem } from "@/components/shared/entrega-map";
import { EntregasFinFiltros } from "./filtros-client";
import type { Prisma } from "@prisma/client";

// Histórico só cresce → paginado no banco.
const PER_PAGE = 20;

// Submódulo "Entregas" do Financeiro: lista todas as entregas efetuadas por
// usuários com perfil MOTORISTA.
// RBAC: estritamente FINANCEIRO e GESTAO.
export default async function FinanceiroEntregasPage({
  searchParams,
}: {
  searchParams: { busca?: string; driver?: string; de?: string; ate?: string; situacao?: string; page?: string };
}) {
  await requireRole(["FINANCEIRO", "GESTAO"]);

  const busca = searchParams.busca?.trim() || "";
  const driverId = searchParams.driver?.trim() || "";
  const de = searchParams.de?.trim() || "";
  const ate = searchParams.ate?.trim() || "";
  // Situação do pagamento: "" (todas) | "pagas" (Entrega Paga) | "nao_pagas".
  const situacao = searchParams.situacao?.trim() || "";
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);

  // Motoristas ATIVOS (para o dropdown de filtro).
  const drivers = await prisma.user.findMany({
    where: { role: "MOTORISTA", active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const activeDriverIds = drivers.map((d) => d.id);

  // Intervalo de datas (sobre a data da entrega). Sem período informado, todas.
  const deliveredAt: Prisma.DateTimeNullableFilter = {};
  if (de) deliveredAt.gte = new Date(de + "T00:00:00");
  if (ate) deliveredAt.lte = new Date(ate + "T23:59:59");
  const temPeriodo = de !== "" || ate !== "";

  // Entregas efetuadas por MOTORISTA. Base: Delivery.status = ENTREGUE e o
  // motorista da entrega tem papel MOTORISTA (perfil), com cadastro.
  const deliveryWhere: Prisma.DeliveryWhereInput = {
    status: "ENTREGUE",
    driver: { is: { role: "MOTORISTA" } },
    // Filtro por motorista específico (deve ser ativo); senão, restringe aos
    // motoristas ativos para manter coerência com o dropdown.
    ...(driverId
      ? { driverId }
      : { driverId: { in: activeDriverIds.length ? activeDriverIds : ["__none__"] } }),
    ...(temPeriodo ? { deliveredAt } : {}),
  };

  const where: Prisma.OrderWhereInput = {
    delivery: { is: deliveryWhere },
    // Filtro por situação de pagamento da entrega:
    //  - "pagas": só as que já têm DriverPayment (Entrega Paga).
    //  - "nao_pagas": só as ainda sem pagamento (a pagar).
    //  - "" (Entregues): todas as entregues, pagas ou não.
    ...(situacao === "pagas" ? { driverPayment: { isNot: null } } : {}),
    ...(situacao === "nao_pagas" ? { driverPayment: { is: null } } : {}),
    ...(busca
      ? {
          OR: [
            { comandaNumber: { contains: busca, mode: "insensitive" } },
            { seller: { name: { contains: busca, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: entregaInclude,
      orderBy: { delivery: { deliveredAt: "desc" } },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.order.count({ where }),
  ]);

  const items = orders.map(toEntregaItem);

  const resumoPeriodo = temPeriodo
    ? ` entre ${de ? new Date(de).toLocaleDateString("pt-BR") : "início"} e ${
        ate ? new Date(ate).toLocaleDateString("pt-BR") : "hoje"
      }`
    : "";

  return (
    <div className="space-y-6">
      <BackButton href="/financeiro" />
      <h1 className="text-2xl font-bold text-financeiro">Pagamentos de Motoristas</h1>
      <p className="text-sm text-muted-foreground">
        Entregas efetuadas pelos motoristas. Clique em uma para ver a ficha completa e registrar o pagamento da entrega.
      </p>

      <EntregasFinFiltros
        drivers={drivers}
        defaultBusca={busca}
        defaultDriver={driverId}
        defaultDe={de}
        defaultAte={ate}
        defaultSituacao={situacao}
      />

      <p className="text-sm text-muted-foreground">
        {total} entrega(s) encontrada(s){resumoPeriodo}.
      </p>

      {total === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhuma entrega encontrada.</CardContent></Card>
      )}

      <EntregasList orders={items} enablePayment />

      <Pagination page={page} perPage={PER_PAGE} total={total} label="entregas" />
    </div>
  );
}
