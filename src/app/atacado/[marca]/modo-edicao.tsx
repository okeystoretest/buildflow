"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { salvarImagemDaLp } from "@/lib/actions/lp-assets";
import { shrinkImageToBase64 } from "@/lib/client-image";
import { MAX_ALT, type LugarDeImagem } from "@/lib/lp-assets";

/**
 * Modo de edição oculto das imagens da LP.
 *
 * O QUE PROTEGE O QUE: a autoridade é a sessão, conferida no SERVIDOR a cada
 * chamada (`requireRoleAction(["GESTAO"])` em actions/lp-assets.ts). O gatilho
 * oculto e o `podeEditar` daqui não são segurança — são para a página pública
 * não exibir controles a quem não vai usá-los. Forjar `podeEditar` no navegador
 * revela os botões e não consegue salvar nada.
 *
 * O GATILHO: pressionar e segurar por 800 ms o nome da marca no rodapé. Não é
 * atalho de teclado (seria capturado por leitor de tela e por extensão), não é
 * parâmetro na URL (vazaria por histórico, print e WhatsApp) e não é clique
 * múltiplo (dispara sem querer em celular ao rolar). Funciona com mouse e com
 * toque pelo mesmo evento de ponteiro.
 */

const DURACAO_DO_GATILHO_MS = 800;

interface Contexto {
  podeEditar: boolean;
  editando: boolean;
  alternar: () => void;
  marcaSlug: string;
}

const ModoEdicaoContexto = createContext<Contexto | null>(null);

export function ModoEdicaoProvider({
  podeEditar,
  marcaSlug,
  children,
}: {
  podeEditar: boolean;
  marcaSlug: string;
  children: React.ReactNode;
}) {
  const [editando, setEditando] = useState(false);
  const alternar = useCallback(() => {
    if (!podeEditar) return;
    setEditando((e) => !e);
  }, [podeEditar]);

  return (
    <ModoEdicaoContexto.Provider value={{ podeEditar, editando, alternar, marcaSlug }}>
      {children}
      {podeEditar && editando && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-0 z-[60] flex flex-wrap items-center justify-between gap-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3"
        >
          <p className="rotulo-micro">Modo edição — só você vê isto</p>
          <button type="button" onClick={alternar} className="acao-vazia" style={{ padding: "0.5rem 1rem" }}>
            Sair do modo edição
          </button>
        </div>
      )}
    </ModoEdicaoContexto.Provider>
  );
}

function useModoEdicao(): Contexto {
  const ctx = useContext(ModoEdicaoContexto);
  if (!ctx) {
    // Em vez de lançar: um componente de edição fora do provider não deve
    // derrubar uma página pública inteira.
    return { podeEditar: false, editando: false, alternar: () => {}, marcaSlug: "" };
  }
  return ctx;
}

/**
 * O alvo do gatilho. Envolve o que já está na página (o nome da marca no
 * rodapé) e não desenha nada: quem não sabe que existe não vê diferença.
 */
export function GatilhoOculto({ children }: { children: React.ReactNode }) {
  const { podeEditar, alternar } = useModoEdicao();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function comecar() {
    if (!podeEditar) return;
    limpar();
    timer.current = setTimeout(alternar, DURACAO_DO_GATILHO_MS);
  }
  function limpar() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  // `onPointerDown`/`onPointerUp` cobrem mouse e toque com um par de eventos;
  // `onPointerLeave` e `onPointerCancel` cancelam quando o dedo sai ou o
  // navegador assume a rolagem, para o modo não abrir durante um scroll.
  return (
    <span
      onPointerDown={comecar}
      onPointerUp={limpar}
      onPointerLeave={limpar}
      onPointerCancel={limpar}
      style={{ touchAction: "manipulation" }}
    >
      {children}
    </span>
  );
}

/**
 * Controle de troca de uma imagem. Renderiza NADA fora do modo de edição.
 *
 * Encolhe no navegador pelo mesmo caminho da lojista (inclusive a tentativa de
 * decodificar HEIC antes de cair no original), então o que viaja é pequeno e o
 * servidor recebe o mesmo formato que já sabe validar.
 */
export function EditorDeImagem({
  lugar,
  altAtual,
}: {
  lugar: LugarDeImagem;
  altAtual: string;
}) {
  const { podeEditar, editando, marcaSlug } = useModoEdicao();
  const [alt, setAlt] = useState(altAtual);
  const [estado, setEstado] = useState<"parado" | "lendo" | "salvando">("parado");
  const [aviso, setAviso] = useState<string | null>(null);

  if (!podeEditar || !editando) return null;

  async function escolher(input: HTMLInputElement) {
    const file = input.files?.[0];
    setAviso(null);
    if (!file) return;

    setEstado("lendo");
    const r = await shrinkImageToBase64(file, { maxDimension: 1600 });
    if (r.error !== undefined) {
      setEstado("parado");
      setAviso(r.error);
      input.value = "";
      return;
    }

    setEstado("salvando");
    try {
      const res = await salvarImagemDaLp({ marcaSlug, lugar, imagem: r.base64, alt });
      if (res.ok) {
        setAviso("Imagem trocada. Recarregue para ver no lugar.");
      } else {
        setAviso(res.error);
      }
    } catch {
      setAviso("Não foi possível salvar agora. Confira a conexão.");
    } finally {
      setEstado("parado");
      input.value = "";
    }
  }

  return (
    <div className="absolute inset-x-3 bottom-3 z-10 border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-left">
      <p className="rotulo-micro">Trocar imagem · {lugar}</p>
      <label htmlFor={`alt-${lugar}`} className="rotulo-campo mt-2 block">
        Descrição da imagem (para leitor de tela)
      </label>
      <input
        id={`alt-${lugar}`}
        value={alt}
        maxLength={MAX_ALT}
        onChange={(e) => setAlt(e.target.value)}
        className="campo-regua"
      />
      <input
        type="file"
        accept="image/*,.heic,.heif"
        disabled={estado !== "parado"}
        onChange={(e) => escolher(e.currentTarget)}
        className="mt-3"
        aria-label={`Escolher nova imagem para ${lugar}`}
      />
      {estado !== "parado" && (
        <p className="corpo-pequeno mt-2 text-[hsl(var(--muted-foreground))]">
          {estado === "lendo" ? "Preparando a imagem…" : "Salvando…"}
        </p>
      )}
      {aviso && (
        <p role="alert" className="corpo-pequeno mt-2">
          {aviso}
        </p>
      )}
    </div>
  );
}
