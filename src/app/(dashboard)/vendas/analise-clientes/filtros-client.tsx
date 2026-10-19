"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PeriodoFiltro } from "@/components/shared/periodo-filtro";
import { Card, CardContent } from "@/components/ui/card";
import { useFilterQuery } from "@/hooks/use-filter-query";
import { rejectionCodesByCategory } from "@/lib/wholesale-rejection-codes";

const selectClass =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

/**
 * Filtros da Análise de Clientes. Mesma mecânica do resto do app: o estado vive
 * na URL, texto com debounce e os selects aplicando na hora.
 *
 * O FILTRO DE VENDEDORA SÓ EXISTE PARA A GESTÃO, e não por gentileza de
 * interface: para quem é de Vendas, a consulta já fixa `sellerId` no próprio
 * id, então o filtro não teria o que oferecer além dela mesma. Esconder aqui e
 * ignorar no servidor são decisões separadas — a segunda é a que vale, e está
 * em `listLeadsFor`.
 *
 * ESTADO (UF) substituiu o filtro de Auxiliar em 19/10/2026, a pedido do dono.
 * As opções são as UFs que REALMENTE existem na base, lidas pela página e
 * dentro do escopo de quem olha — oferecer as 27 faria a vendedora procurar
 * entre estados de onde nunca chegou candidatura.
 *
 * Marca não entra: a Lov saiu de circulação em 17/10/2026 e sobrou uma marca
 * só. Quando ela voltar, este é o lugar.
 */
export function AnaliseClientesFiltros({
  defaults,
  estados,
  vendedoras,
  ehGestao,
}: {
  defaults: {
    busca: string;
    status: string;
    estado: string;
    vendedora: string;
    de: string;
    ate: string;
    motivo: string;
  };
  estados: string[];
  vendedoras: { id: string; name: string }[];
  ehGestao: boolean;
}) {
  const f = useFilterQuery(
    { busca: defaults.busca },
    {
      instant: {
        status: defaults.status,
        estado: defaults.estado,
        vendedora: defaults.vendedora,
        de: defaults.de,
        ate: defaults.ate,
        motivo: defaults.motivo,
      },
    },
  );

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 pt-5">
        <div className="flex-1 space-y-1.5" style={{ minWidth: 200 }}>
          <Label>Candidata</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 pr-9"
              placeholder="Nome da candidata"
              value={f.text.busca}
              onChange={(e) => f.setText("busca", e.target.value)}
            />
            {f.text.busca && (
              <button
                type="button"
                onClick={() => f.clear("busca")}
                aria-label="Limpar busca"
                className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1.5" style={{ minWidth: 160 }}>
          <Label>Status</Label>
          <select
            className={selectClass}
            value={f.instant.status}
            onChange={(e) => f.setInstant("status", e.target.value)}
          >
            <option value="">Todos</option>
            <option value="EM_ANALISE">Em análise</option>
            <option value="APROVADO">Aprovado</option>
            <option value="CUIDADO">Cuidado</option>
            <option value="REPROVADO">Reprovado</option>
          </select>
        </div>

        {/* ESTADO no lugar do Auxiliar: as opcoes sao as UFs que de fato
            existem na base, dentro do escopo de quem olha. Uma lista com as 27
            faria a vendedora procurar entre estados de onde nunca chegou
            candidatura. */}
        <div className="space-y-1.5" style={{ minWidth: 120 }}>
          <Label htmlFor="filtro-estado">Estado</Label>
          <select
            id="filtro-estado"
            className={selectClass}
            value={f.instant.estado}
            onChange={(e) => f.setInstant("estado", e.target.value)}
            disabled={estados.length === 0}
          >
            <option value="">{estados.length === 0 ? "Nenhum ainda" : "Todos"}</option>
            {estados.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>

        {/* Período de CHEGADA da candidatura. Sem padrão: um intervalo que
            cai no mês atual sozinho esconderia o histórico inteiro sem avisar,
            que é o defeito que o Histórico de Pedidos já teve (correção 2.1). */}
        {/* Motivo da reprovação: os mesmos 34 códigos do modal, agrupados por
            categoria na ordem da planilha — é a ordem em que o negócio pensa
            os motivos. Escolher um motivo já implica reprovada, então o filtro
            de Status não precisa ser mexido junto. */}
        <div className="space-y-1.5" style={{ minWidth: 190 }}>
          <Label htmlFor="filtro-motivo">Motivo da reprovação</Label>
          <select
            id="filtro-motivo"
            className={selectClass}
            value={f.instant.motivo}
            onChange={(e) => f.setInstant("motivo", e.target.value)}
          >
            <option value="">Todos</option>
            {rejectionCodesByCategory().map((g) => (
              <optgroup key={g.category} label={g.category}>
                {g.codes.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <PeriodoFiltro
          de={f.instant.de}
          ate={f.instant.ate}
          onChange={(p) => f.setInstantMany(p)}
          setor="vendas"
          titulo="Recebimento"
          id="analise"
        />

        {ehGestao && (
          <div className="space-y-1.5" style={{ minWidth: 170 }}>
            <Label>Vendedora</Label>
            <select
              className={selectClass}
              value={f.instant.vendedora}
              onChange={(e) => f.setInstant("vendedora", e.target.value)}
            >
              <option value="">Todas</option>
              {vendedoras.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
