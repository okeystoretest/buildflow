"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X, MapPin, Phone, User, Clock } from "lucide-react";
import type { TransportView } from "@/lib/transport/queries";
import { TRANSPORT_STATUS_STYLE } from "@/lib/transport/status";
import { cn } from "@/lib/utils";

const EVENT_LABEL: Record<string, string> = {
  criado: "Aberto no Build.Connect",
  atribuido: "Atribuído",
  assumido: "Assumido",
  desatribuido: "Desatribuído",
  em_rota: "Em rota",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function DetailModal({ item, onClose }: { item: TransportView | null; onClose: () => void }) {
  const s = item ? TRANSPORT_STATUS_STYLE[item.status] : null;
  return (
    <Dialog.Root open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl">
          {item && s && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-data text-xs text-muted-foreground">{item.code}</p>
                  <Dialog.Title className="text-lg font-semibold">{item.serviceType}</Dialog.Title>
                  <Dialog.Description className="sr-only">Detalhes do chamado {item.code}</Dialog.Description>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", s.badge)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
                    {s.label}
                  </span>
                  <Dialog.Close className="rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Fechar">
                    <X className="h-4 w-4" />
                  </Dialog.Close>
                </div>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm">{item.description}</p>

              <div className="mt-4 space-y-2 text-sm">
                <p className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  {item.requesterName}
                  {item.requesterSector ? ` · ${item.requesterSector}` : ""}
                </p>
                {item.contact && (
                  <p className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    {item.contact}
                  </p>
                )}
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <span>
                    <span className="text-muted-foreground">De:</span> {item.originLabel}
                    <br />
                    <span className="text-muted-foreground">Para:</span> {item.destLabel}
                  </span>
                </p>
                {item.driverName && (
                  <p className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Responsável: {item.driverName}
                  </p>
                )}
                {item.distanceKm !== null && <p className="text-muted-foreground">{item.distanceKm} km percorridos</p>}
                {item.cancelReason && <p className="text-destructive">Cancelado: {item.cancelReason}</p>}
              </div>

              {item.images.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {item.images.map((img) => (
                    <a key={img.id} href={img.filePath} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.filePath} alt="" className="h-24 w-full rounded-lg object-cover" />
                    </a>
                  ))}
                </div>
              )}
              {item.proofPath && (
                <div className="mt-4">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Comprovante</p>
                  <a href={item.proofPath} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.proofPath} alt="Comprovante de entrega" className="max-h-48 rounded-lg object-contain" />
                  </a>
                </div>
              )}

              <div className="mt-4 border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Histórico</p>
                <ul className="space-y-1 text-xs">
                  {item.history.map((h, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>
                        {EVENT_LABEL[h.event] ?? h.event}
                        {h.actorName ? ` · ${h.actorName}` : ""}
                        {h.note ? ` — ${h.note}` : ""}
                      </span>
                      <span className="shrink-0 text-muted-foreground">{dataHora(h.at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
