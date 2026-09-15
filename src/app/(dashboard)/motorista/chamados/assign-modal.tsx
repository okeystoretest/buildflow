"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AssignModal({
  open,
  code,
  drivers,
  onClose,
  onSelect,
}: {
  open: boolean;
  code: string | null;
  drivers: { id: string; name: string }[];
  onClose: () => void;
  onSelect: (driverId: string, driverName: string) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-lg font-semibold">Atribuir para…</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                {code ? `${code} · escolha quem assume a corrida.` : "Escolha o motorista."}
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Fechar">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
            {drivers.length === 0 && <p className="text-sm text-muted-foreground">Nenhum motorista ativo.</p>}
            {drivers.map((d) => (
              <Button key={d.id} variant="outline" className="w-full justify-start" onClick={() => onSelect(d.id, d.name)}>
                {d.name}
              </Button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
