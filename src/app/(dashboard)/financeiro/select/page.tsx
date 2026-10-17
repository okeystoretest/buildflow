import Link from "next/link";
import { AlertTriangle, Plus, Star } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/shared/back-button";
import { Pagination } from "@/components/shared/pagination";
import { formatBRL } from "@/lib/utils";
import { formatDayBR, parseDayUTC, CONTRACT_STATE_LABEL, type ContractState } from "@/lib/select-contract";
import { listSelectContracts, SELECT_PAGE_SIZE, type FinancialSituation } from "@/lib/select-queries";
import { SelectFiltros } from "./filtros-client";

const ESTADOS: ContractState[] = ["ATIVO", "AGENDADO", "ENCERRADO", "CANCELADO"];
const FINANCEIROS: FinancialSituation[] = ["EM_DIA", "VENCIDAS", "QUITADO"];

const BADGE: Record<ContractState, string> = {
  ATIVO: "bg-servico/15 text-servico-text",
  AGENDADO: "bg-brand/15 text-brand-text",
  ENCERRADO: "bg-secondary text-muted-foreground",
  CANCELADO: "bg-destructive/15 text-destructive",
};

/**
 * SELECT no Financeiro — acompanhamento da venda de serviço.
 *
 * Os indicadores do topo separam DOIS números que a spec original tratava como
 * um: "Valor dos contratos" (mensalidade × validade) e "A cobrar" (soma das
 * parcelas geradas). Eles divergem sempre que um Select é cadastrado com
 * início retroativo, porque as parcelas de meses já passados não são geradas.
 */
