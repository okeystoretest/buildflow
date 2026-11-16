"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useFilterQuery } from "@/hooks/use-filter-query";

/**
 * Filtros do painel: ano, loja, vendedora e escopo. Todos instantaneos — nao
 * ha campo de texto a debouncear.
 *
 * O PERIODO E O ANO, e nao um intervalo livre de datas: meta e mensal, e um
 * recorte de 17/03 a 09/05 nao tem meta contra a qual comparar. As doze colunas
 * da grade sao o recorte fino.
 *
 * `useFilterQuery` preserva os params que nao sao dele — e o que mantem a aba
 * aberta (?aba=) ao mexer num filtro.
 */
export function AcompanhamentoFiltros({
  ano,
  loja,
  vendedora,
  escopo,
  lojas,
  vendedoras,
}: {
  ano: string;
  loja: string;
  vendedora: string;
  escopo: string;
  lojas: { id: string; name: string }[];
  vendedoras: { id: string; nome: string }[];
}) {
  const f = useFilterQuery({}, { instant: { ano, loja, vendedora, escopo } });

  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 5 }, (_, i) => anoAtual - i);

  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="acomp-ano">Ano</Label>
          <select
            id="acomp-ano"
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={f.instant.ano}
            onChange={(e) => f.setInstant("ano", e.target.value)}
          >
            {anos.map((a) => (
              <option key={a} value={String(a)}>{a}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="acomp-loja">Loja de Origem</Label>
          <select
            id="acomp-loja"
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={f.instant.loja}
            // Trocar a loja zera a vendedora: a selecionada pode nao pertencer
            // a nova loja, e o painel individual ficaria mostrando alguem que
            // nao esta na grade. Uma navegacao so (setInstantMany).
            onChange={(e) => f.setInstantMany({ loja: e.target.value, vendedora: "" })}
          >
            <option value="">Todas as lojas</option>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="acomp-vendedora">Vendedora</Label>
          <select
            id="acomp-vendedora"
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={f.instant.vendedora}
            onChange={(e) => f.setInstant("vendedora", e.target.value)}
          >
            {/* "Todas" e nao "Maior entrega do ano": sem vendedora escolhida
                o painel individual mostra a LOJA (ver painel.tsx). O rotulo antigo
                sobreviveu a troca do comportamento e passou a prometer uma coisa
                e entregar outra — foi o teste de navegador que pegou. */}
            <option value="">Todas</option>
            {vendedoras.map((v) => (
              <option key={v.id} value={v.id}>{v.nome}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="acomp-escopo">Escopo</Label>
          <select
            id="acomp-escopo"
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={f.instant.escopo}
            onChange={(e) => f.setInstantMany({ escopo: e.target.value, vendedora: "" })}
          >
            <option value="">Varejo e Atacado</option>
            <option value="VAREJO">Varejo</option>
            <option value="ATACADO">Atacado</option>
          </select>
        </div>
      </CardContent>
    </Card>
  );
}
