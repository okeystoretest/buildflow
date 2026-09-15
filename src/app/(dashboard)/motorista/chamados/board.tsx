"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import type { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TransportView } from "@/lib/transport/queries";
import { TRANSPORT_COLUMNS, TRANSPORT_STATUS_STYLE } from "@/lib/transport/status";
import {
  assignTransport,
  claimTransport,
  unassignTransport,
  completeTransport,
  cancelTransport,
} from "@/lib/transport/actions";
import { TransportCard } from "./card";
import { DetailModal } from "./detail-modal";
import { AssignModal } from "./assign-modal";
import { CancelModal } from "./cancel-modal";
import { CompleteModal } from "./complete-modal";

/**
 * Quadro de chamados (porta do DriverKanbanBoard do Build.Connect), orientado a
 * ACOES. O tempo real vem do RealtimeProvider do layout: cada evento
 * `transport.*` faz router.refresh() e a pagina re-le o banco.
 */
export function TransportBoard({
  items,
  role,
  userId,
  drivers,
}: {
  items: TransportView[];
  role: Role;
  userId: string;
  drivers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const isManager = role === "LOGISTICA" || role === "GESTAO";
  const canActAsDriver = role === "GESTAO";
  const canClaim = role === "MOTORISTA" || role === "GESTAO";

  const [selected, setSelected] = useState<TransportView | null>(null);
  const [assigning, setAssigning] = useState<TransportView | null>(null);
  const [cancelling, setCancelling] = useState<TransportView | null>(null);
  const [completing, setCompleting] = useState<TransportView | null>(null);
  const [completePending, setCompletePending] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Motorista ve: Em Aberto (para assumir) + os seus. Gestao/Logistica: tudo.
  const visiveis = useMemo(
    () => (isManager ? items : items.filter((i) => i.status === "ABERTO" || i.driverId === userId)),
    [items, isManager, userId],
  );

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(TRANSPORT_COLUMNS.map((s) => [s, [] as TransportView[]])) as Record<
      string,
      TransportView[]
    >;
    for (const i of visiveis) map[i.status]?.push(i);
    return map;
  }, [visiveis]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Falha na ação.");
      router.refresh();
    });
  }

  function concluir(photo: File) {
    if (!completing) return;
    const fd = new FormData();
    fd.set("requestId", completing.id);
    fd.set("photo", photo);
    setCompletePending(true);
    setCompleteError(null);
    start(async () => {
      const res = await completeTransport(fd);
      setCompletePending(false);
      if (res.ok) {
        setCompleting(null);
        router.refresh();
      } else {
        setCompleteError(res.error);
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isManager
            ? "Atribua os chamados vindos do Build.Connect e acompanhe a corrida. O quadro atualiza sozinho."
            : "Assuma um chamado, inicie a rota para transmitir sua localização e conclua com o comprovante."}
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/motorista/chamados/historico">
            <History className="h-4 w-4" /> Histórico
          </Link>
        </Button>
      </div>
      {error && <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {TRANSPORT_COLUMNS.map((status) => {
          const s = TRANSPORT_STATUS_STYLE[status];
          const col = byStatus[status] ?? [];
          return (
            <section
              key={status}
              aria-label={`Coluna ${s.label}`}
              className="flex min-w-0 flex-col rounded-2xl border border-border bg-secondary/30 p-3"
            >
              <header
                className={cn(
                  "mb-3 flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs font-semibold",
                  s.header,
                )}
              >
                <span className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", s.dot)} />
                  {s.label}
                </span>
                <span>{col.length}</span>
              </header>
              <div className="flex-1 space-y-3 overflow-y-auto pr-0.5 [max-height:calc(100vh-22rem)]">
                {col.map((item) => (
                  <TransportCard
                    key={item.id}
                    item={item}
                    currentUserId={userId}
                    isManager={isManager}
                    canActAsDriver={canActAsDriver}
                    canClaim={canClaim}
                    onOpen={setSelected}
                    onClaim={(i) => run(() => claimTransport({ requestId: i.id }))}
                    onAssignOther={setAssigning}
                    onUnassign={(i) => run(() => unassignTransport({ requestId: i.id }))}
                    onComplete={(i) => {
                      setCompleteError(null);
                      setCompleting(i);
                    }}
                    onCancel={setCancelling}
                  />
                ))}
                {col.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                    Nenhum chamado
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <DetailModal item={selected} onClose={() => setSelected(null)} />
      <AssignModal
        open={assigning !== null}
        code={assigning?.code ?? null}
        drivers={drivers}
        onClose={() => setAssigning(null)}
        onSelect={(driverId) => {
          const i = assigning;
          setAssigning(null);
          if (i) run(() => assignTransport({ requestId: i.id, driverId }));
        }}
      />
      <CancelModal
        open={cancelling !== null}
        code={cancelling?.code ?? null}
        onClose={() => setCancelling(null)}
        onConfirm={(reason) => {
          const i = cancelling;
          setCancelling(null);
          if (i) run(() => cancelTransport({ requestId: i.id, reason }));
        }}
      />
      <CompleteModal
        open={completing !== null}
        code={completing?.code ?? null}
        pending={completePending}
        error={completeError}
        onClose={() => !completePending && setCompleting(null)}
        onConfirm={concluir}
      />
    </>
  );
}
