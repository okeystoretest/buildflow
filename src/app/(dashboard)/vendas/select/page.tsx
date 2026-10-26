import Link from "next/link";
import { Star } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { BackButton } from "@/components/shared/back-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Pagination } from "@/components/shared/pagination";
import { listSellerSelects, SELLER_SELECT_PAGE_SIZE } from "@/lib/select-queries";
import { CONTRACT_STATE_LABEL, type ContractState } from "@/lib/select-contract";

/**
 * OS SELECTS DA VENDEDORA.
 *
 * Só `VENDAS`: Gestão e Financeiro têm `/financeiro/select`, que é a tela
 * completa (parcelas, pagamentos, cancelamento). Esta aqui mostra as DUAS
 * coisas que são da vendedora — o que ela já entregou e o quanto a cliente
 * comprou —, e a consulta já vem escopada por `responsibleId`.
 */
const BADGE: Record<ContractState, string> = {
  ATIVO: "bg-servico/15 text-servico-text",
  AGENDADO: "bg-brand/15 text-brand-text",
  ENCERRADO: "bg-secondary text-muted-foreground",
  CANCELADO: "bg-destructive/15 text-destructive",
};

export default async function VendasSelectPage(props: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await requireRole(["VENDAS"]);
  // A faixa válida de página quem conhece é a consulta, que sabe o total; aqui
  // só se converte o texto da URL.
  const { rows, total, page } = await listSellerSelects(
    session.userId,
    Number(searchParams?.page) || 1,
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <BackButton href="/vendas" />

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-servico-text">
          <Star className="h-6 w-6" /> Meus Selects
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          As clientes Select sob sua responsabilidade. Abra uma para marcar as etapas
          entregues e ver o quanto ela comprou no ciclo.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Você ainda não tem nenhuma cliente Select.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Três por linha no desktop, duas no tablet, uma no celular. O
              tamanho da página (9) é múltiplo de três para a última linha
              nunca sair pela metade. */}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((c) => {
              const pct = c.stepsTotal === 0 ? 0 : Math.round((c.stepsDone / c.stepsTotal) * 100);
              return (
                <li key={c.id} className="flex">
                  <Link
                    href={`/vendas/select/${c.id}`}
                    className="flex w-full flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-servico/40 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 font-semibold leading-snug" title={c.customerName}>
                        {c.customerName}
                      </span>
                      <Badge className={`shrink-0 ${BADGE[c.state]}`}>
                        {CONTRACT_STATE_LABEL[c.state]}
                      </Badge>
                    </div>

                    <p className="truncate font-data text-xs text-muted-foreground" title={`${c.customerCode} · ${c.planName}`}>
                      {c.customerCode} · {c.planName}
                    </p>

                    {/* `mt-auto`: o nome ocupa uma ou duas linhas conforme a
                        cliente, e sem isto a barra de cada bloco pararia numa
                        altura diferente ao longo da linha. */}
                    <div className="mt-auto pt-1">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
                        <div className="h-full rounded-full bg-servico" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1.5 font-data text-xs text-muted-foreground">
                        {c.stepsDone} de {c.stepsTotal} etapas
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          <Pagination page={page} perPage={SELLER_SELECT_PAGE_SIZE} total={total} label="Selects" />
        </>
      )}
    </div>
  );
}