export default async function FinanceiroSelectPage(
  props: {
    searchParams?: Promise<{
      q?: string; plano?: string; estado?: string; responsavel?: string;
      de?: string; ate?: string; financeiro?: string; page?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  await requireRole(["FINANCEIRO", "GESTAO"]);

  const estado = ESTADOS.includes(searchParams?.estado as ContractState)
    ? (searchParams?.estado as ContractState)
    : undefined;
  const financeiro = FINANCEIROS.includes(searchParams?.financeiro as FinancialSituation)
    ? (searchParams?.financeiro as FinancialSituation)
    : undefined;

  // As datas vêm da query string e são a única entrada daqui que viraria
  // `new Date(...)` no filtro. Sem validar, `?de=qualquercoisa` chega ao
  // Prisma como Invalid Date e derruba a página inteira com erro de
  // validação — o mesmo parseDayUTC que o resto do Select usa recusa tanto
  // o formato errado quanto a data inexistente (31/02).
  const de = searchParams?.de && parseDayUTC(searchParams.de) ? searchParams.de : undefined;
  const ate = searchParams?.ate && parseDayUTC(searchParams.ate) ? searchParams.ate : undefined;

  // Busca livre: `contains` insensitive em duas colunas, então o tamanho é
  // trabalho para o banco. Nenhum código ou nome de cliente chega perto disto.
  const q = searchParams?.q?.slice(0, 100);

  const [dados, plans, responsibles] = await Promise.all([
    listSelectContracts({
      q,
      planId: searchParams?.plano,
      state: estado,
      responsibleId: searchParams?.responsavel,
      startFrom: de,
      startTo: ate,
      financial: financeiro,
      page: Number(searchParams?.page) || 1,
    }),
    prisma.selectPlan.findMany({ orderBy: [{ sortOrder: "asc" }], select: { id: true, name: true } }),
    // Só quem de fato vendeu algum Select: a lista de responsáveis é um
    // filtro, e oferecer usuário que nunca vendeu só gera filtro vazio.
    prisma.user.findMany({
      where: { selectContracts: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const { rows, indicators } = dados;

  return (
    <div className="space-y-6">
      <BackButton href="/financeiro" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-servico-text">
          <Star className="h-6 w-6" /> Select
        </h1>
        <Button asChild variant="servico">
          <Link href="/vendas/novo-select"><Plus className="h-4 w-4" /> Novo Select</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Indicador rotulo="Valor dos contratos" valor={indicators.contractedAmount} dica={`${indicators.count} Select(s) no filtro`} />
        <Indicador rotulo="A cobrar" valor={indicators.billableAmount} dica="soma das parcelas geradas" />
        <Indicador rotulo="Recebido" valor={indicators.receivedAmount} tom="text-servico-text" />
        <Indicador rotulo="Em aberto" valor={indicators.openAmount} />
        <Indicador rotulo="Vencido" valor={indicators.overdueAmount} tom={indicators.overdueAmount > 0 ? "text-destructive" : undefined} />
      </div>

      <SelectFiltros
        defaults={{
          q: searchParams?.q ?? "",
          plano: searchParams?.plano ?? "",
          estado: searchParams?.estado ?? "",
          responsavel: searchParams?.responsavel ?? "",
          de: searchParams?.de ?? "",
          ate: searchParams?.ate ?? "",
          financeiro: searchParams?.financeiro ?? "",
        }}
        plans={plans}
        responsibles={responsibles}
      />

      <Card>
        <CardHeader><CardTitle>Selects</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="w-px whitespace-nowrap border-r border-border py-2 pr-4">Código</th>
                  <th className="border-r border-border py-2 pl-4 pr-4">Cliente</th>
                  <th className="border-r border-border py-2 pl-4 pr-4">Plano</th>
                  <th className="border-r border-border py-2 pl-4 pr-4">Responsável</th>
                  <th className="border-r border-border py-2 pl-4 pr-4">Vigência</th>
                  <th className="border-r border-border py-2 pl-4 pr-4 text-right">Mensalidade</th>
                  <th className="border-r border-border py-2 pl-4 pr-4">Situação</th>
                  <th className="border-r border-border py-2 pl-4 pr-4 text-right">Parcelas</th>
                  <th className="border-r border-border py-2 pl-4 pr-4 text-right">Em aberto</th>
                  <th className="py-2 pl-4 pr-4 text-right">Vencido</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-border last:border-0 transition-colors ${
                      r.overdueAmount > 0 ? "bg-destructive/10 hover:bg-destructive/15" : "hover:bg-secondary/50"
                    }`}
                  >
                    <td className="w-px whitespace-nowrap border-r border-border py-2 pr-4 font-data">
                      <Link href={`/financeiro/select/${r.id}`} className="flex items-center gap-1.5 hover:underline">
                        {r.overdueAmount > 0 && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />}
                        {r.customerCode}
                      </Link>
                    </td>
                    <td className="border-r border-border py-2 pl-4 pr-4">
                      <Link href={`/financeiro/select/${r.id}`} className="hover:underline">{r.customerName}</Link>
                    </td>
                    <td className="border-r border-border py-2 pl-4 pr-4">{r.planName}</td>
                    <td className="border-r border-border py-2 pl-4 pr-4">{r.responsibleName}</td>
                    <td className="whitespace-nowrap border-r border-border py-2 pl-4 pr-4 font-data text-xs">
                      {formatDayBR(new Date(r.startDate))} – {formatDayBR(new Date(r.closedAt ?? r.endDate))}
                    </td>
                    <td className="border-r border-border py-2 pl-4 pr-4 text-right font-data">{formatBRL(r.monthlyAmount)}</td>
                    <td className="border-r border-border py-2 pl-4 pr-4">
                      <Badge className={BADGE[r.state]}>{CONTRACT_STATE_LABEL[r.state]}</Badge>
                    </td>
                    <td className="border-r border-border py-2 pl-4 pr-4 text-right font-data">
                      {r.paidInstallments}/{r.totalInstallments}
                    </td>
                    <td className="border-r border-border py-2 pl-4 pr-4 text-right font-data">{formatBRL(r.openAmount)}</td>
                    <td className={`py-2 pl-4 pr-4 text-right font-data ${r.overdueAmount > 0 ? "font-semibold text-destructive" : ""}`}>
                      {formatBRL(r.overdueAmount)}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-muted-foreground">
                      Nenhum Select encontrado com estes filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pt-3">
            <Pagination page={dados.page} perPage={SELECT_PAGE_SIZE} total={dados.total} label="Selects" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Indicador({ rotulo, valor, dica, tom }: { rotulo: string; valor: number; dica?: string; tom?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{rotulo}</p>
        <p className={`font-data text-lg font-semibold ${tom ?? ""}`}>{formatBRL(valor)}</p>
        {dica && <p className="text-xs text-muted-foreground">{dica}</p>}
      </CardContent>
    </Card>
  );
}
