import { requireRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";
import { Pagination } from "@/components/shared/pagination";
import {
  carregarPendencias,
  parsePendenciasFiltros,
  type PendenciasSearchParams,
} from "@/lib/pendencias-query";
import { PendenciasFiltros } from "./filtros-client";
import { PendenciasList } from "./pendencias-client";
import { ExportarPendenciasPdf } from "./exportar-pdf-client";

export const dynamic = "force-dynamic";

const PER_PAGE = 20;

/**
 * LOGÍSTICA > Relatório de Pendências
 * ---------------------------------------------------------------------------
 * Lista TODOS os pedidos que atingiram o status PENDENTE — não apenas os que
 * estão pendentes agora. O critério é a existência de uma entrada de histórico
 * com status PENDENTE, o que preserva o caso comum de pendência já resolvida
 * (o pedido seguiu o fluxo, mas o registro precisa continuar auditável).
 *
 * Para cada pedido, exibe cada ciclo de pendência com a descrição registrada,
 * as tratativas intermediárias e a resolução correspondente.
 *
 * A leitura dos filtros e a consulta ficam em src/lib/pendencias-query.ts,
 * compartilhadas com a exportação em PDF (/api/logistica/pendencias/pdf) para
 * que o arquivo gerado nunca divirja do que está na tela.
 */
export default async function RelatorioPendenciasPage({
  searchParams,
}: {
  searchParams?: PendenciasSearchParams;
}) {
  await requireRole(["LOGISTICA", "GESTAO"]);

  const filtros = parsePendenciasFiltros(searchParams);
  const page = Math.max(1, Number(searchParams?.page ?? 1) || 1);

  const { items, total } = await carregarPendencias(filtros, {
    skip: (page - 1) * PER_PAGE,
    take: PER_PAGE,
  });

  return (
    <div className="space-y-6">
      <BackButton href="/logistica" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-distribuicao">Relatório de Pendências</h1>
          <p className="text-sm text-muted-foreground">
            Todos os pedidos que atingiram o status Pendente, com a descrição de cada pendência e o
            respectivo histórico de tratativas e resolução.
          </p>
        </div>
        <ExportarPendenciasPdf total={total} />
      </div>

      <PendenciasFiltros
        defaultBusca={filtros.busca}
        defaultDe={filtros.de}
        defaultAte={filtros.ate}
        defaultSituacao={filtros.situacao}
      />

      <p className="text-sm text-muted-foreground">
        {total} pedido(s) com pendência registrada
        {filtros.busca ? ` para "${filtros.busca}"` : ""}.
        {total > 0 && " O PDF exporta todos os pedidos deste filtro, não apenas esta página."}
      </p>

      {total === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhuma pendência encontrada com os filtros atuais.
          </CardContent>
        </Card>
      ) : (
        <PendenciasList pedidos={items} />
      )}

      <Pagination page={page} perPage={PER_PAGE} total={total} label="pedidos" />
    </div>
  );
}
