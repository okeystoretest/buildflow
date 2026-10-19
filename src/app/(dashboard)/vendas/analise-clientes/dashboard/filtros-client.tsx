"use client";

import { PeriodoFiltro } from "@/components/shared/periodo-filtro";
import { useFilterQuery } from "@/hooks/use-filter-query";

/**
 * Filtros do painel, no alto à direita — o mesmo lugar onde o dashboard de
 * chamados põe o seu seletor de motorista.
 *
 * O período usa o `PeriodoFiltro` compartilhado, que é o mesmo das outras dez
 * telas que filtram por data. Este painel foi onde o desenho nasceu; manter
 * aqui uma cópia dele seria a primeira a divergir.
 *
 * O SELETOR DE VENDEDORA SÓ EXISTE PARA A GESTÃO, e não por gentileza de
 * interface: para quem é de Vendas o escopo já fixa `sellerId` no próprio id.
 * Esconder aqui e ignorar no servidor são decisões separadas — a segunda é a
 * que vale, e está em `resumoDoAtacado`.
 */
export function DashboardFiltros({
  defaults,
  vendedoras,
  ehGestao,
}: {
  defaults: { de: string; ate: string; vendedora: string };
  vendedoras: { id: string; name: string }[];
  ehGestao: boolean;
}) {
  const f = useFilterQuery(
    {},
    { instant: { de: defaults.de, ate: defaults.ate, vendedora: defaults.vendedora } },
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <PeriodoFiltro
        de={f.instant.de}
        ate={f.instant.ate}
        onChange={(p) => f.setInstantMany(p)}
        setor="vendas"
        titulo="Período"
        id="painel"
      />

      {ehGestao && (
        <select
          aria-label="Vendedora"
          value={f.instant.vendedora}
          onChange={(e) => f.setInstant("vendedora", e.target.value)}
          className="h-10 max-w-[12rem] rounded-lg border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          <option value="">Geral (todas)</option>
          {vendedoras.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
