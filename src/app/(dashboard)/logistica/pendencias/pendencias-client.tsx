"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Clock } from "lucide-react";
import type { OrderStatus } from "@prisma/client";
import { STATUS_LABEL } from "@/lib/order-flow";
import { formatDuracao, type CicloPendencia } from "@/lib/pendencias";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";

export interface PendenciaPedido {
  id: string;
  orderNumber: string;
  comandaNumber: string | null;
  status: OrderStatus;
  pieceCount: number;
  customerName: string;
  customerCode: string;
  sellerName: string;
  orderTypeName: string;
  originStoreName: string | null;
  criadoEm: string;
  ciclos: CicloPendencia[];
  financeIssue: string | null;
  financeIssueAt: string | null;
  financeIssueResolvedAt: string | null;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Minutos decorridos até agora (para pendências ainda abertas). */
function minutosAte(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}

export function PendenciasList({ pedidos }: { pedidos: PendenciaPedido[] }) {
  // Um pedido aberto por vez: a ficha é densa e a leitura fica melhor focada.
  const [abertoId, setAbertoId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {pedidos.map((p) => {
        const aberto = abertoId === p.id;
        const emAberto = p.ciclos.filter((c) => !c.resolvidaEm).length;
        const financeiroAtivo = !!p.financeIssue && !p.financeIssueResolvedAt;

        return (
          <Card key={p.id} className={emAberto > 0 ? "border-amber-500/50" : undefined}>
            <CardContent className="pt-5">
              <button
                type="button"
                onClick={() => setAbertoId(aberto ? null : p.id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-data text-sm font-semibold">
                    <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${aberto ? "rotate-90" : ""}`} />
                    Pedido {p.orderNumber}
                    {p.comandaNumber && ` · Comanda ${p.comandaNumber}`}
                  </p>
                  <p className="mt-0.5 truncate pl-6 text-sm">
                    {p.customerName}
                    <span className="font-data ml-2 rounded-md bg-secondary px-1.5 py-0.5 text-xs">
                      Cód. {p.customerCode}
                    </span>
                  </p>
                  <p className="pl-6 text-xs text-muted-foreground">
                    Vendedora: {p.sellerName} · {p.orderTypeName}
                    {p.originStoreName && ` · ${p.originStoreName}`}
                    {p.pieceCount > 0 && ` · ${p.pieceCount} peça(s)`}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <StatusBadge status={p.status} />
                  <span className="text-xs text-muted-foreground">
                    {p.ciclos.length} pendência(s)
                  </span>
                  {emAberto > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="h-3 w-3" /> {emAberto} em aberto
                    </span>
                  )}
                </div>
              </button>

              {aberto && (
                <div className="mt-4 space-y-3 border-t border-border pt-4">
                  {/* Pendência do FINANCEIRO ("Qual o problema?"), quando houver. */}
                  {p.financeIssue && (
                    <div
                      className={`rounded-lg border p-3 text-sm ${
                        financeiroAtivo
                          ? "border-destructive/40 bg-destructive/10"
                          : "border-border bg-secondary/40"
                      }`}
                    >
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <AlertTriangle className="h-3.5 w-3.5" /> Pendência do Financeiro
                      </p>
                      <p className="mt-1">{p.financeIssue}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sinalizada em {fmt(p.financeIssueAt)}
                        {p.financeIssueResolvedAt
                          ? ` · resolvida em ${fmt(p.financeIssueResolvedAt)}`
                          : " · ainda em aberto"}
                      </p>
                    </div>
                  )}

                  {p.ciclos.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Sem detalhamento de pendência logística registrado neste pedido.
                    </p>
                  )}

                  {p.ciclos.map((c, i) => (
                    <CicloCard key={c.id} ciclo={c} indice={p.ciclos.length - i} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function CicloCard({ ciclo, indice }: { ciclo: CicloPendencia; indice: number }) {
  const resolvida = !!ciclo.resolvidaEm;
  const duracao = resolvida ? ciclo.duracaoMin : minutosAte(ciclo.abertaEm);

  return (
    <div
      className={`rounded-lg border p-3 ${
        resolvida ? "border-border bg-secondary/30" : "border-amber-500/50 bg-amber-500/10"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {resolvida ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
          )}
          Pendência #{indice} · {resolvida ? "Resolvida" : "Em aberto"}
        </p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {resolvida ? "Levou" : "Aberta há"} {formatDuracao(duracao)}
        </p>
      </div>

      {/* Registro da pendência */}
      <div className="mt-2">
        <p className="text-sm">{ciclo.descricao}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Registrada em {fmt(ciclo.abertaEm)}
          {ciclo.abertaPor && ` · por ${ciclo.abertaPor}`}
        </p>
      </div>

      {/* Tratativas ocorridas entre a abertura e o fechamento */}
      {ciclo.respostas.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Respostas / tratativas
          </p>
          <ul className="mt-1 space-y-1.5">
            {ciclo.respostas.map((r) => (
              <li key={r.id} className="rounded-md bg-background/70 px-2 py-1.5 text-xs leading-snug">
                <p className="font-medium">{STATUS_LABEL[r.status]}</p>
                {r.note && <p className="mt-0.5">{r.note}</p>}
                <p className="mt-0.5 text-muted-foreground">
                  {fmt(r.createdAt)}
                  {r.autor && ` · por ${r.autor}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Resolução */}
      {resolvida && (
        <div className="mt-3 rounded-md border border-emerald-600/30 bg-emerald-500/10 px-2 py-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Resolução
          </p>
          <p className="mt-0.5 text-sm">{ciclo.resolucao}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fmt(ciclo.resolvidaEm)}
            {ciclo.resolvidaPor && ` · por ${ciclo.resolvidaPor}`}
          </p>
        </div>
      )}
    </div>
  );
}
