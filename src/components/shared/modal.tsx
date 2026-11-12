"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * AS DUAS CAMADAS DE MODAL, e por que elas precisam estar escritas num lugar só.
 *
 * O app tem modal que abre DE DENTRO de outro modal: a ficha do pedido traz
 * "Editar Entrega" e "Fazer devolução" no rodapé dela. Quando o segundo nasce
 * numa camada ABAIXO do primeiro, o sintoma não parece um erro de z-index —
 * o fundo escurece (o véu do segundo aparece), a ficha continua por cima e o
 * painel de edição simplesmente não está em lugar nenhum. Foi o que acontecia
 * no Histórico de Entregas (relatado em 12/11/2026): `EditProofsModal` estava
 * em `z-50` e `ReturnModal` em `z-60`, os dois debaixo do `z-[100]` da ficha.
 *
 * Cada número solto no seu arquivo é como isso passa despercebido: ninguém
 * compara `z-50` aqui com `z-[100]` três pastas adiante. Com as duas camadas
 * nomeadas, escolher é responder a uma pergunta — "este modal abre sozinho ou
 * por cima de outro?".
 */
export const CAMADA_MODAL = "z-[100]";
export const CAMADA_SOBRE_MODAL = "z-[110]";

/**
 * A moldura dos modais do histórico: fundo escuro, caixa rolável, ESC e portal.
 *
 * PORTAL no `<body>`, e não um `fixed` no lugar: os cards da grade usam
 * `card-hover`, que aplica `transform` — e um ancestral com transform PRENDE o
 * `position: fixed`, fazendo o modal aparecer no lugar errado e sem cobrir a
 * tela. É o mesmo defeito que o `order-detail-modal` já documenta.
 *
 * EM TELA CHEIA o portal vai para o `fullscreenElement`: o navegador só pinta
 * descendentes dele, então um modal no `<body>` existiria e ficaria INVISÍVEL.
 * O quadro do Fluxo tem botão de tela cheia, e o histórico é aberto do lado.
 *
 * ESC fecha: a ficha é longa e quem rolou até o fim está longe do X.
 *
 * O `order-detail-modal` continua com a moldura própria dele, idêntica a esta.
 * Não o migrei junto de propósito: é o modal mais usado do app, aparece em
 * cinco telas, e trocar a casca dele sem poder conferir nenhuma delas na tela
 * é um risco que esta mudança não precisa correr. Quando alguém encostar nele,
 * é aqui que ele deve cair.
 */
export function Modal({
  children,
  onClose,
  largura = "max-w-2xl",
}: {
  children: React.ReactNode;
  onClose: () => void;
  /** Classe de largura máxima (`max-w-sm` numa confirmação, `max-w-2xl` numa ficha). */
  largura?: string;
}) {
  const [alvo, setAlvo] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const sync = () =>
      setAlvo((document.fullscreenElement as HTMLElement | null) ?? document.body);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!alvo) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in",
        CAMADA_MODAL,
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          "max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl animate-scale-in",
          largura,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    alvo,
  );
}
