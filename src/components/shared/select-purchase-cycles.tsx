import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL, tierColor } from "@/lib/utils";
import { formatDayBR } from "@/lib/select-contract";
import type { PurchaseCycle } from "@/lib/select-queries";

/**
 * MÍNIMO DE COMPRAS, ciclo a ciclo — a barra de acompanhamento da cliente
 * Select.
 *
 * Sem interação nenhuma, de propósito: é INDICADOR, não cobrança (princípio 4
 * do produto, "indicador acompanha, não penaliza"). Por isso também não há
 * botão, alerta nem bloqueio aqui — só o quanto já foi comprado no ciclo.
 *
 * Mora em `components/shared` porque a vendedora vê a mesma barra que o
 * Financeiro: a régua do contrato é uma só, e duas cópias divergiriam na
 * primeira correção.
 */
export function SelectPurchaseCycles({ cycles }: { cycles: PurchaseCycle[] }) {
  const d = (iso: string) => formatDayBR(new Date(iso));

  return (
    <Card>
      <CardHeader><CardTitle>Mínimo de compras mensal</CardTitle></CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          Soma dos pedidos da cliente <strong>aprovados pelo Financeiro</strong> dentro de cada ciclo do
          contrato, pelo valor do pedido (sem frete), descontadas as devoluções. Estornados, cancelados e
          doações não entram. É um indicador: não bloqueia nem cobra nada.
        </p>
        {cycles.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground">O contrato ainda não começou.</p>
        ) : (
          <div className="space-y-2">
            {/* Do ciclo mais recente para o mais antigo: o que importa é o que
                está correndo agora. */}
            {[...cycles].reverse().map((c) => {
              const pct = c.minimum > 0 ? (c.purchased / c.minimum) * 100 : 0;
              return (
                <div key={c.index} className={`rounded-lg border p-3 ${c.current ? "border-servico/40 bg-servico/5" : "border-border"}`}>
                  <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">
                      Ciclo {c.index} · {d(c.from)} a {d(c.to)} {c.current && <span className="text-servico-text">(atual)</span>}
                    </span>
                    <span className="font-data">
                      {formatBRL(c.purchased)} <span className="text-muted-foreground">de {formatBRL(c.minimum)}</span>
                      {" · "}
                      <span className={pct >= 100 ? "text-servico-text" : "text-muted-foreground"}>{Math.round(pct)}%</span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div className={`h-full rounded-full ${tierColor(pct)}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
