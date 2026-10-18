"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useFilterQuery } from "@/hooks/use-filter-query";

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
 * AUXILIAR é texto livre (gravado por `setAssistantName`), então as opções são
 * os valores que REALMENTE existem no banco, lidos pela página. Um campo de
 * texto livre aqui faria a vendedora caçar a grafia exata que alguém digitou
 * meses atrás.
 *
 * Marca não entra: a Lov saiu de circulação em 17/10/2026 e sobrou uma marca
 * só. Quando ela voltar, este é o lugar.
 */
export function AnaliseClientesFiltros({
  defaults,
  auxiliares,
  vendedoras,
  ehGestao,
}: {
  defaults: { busca: string; status: string; auxiliar: string; vendedora: string };
  auxiliares: string[];
  vendedoras: { id: string; name: string }[];
  ehGestao: boolean;
}) {
  const f = useFilterQuery(
    { busca: defaults.busca },
    {
      instant: {
        status: defaults.status,
        auxiliar: defaults.auxiliar,
        vendedora: defaults.vendedora,
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

        <div className="space-y-1.5" style={{ minWidth: 160 }}>
          <Label>Auxiliar</Label>
          <select
            className={selectClass}
            value={f.instant.auxiliar}
            onChange={(e) => f.setInstant("auxiliar", e.target.value)}
            disabled={auxiliares.length === 0}
          >
            {/* Sem nenhum auxiliar gravado, o select fica desabilitado e diz
                por quê. Um "Todos" sozinho parece filtro quebrado. */}
            <option value="">{auxiliares.length === 0 ? "Nenhum ainda" : "Todos"}</option>
            {auxiliares.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

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
