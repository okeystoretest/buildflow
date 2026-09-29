"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Image as ImageIcon, X, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shrinkImageToBase64 } from "@/lib/client-image";
import { updateDeliveryProofs } from "@/lib/actions/delivery-proofs";

const MAX_PHOTOS = 3;

export interface EditProof {
  id: string;
  filePath: string;
}

// Foto nova, ainda não enviada (preview local via base64).
interface NovaFoto {
  key: string;
  base64: string;
}

/**
 * Modal de gestão das fotos de uma entrega no Histórico do Motorista.
 *  - Lista as fotos já enviadas (podem ser marcadas para exclusão).
 *  - Permite adicionar novas fotos por Câmera (captura nativa) ou Galeria.
 *  - Salva tudo num passo: exclusões + adições persistem no servidor e a
 *    listagem é atualizada em tempo real (via onSaved).
 * O teto de MAX_PHOTOS considera (existentes − marcadas p/ excluir + novas).
 */
export function EditProofsModal({
  deliveryId,
  initialProofs,
  onClose,
  onSaved,
}: {
  deliveryId: string;
  initialProofs: EditProof[];
  onClose: () => void;
  onSaved: (proofs: EditProof[]) => void;
}) {
  const [existentes] = useState<EditProof[]>(initialProofs);
  const [removerIds, setRemoverIds] = useState<string[]>([]);
  const [novas, setNovas] = useState<NovaFoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const restantesExistentes = existentes.filter((p) => !removerIds.includes(p.id)).length;
  const totalAtual = restantesExistentes + novas.length;
  const espaco = MAX_PHOTOS - totalAtual;
  const cheio = espaco <= 0;

  function toggleRemover(id: string) {
    setError(null);
    setRemoverIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    const incoming = Array.from(list);

    // Recalcula o espaço no momento do add (estado pode ter mudado).
    const espacoAtual = MAX_PHOTOS - (restantesExistentes + novas.length);
    if (espacoAtual <= 0) {
      setError(`Limite de ${MAX_PHOTOS} fotos atingido.`);
      return;
    }
    const aceitar = incoming.slice(0, espacoAtual);
    if (incoming.length > espacoAtual) {
      setError(`Você pode ter no máximo ${MAX_PHOTOS} fotos. As excedentes foram descartadas.`);
    }

    const preparadas: NovaFoto[] = [];
    for (const file of aceitar) {
      const res = await shrinkImageToBase64(file, { maxDimension: 1600, quality: 0.8 });
      if (res.error || !res.base64) {
        if (res.error) setError(res.error);
        continue;
      }
      const base64 = res.base64;
      preparadas.push({
        key: `${file.name}_${file.size}_${Math.random().toString(36).slice(2)}`,
        base64,
      });
    }
    if (preparadas.length) setNovas((prev) => [...prev, ...preparadas]);
  }

  function removerNova(key: string) {
    setError(null);
    setNovas((prev) => prev.filter((n) => n.key !== key));
  }

  function salvar() {
    if (removerIds.length === 0 && novas.length === 0) {
      setError("Nenhuma alteração para salvar.");
      return;
    }
    if (totalAtual === 0) {
      setError("A entrega deve manter ao menos 1 foto.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateDeliveryProofs({
        deliveryId,
        removeProofIds: removerIds,
        addPhotosBase64: novas.map((n) => n.base64),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved(res.data.proofs);
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={pending ? undefined : onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-card p-5 shadow-xl sm:rounded-2xl animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Editar fotos da entrega</h3>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={pending} aria-label="Fechar">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <p className="mb-3 text-sm text-muted-foreground">
          Gerencie os comprovantes: remova fotos antigas ou anexe novas
          (até <span className="font-semibold text-foreground">{MAX_PHOTOS}</span> no total).
          {espaco > 0 ? ` Você ainda pode adicionar ${espaco}.` : " Limite atingido."}
        </p>

        {/* Fotos já enviadas */}
        {existentes.length > 0 && (
          <div className="mb-4">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Fotos atuais</p>
            <div className="grid grid-cols-3 gap-2">
              {existentes.map((p) => {
                const marcada = removerIds.includes(p.id);
                return (
                  <div
                    key={p.id}
                    className="relative aspect-square overflow-hidden rounded-lg border border-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.filePath}
                      alt="Comprovante"
                      className={marcada ? "h-full w-full object-cover opacity-30 grayscale" : "h-full w-full object-cover"}
                    />
                    <button
                      type="button"
                      onClick={() => toggleRemover(p.id)}
                      disabled={pending}
                      className={
                        marcada
                          ? "absolute inset-0 flex items-center justify-center bg-destructive/20 text-xs font-semibold text-destructive"
                          : "absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-destructive"
                      }
                      aria-label={marcada ? "Desfazer remoção" : "Remover foto"}
                    >
                      {marcada ? "Desfazer" : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Inputs ocultos: câmera (captura) e galeria (múltipla). */}
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

        {/* Origem das novas imagens */}
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

        {/* Miniaturas das fotos novas (ainda não salvas) */}
        {novas.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Novas fotos</p>
            <div className="grid grid-cols-3 gap-2">
              {novas.map((n) => (
                <div key={n.key} className="relative aspect-square overflow-hidden rounded-lg border border-motorista/50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={n.base64} alt="Nova foto" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removerNova(n.key)}
                    disabled={pending}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-destructive"
                    aria-label="Descartar nova foto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-sm font-medium text-destructive">{error}</p>}

        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button
            variant="motorista"
            className="flex-1"
            onClick={salvar}
            disabled={pending || (removerIds.length === 0 && novas.length === 0)}
          >
            <Save className="mr-2 h-5 w-5" />
            {pending ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </div>
    </div>
  );
}
