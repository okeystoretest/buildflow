"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  /**
   * Alguma gravação em voo, em QUALQUER lugar de imagem.
   *
   * Existe porque o manifesto é um read-modify-write sem transação, e o risco
   * real não é "dois editores": é o MESMO dono trocando duas imagens em
   * sequência. A página renderiza um editor por lugar, cada um com seu
   * `<input type="file">`; encolher mais sharp mais disco leva segundos no
   * celular, e tocar em `motivo-1` enquanto o `hero` sobe produzia duas actions
   * concorrentes lendo o manifesto antigo. A segunda sobrescrevia a entrada da
   * primeira: a imagem já gravada desaparecia da página e o arquivo ficava
   * órfão no volume para sempre — e as duas chamadas respondiam "Imagem
   * trocada". Serializar na interface honra a premissa registrada ("existe um
   * editor só") em vez de contradizê-la.
   */
  ocupado: boolean;
  marcarOcupado: (v: boolean) => void;
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
  const [ocupado, setOcupado] = useState(false);
  const alternar = useCallback(() => {
    if (!podeEditar) return;
    setEditando((e) => !e);
  }, [podeEditar]);
  const marcarOcupado = useCallback((v: boolean) => setOcupado(v), []);

  return (
    <ModoEdicaoContexto.Provider
      value={{ podeEditar, editando, alternar, marcaSlug, ocupado, marcarOcupado }}
    >
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
    return {
      podeEditar: false,
      editando: false,
      alternar: () => {},
      marcaSlug: "",
      ocupado: false,
      marcarOcupado: () => {},
    };
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
  // `user-select: none` e `-webkit-touch-callout: none` NÃO são enfeite: sem
  // eles, pressionar e segurar texto selecionável dispara a seleção nativa no
  // Android e o callout no iOS por volta de 500 ms — antes dos 800 ms do timer.
  // Nesse instante o navegador assume o gesto e emite `pointercancel`, que o
  // `onPointerCancel` abaixo traduz em `limpar()`: o timer morre e o modo de
  // edição nunca abre. `touch-action: manipulation` só desliga duplo-toque-para-
  // zoom; não desliga seleção nem callout. Este é o único caminho de entrada da
  // feature, então o gesto falhar é a feature inteira falhar.
  //
  // `<div>` e não `<span>`: o filho é um `<p>`, e bloco dentro de inline é HTML
  // inválido — o parser do navegador (que vê este HTML no SSR) reestrutura a
  // caixa e isso arrisca divergência de hidratação.
  return (
    <div
      onPointerDown={comecar}
      onPointerUp={limpar}
      onPointerLeave={limpar}
      onPointerCancel={limpar}
      style={{
        touchAction: "manipulation",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      {children}
    </div>
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
  const { podeEditar, editando, marcaSlug, ocupado, marcarOcupado } = useModoEdicao();
  const router = useRouter();
  const [alt, setAlt] = useState(altAtual);
  const [estado, setEstado] = useState<"parado" | "lendo" | "salvando">("parado");
  const [aviso, setAviso] = useState<string | null>(null);

  if (!podeEditar || !editando) return null;

  // Teto do mesmo tamanho que a porta pública aceita. O `shrinkImageToBase64`
  // devolve o ORIGINAL quando não consegue decodificar (é o caso do HEIC de
  // iPhone em navegador que não o lê), então "sem erro" não significa "pequeno".
  // Sem esta conferência, um HEIC grande estourava o `bodySizeLimit` de 12 MB e
  // o `catch` culpava a conexão — a única coisa que não estava errada.
  const MAX_BYTES = 4 * 1024 * 1024;
  const bytesDoBase64 = (b64: string) =>
    Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);

  async function escolher(input: HTMLInputElement) {
    const file = input.files?.[0];
    setAviso(null);
    if (!file) return;

    setEstado("lendo");
    marcarOcupado(true);
    const r = await shrinkImageToBase64(file, { maxDimension: 1600 });
    if (r.error !== undefined) {
      setEstado("parado");
      marcarOcupado(false);
      setAviso(r.error);
      input.value = "";
      return;
    }
    if (bytesDoBase64(r.base64) > MAX_BYTES) {
      setEstado("parado");
      marcarOcupado(false);
      const ehHeic = file.type === "image/heic" || file.type === "image/heif";
      setAviso(
        ehHeic
          ? "Não conseguimos reduzir esta foto. Se ela veio do iPhone, abra a foto, " +
              "toque em Editar, salve e envie novamente."
          : "Esta foto está pesada demais (máximo de 4MB). Escolha uma mais leve.",
      );
      input.value = "";
      return;
    }

    setEstado("salvando");
    try {
      const res = await salvarImagemDaLp({ marcaSlug, lugar, imagem: r.base64, alt });
      if (res.ok) {
        setAviso("Imagem trocada.");
        // `revalidatePath` sozinho não aparece aqui: a rota é dinâmica
        // (searchParams), então sem o refresh o dono não tinha confirmação
        // visual nenhuma de que a imagem certa entrou.
        router.refresh();
      } else {
        setAviso(res.error);
      }
    } catch {
      setAviso("Não foi possível salvar agora. Confira a conexão.");
    } finally {
      setEstado("parado");
      marcarOcupado(false);
      input.value = "";
    }
  }

  async function salvarDescricao() {
    setAviso(null);
    setEstado("salvando");
    marcarOcupado(true);
    try {
      const res = await salvarImagemDaLp({ marcaSlug, lugar, imagem: "", alt });
      if (res.ok) {
        setAviso("Descrição salva.");
        router.refresh();
      } else {
        setAviso(res.error);
      }
    } catch {
      setAviso("Não foi possível salvar agora. Confira a conexão.");
    } finally {
      setEstado("parado");
      marcarOcupado(false);
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
        disabled={ocupado}
        onChange={(e) => setAlt(e.target.value)}
        className="campo-regua"
      />
      <button
        type="button"
        onClick={salvarDescricao}
        disabled={ocupado || alt === altAtual}
        className="acao-vazia mt-2"
        style={{ padding: "0.4rem 0.9rem" }}
      >
        Salvar descrição
      </button>
      <input
        type="file"
        accept="image/*,.heic,.heif"
        // `ocupado` e não só o estado local: o travamento é GLOBAL enquanto
        // qualquer lugar grava, porque o manifesto é lido e reescrito inteiro.
        disabled={ocupado || estado !== "parado"}
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
