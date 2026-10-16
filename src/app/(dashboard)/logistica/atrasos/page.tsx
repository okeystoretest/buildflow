import { requireRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";
import { Pagination } from "@/components/shared/pagination";
import {
  carregarAtrasos,
  parseAtrasosFiltros,
  type AtrasosSearchParams,
} from "@/lib/atrasos-query";
import { AtrasosFiltros } from "./filtros-client";
import { AtrasosList } from "./atrasos-client";
import { ExportarAtrasosPdf } from "./exportar-pdf-client";

export const dynamic = "force-dynamic";

const PER_PAGE = 20;

/**
 * LOGÍSTICA > Relatório de Atrasos
 * ---------------------------------------------------------------------------
 * Lista as JUSTIFICATIVAS DE ATRASO (OrderDelayReason) agrupadas por
 * pedido/comanda. O registro nasce no quadro: quando um card passa de
 * DELAY_REASON_THRESHOLD_MIN minutos além do prazo da etapa, o setor dono da
 * etapa precisa justificar (ver src/lib/actions/delays.ts). Como a tabela tem
 * UNIQUE (orderId, status), um pedido aparece com uma justificativa por etapa
 * em que atrasou.
 *
 * A leitura dos filtros e a consulta ficam em src/lib/atrasos-query.ts,
 * compartilhadas com a exportação em PDF (/api/logistica/atrasos/pdf) para que
 * o arquivo gerado nunca divirja do que está na tela.
 */
export default async function RelatorioAtrasosPage(
  props: {
    searchParams?: Promise<AtrasosSearchParams>;
  }
) {
  const searchParams = await props.searchParams;
  await requireRole(["LOGISTICA", "GESTAO"]);

  const filtros = parseAtrasosFiltros(searchParams);
  const page = Math.max(1, Number(searchParams?.page ?? 1) || 1);

  const { items, total } = await carregarAtrasos(filtros, {
    skip: (page - 1) * PER_PAGE,
    take: PER_PAGE,
  });

  return (
    <div className="space-y-6">
      <BackButton href="/logistica" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-distribuicao">Relatório de Atrasos</h1>
          <p className="text-sm text-muted-foreground">
            Todas as justificativas de atraso registradas no quadro, por pedido/comanda, com a
            etapa em que o pedido parou, quanto tempo atrasou e quem justificou.
          </p>
        </div>
        <ExportarAtrasosPdf total={total} />
      </div>

      <AtrasosFiltros
        defaultBusca={filtros.busca}
        defaultDe={filtros.de}
        defaultAte={filtros.ate}
      />

      <p className="text-sm text-muted-foreground">
        {total} pedido(s) com atraso justificado
        {filtros.busca ? ` para "${filtros.busca}"` : ""}.
        {total > 0 && " O PDF exporta todos os pedidos deste filtro, não apenas esta página."}
      </p>

      {total === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhuma justificativa de atraso encontrada com os filtros atuais.
          </CardContent>
        </Card>
      ) : (
        <AtrasosList pedidos={items} />
      )}

      <Pagination page={page} perPage={PER_PAGE} total={total} label="pedidos" />
    </div>
  );
}
