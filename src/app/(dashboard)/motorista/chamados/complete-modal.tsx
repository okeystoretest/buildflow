"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

// Uma foto de comprovante, obrigatoria — como no quadro do Connect.
export function CompleteModal({
  open,
  code,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  code: string | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (photo: File) => void;
}) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // A URL de previa e criada uma vez por foto e liberada quando ela muda ou o
  // modal fecha — criar no render vazaria uma URL por repintura.
  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    if (!open) setPhoto(null);
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-lg font-semibold">Concluir chamado</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                {code ?? ""} · envie a foto do comprovante de entrega.
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Fechar">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="mt-4 space-y-2">
            <Label htmlFor="proof">Comprovante *</Label>
            <input
              id="proof"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Prévia do comprovante" className="max-h-56 rounded-lg object-contain" />
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Voltar
            </Button>
            <Button
              className="bg-motorista text-white hover:bg-motorista/90"
              disabled={!photo || pending}
              onClick={() => photo && onConfirm(photo)}
            >
              <Camera className="h-4 w-4" /> {pending ? "Enviando…" : "Concluir"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
