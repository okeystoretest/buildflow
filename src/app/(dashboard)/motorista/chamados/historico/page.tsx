import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listHistory } from "@/lib/transport/queries";
import { Pagination } from "@/components/shared/pagination";
import { HistoricoTabela } from "./tabela";

export const dynamic = "force-dynamic";

const PER_PAGE = 10;

export default async function ChamadosHistoricoPage(props: {
  searchParams: Promise<{ page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await requireRole(["MOTORISTA", "LOGISTICA", "GESTAO"]);
  const isManager = session.role === "LOGISTICA" || session.role === "GESTAO";
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);

  const { items, total } = await listHistory({
    driverId: isManager ? undefined : session.userId,
    skip: (page - 1) * PER_PAGE,
    take: PER_PAGE,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-motorista-text">Histórico de chamados</h1>
          <p className="text-sm text-muted-foreground">Concluídos e cancelados, mais recentes primeiro.</p>
        </div>
        <Link
          href="/motorista/chamados"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
      </div>
      <HistoricoTabela items={items} />
      <Pagination page={page} perPage={PER_PAGE} total={total} label="chamados" />
    </div>
  );
}
