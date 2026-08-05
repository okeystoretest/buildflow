"use client";

import { useRef, useState } from "react";
import { Camera, Image as ImageIcon, X, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_PHOTOS = 3;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

interface Photo {
  id: string;
  file: File;
  url: string; // objectURL para preview
}

// Modal de conclusão com foto do motorista.
// - Botão "Câmera": captura instantânea, uma por vez (sequencial), até 3.
// - Botão "Galeria": seleção múltipla do dispositivo, respeitando o teto de 3.
// - O somatório (câmera + galeria) nunca passa de 3.
export function CompletePhotoModal({
  pending,
  onSubmit,
  onClose,
}: {
  pending: boolean;
  onSubmit: (files: File[]) => void;
  onClose: () => void;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const restante = MAX_PHOTOS - photos.length;
  const cheio = restante <= 0;

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    const incoming = Array.from(list);

    // Valida tipo.
    const validos = incoming.filter((f) => ALLOWED.includes(f.type) || f.name.match(/\.(jpe?g|png|webp|heic|heif)$/i));
    if (validos.length < incoming.length) {
      setError("Alguns arquivos foram ignorados (envie apenas imagens).");
    }

    setPhotos((prev) => {
      const espaco = MAX_PHOTOS - prev.length;
      if (espaco <= 0) {
        setError(`Limite de ${MAX_PHOTOS} fotos atingido.`);
        return prev;
      }
      const aceitos = validos.slice(0, espaco);
      if (validos.length > espaco) {
        setError(`Você pode anexar no máximo ${MAX_PHOTOS} fotos. As excedentes foram descartadas.`);
      }
      const novos: Photo[] = aceitos.map((file) => ({
        id: `${file.name}_${file.size}_${Math.random().toString(36).slice(2)}`,
        file,
        url: URL.createObjectURL(file),
      }));
      return [...prev, ...novos];
    });
  }

  function remove(id: string) {
    setError(null);
    setPhotos((prev) => {
      const alvo = prev.find((p) => p.id === id);
      if (alvo) URL.revokeObjectURL(alvo.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  function fechar() {
    // Libera os objectURLs.
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    onClose();
  }

  function concluir() {
    if (photos.length === 0) {
      setError("Anexe ao menos 1 foto para concluir.");
      return;
    }
    onSubmit(photos.map((p) => p.file));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={fechar}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-card p-5 shadow-xl sm:rounded-2xl animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Concluir com foto</h3>
          <Button variant="ghost" size="icon" onClick={fechar} aria-label="Fechar">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <p className="mb-3 text-sm text-muted-foreground">
          Anexe até <span className="font-semibold text-foreground">{MAX_PHOTOS}</span> fotos como
          comprovante da entrega. {restante > 0 ? `Você ainda pode adicionar ${restante}.` : "Limite atingido."}
        </p>

        {/* Inputs ocultos: câmera (sequencial) e galeria (múltipla). */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
        />

        {/* Origem das imagens */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="motorista"
            className="h-auto flex-col gap-1.5 py-4"
            onClick={() => cameraRef.current?.click()}
            disabled={cheio || pending}
          >
            <Camera className="h-6 w-6" />
            <span>Câmera</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto flex-col gap-1.5 py-4"
            onClick={() => galleryRef.current?.click()}
            disabled={cheio || pending}
          >
            <ImageIcon className="h-6 w-6" />
            <span>Galeria</span>
          </Button>
        </div>

        {/* Miniaturas das fotos anexadas */}
        {photos.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative aspect-square overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="Comprovante" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  disabled={pending}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-destructive"
                  aria-label="Remover foto"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-sm font-medium text-destructive">{error}</p>}

        {/* Concluir */}
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={fechar} disabled={pending}>
            Cancelar
          </Button>
          <Button
            variant="motorista"
            className="flex-1"
            onClick={concluir}
            disabled={photos.length === 0 || pending}
          >
            <CheckCircle2 className="mr-2 h-5 w-5" />
            {pending ? "Enviando..." : `Concluir (${photos.length})`}
          </Button>
        </div>
      </div>
    </div>
  );
}
