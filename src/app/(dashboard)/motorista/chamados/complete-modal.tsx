"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Camera, CheckCircle2, Image as ImageIcon, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Mesma lista do servidor (validateUpload em lib/image.ts) e do modal de
// entregas: recusar aqui evita uma ida ao servidor so para ouvir "formato
// nao suportado".
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

// Uma foto de comprovante, obrigatoria — como no quadro do Connect.
// O motorista escolhe a origem: "Camera" abre a captura direta (input com
// capture) e "Galeria" abre o seletor de arquivos do aparelho. Um unico
// input com capture forcaria a camera no celular e esconderia a galeria.
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
  const [localError, setLocalError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

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
    if (!open) {
      setPhoto(null);
      setLocalError(null);
    }
  }, [open]);

  function escolher(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    const ok = ALLOWED.includes(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
    if (!ok) {
      setLocalError("Formato nao suportado. Envie JPG, PNG ou HEIC.");
      return;
    }
    setLocalError(null);
    setPhoto(file);
  }

  const mensagem = localError ?? error;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-lg font-semibold">Concluir chamado</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                {code ?? ""} · anexe a foto do comprovante de entrega.
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Fechar">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {/* Inputs ocultos: camera (captura direta) e galeria (seletor). O
              value e limpo apos cada escolha para que selecionar o mesmo
              arquivo de novo dispare onChange. */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { escolher(e.target.files); e.target.value = ""; }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { escolher(e.target.files); e.target.value = ""; }}
          />

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button
              variant="motorista"
              className="h-auto flex-col gap-1.5 py-4"
              onClick={() => cameraRef.current?.click()}
              disabled={pending}
            >
              <Camera className="h-6 w-6" />
              <span>{photo ? "Tirar outra" : "Câmera"}</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto flex-col gap-1.5 py-4"
              onClick={() => galleryRef.current?.click()}
              disabled={pending}
            >
              <ImageIcon className="h-6 w-6" />
              <span>Galeria</span>
            </Button>
          </div>

          {preview && (
            <div className="relative mt-4 overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Prévia do comprovante" className="max-h-56 w-full object-contain" />
              <button
                type="button"
                onClick={() => { setPhoto(null); setLocalError(null); }}
                disabled={pending}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-destructive"
                aria-label="Remover foto"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {mensagem && <p className="mt-3 text-sm font-medium text-destructive">{mensagem}</p>}

          <div className="mt-5 flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={onClose} disabled={pending}>
              Voltar
            </Button>
            <Button
              variant="motorista"
              className="flex-1"
              disabled={!photo || pending}
              onClick={() => photo && onConfirm(photo)}
            >
              <CheckCircle2 className="mr-2 h-5 w-5" />
              {pending ? "Enviando…" : "Concluir"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
