import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";
import { STATUS_LABEL, STATUS_STYLE } from "@/lib/order-flow";
import { loadStageLimits } from "@/lib/stage-limits";
import { calcularMetricas, formatMin, type HistPonto } from "@/lib/sla-metrics";
import { MetricasFiltros } from "./filtros-client";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * LOGÍSTICA > Métricas
 * ---------------------------------------------------------------------------
 * Tempo médio (SLA) de permanência dos pedidos em cada etapa até a conclusão.
 * Os números são derivados de OrderStatusHistory (ver src/lib/sla-metrics.ts).
 *
 * Recorte padrão: últimos 30 dias pela data de CRIAÇÃO do pedido. Sem recorte,
 * a média carregaria o histórico inteiro e deixaria de refletir a operação atual.
 */
export default async function MetricasPage({
  searchParams,
}: {
  searchParams?: { de?: string; ate?: string; loja?: string };
}) {
  await requireRole(["LOGISTICA", "GESTAO"]);

  const hoje = new Date();
  const trintaDias = new Date(hoje.getTime() - 30 * 86_400_000);
  const de = searchParams?.de?.trim() || trintaDias.toISOString().slice(0, 10);
  const ate = searchParams?.ate?.trim() || hoje.toISOString().slice(0, 10);
  const loja = searchParams?.loja?.trim() || "";

  const lojas = await prisma.originStore.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const where: Prisma.OrderWhereInput = {
    createdAt: { gte: new Date(de + "T00:00:00"), lte: new Date(ate + "T23:59:59") },
    ...(loja ? { originStoreId: loja } : {}),
  };

  // Só o essencial: id + createdAt do pedido e a trilha de status. Nada de
  // include pesado — esta tela agrega, não lista.
  const orders = await prisma.order.findMany({
    where,
    select: {
      id: true,
      createdAt: true,
      history: { select: { status: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
  });

  const pontos: HistPonto[] = orders.flatMap((o) =>
    o.history.map((h) => ({ orderId: o.id, status: h.status, at: h.createdAt })),
  );
  const criadoEm = new Map<string, Date>(
    orders.map((o) => [o.id, o.createdAt] as [string, Date]),
  );

  const [metricas, limites] = await Promise.all([
    Promise.resolve(calcularMetricas(pontos, criadoEm)),
    loadStageLimits(),
  ]);

  // Maior média entre as etapas — base da barra comparativa (gargalo).
  const maiorMedia = Math.max(1, ...metricas.etapas.map((e) => e.mediaMin));

  return (
    <div className="space-y-6">
      <BackButton href="/logistica" />
      <div>
        <h1 className="text-2xl font-bold text-distribuicao">Métricas</h1>
        <p className="text-sm text-muted-foreground">
          Tempo médio de permanência dos pedidos em cada etapa até a conclusão. Calculado a partir do
          histórico de mudanças de status.
        </p>
      </div>

      <MetricasFiltros defaultDe={de} defaultAte={ate} defaultLoja={loja} lojas={lojas} />

      {/* Resumo do recorte */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Resumo titulo="Pedidos no período" valor={String(metricas.pedidos)} />
        <Resumo
          titulo="Lead time médio (criação → conclusão)"
          valor={formatMin(metricas.leadTime.mediaMin)}
          rodape={`${metricas.leadTime.amostras} pedido(s) concluído(s)`}
        />
        <Resumo
          titulo="Lead time mediano"
          valor={formatMin(metricas.leadTime.medianaMin)}
          rodape={`Pior caso: ${formatMin(metricas.leadTime.maxMin)}`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>SLA por etapa</CardTitle>
        </CardHeader>
        <CardContent>
          {metricas.etapas.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">
              Nenhuma movimentação de status encontrada no período selecionado.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Etapa</th>
                    <th className="py-2 pr-4 text-right">Tempo médio</th>
                    <th className="py-2 pr-4 text-right">Mediana</th>
                    <th className="py-2 pr-4 text-right">Maior tempo</th>
                    <th className="py-2 pr-4 text-right">Amostras</th>
                    <th className="py-2 pr-4 text-right">Prazo (Gestão)</th>
                    <th className="py-2 pr-4">Comparativo</th>
                  </tr>
                </thead>
                <tbody>
                  {metricas.etapas.map((e) => {
                    const limite = limites[e.status] ?? 0;
                    // Estourou o prazo configurado em Gestão > Etapas?
                    const estourou = limite > 0 && e.mediaMin > limite;
                    const pct = Math.round((e.mediaMin / maiorMedia) * 100);
                    return (
                      <tr key={e.status} className="border-b border-border last:border-0">
                        <td className="py-2 pr-4">
                          <span className="inline-flex items-center gap-2">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_STYLE[e.status].dot}`} />
                            {STATUS_LABEL[e.status]}
                          </span>
                        </td>
                        <td className={`py-2 pr-4 text-right font-data font-semibold ${estourou ? "text-destructive" : ""}`}>
                          {formatMin(e.mediaMin)}
                        </td>
                        <td className="py-2 pr-4 text-right font-data">{formatMin(e.medianaMin)}</td>
                        <td className="py-2 pr-4 text-right font-data text-muted-foreground">
                          {formatMin(e.maxMin)}
                        </td>
                        <td className="py-2 pr-4 text-right font-data text-muted-foreground">{e.amostras}</td>
                        <td className="py-2 pr-4 text-right font-data text-muted-foreground">
                          {limite > 0 ? formatMin(limite) : "—"}
                        </td>
                        <td className="py-2 pr-4">
                          <div className="h-2 w-full min-w-[80px] overflow-hidden rounded-full bg-secondary">
                            <div
                              className={`h-full rounded-full ${estourou ? "bg-red-500" : "bg-distribuicao"}`}
                              style={{ width: `${Math.max(2, pct)}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Só entram na conta as permanências já <span className="font-medium">encerradas</span> (o pedido saiu da
            etapa). O tempo na etapa em que o pedido está agora não é contabilizado, para não puxar a média para
            baixo. A coluna &quot;Prazo (Gestão)&quot; usa o limite configurado em Gestão &gt; Etapas; a média em
            vermelho indica etapa acima do prazo.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Resumo({ titulo, valor, rodape }: { titulo: string; valor: string; rodape?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <p className="font-data mt-1 text-2xl font-bold text-distribuicao">{valor}</p>
        {rodape && <p className="mt-0.5 text-xs text-muted-foreground">{rodape}</p>}
      </CardContent>
    </Card>
  );
}
