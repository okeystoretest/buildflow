"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/shared/modal";
import { gerarRoteiro, salvarRoteiro } from "@/lib/actions/cronograma";
import type { Atividade } from "@/lib/cronograma-data";

/** O mesmo teto da action. O contador precisa dizer a verdade. */
const MAX = 20_000;

/**
 * O ROTEIRO DA PEÇA: rascunho da IA, acabamento da pessoa.
 *
 * UM CAMPO DE TEXTO, e não um visualizador com um botão de copiar: o roteiro
 * da IA é RASCUNHO, e o fluxo real é gerar e mexer. Um texto que só se lê
 * obrigaria a copiar para outro lugar, editar lá e colar de volta — e o que
 * ficaria guardado aqui seria sempre a versão errada.
 *
 * GERAR SOBRESCREVE O QUE ESTÁ NA TELA, e por isso pergunta antes quando já
 * há texto: a geração leva segundos e custa cota, mas o que ela apagaria é
 * trabalho da pessoa, que não volta.
 *
 * SEPARADO DO FORMULÁRIO DA PEÇA de propósito. O roteiro é escrito depois,
 * numa sentada própria, e enfiá-lo no formulário faria toda edição de data ou
 * de formato abrir uma tela com um texto longo no meio.
 */
export function RoteiroModal({ atividade, onClose }: { atividade: Atividade; onClose: () => void }) {
  const router = useRouter();
  const [texto, setTexto] = useState(atividade.script ?? "");
  const [ocupado, setOcupado] = useState<"gerando" | "salvando" | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gerar() {
    if (ocupado) return;
    setConfirmando(false);
    setOcupado("gerando");
    setErro(null);
    const r = await gerarRoteiro(atividade.id);
    setOcupado(null);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    setTexto(r.data.texto);
    router.refresh();
  }

  async function salvar() {
    if (ocupado) return;
    setOcupado("salvando");
    setErro(null);
    const r = await salvarRoteiro(atividade.id, texto);
    setOcupado(null);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    router.refresh();
    onClose();
  }

  const assinatura =
    atividade.scriptUpdatedAt && atividade.scriptPor
      ? `Escrito por ${atividade.scriptPor} · ${new Date(atividade.scriptUpdatedAt).toLocaleDateString(
          "pt-BR",
          { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" },
        )}`
      : null;

  return (
    <Modal onClose={() => !ocupado && onClose()} largura="max-w-2xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">Roteiro</h2>
          <p className="truncate text-sm text-muted-foreground">{atividade.title}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} disabled={!!ocupado} aria-label="Fechar">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {/* A ASSINATURA É DO QUE ESTÁ GUARDADO, não do que está na caixa: ela
            não muda enquanto a pessoa digita, porque ainda não foi salvo. */}
        <p className="text-xs text-muted-foreground">{assinatura ?? "Ainda sem roteiro."}</p>
        <span className="text-xs text-muted-foreground">
          {texto.length.toLocaleString("pt-BR")}/{MAX.toLocaleString("pt-BR")}
        </span>
      </div>

      <Textarea
        rows={14}
        value={texto}
        maxLength={MAX}
        disabled={ocupado === "gerando"}
        placeholder="Escreva o roteiro, ou gere um rascunho com a IA e ajuste aqui."
        onChange={(e) => setTexto(e.target.value)}
        aria-label="Texto do roteiro"
      />

      {erro && <p className="mt-3 text-xs text-destructive">{erro}</p>}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        {confirmando ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Isto apaga o texto atual.</span>
            <Button variant="destructive" size="sm" onClick={gerar} disabled={!!ocupado}>
              Gerar mesmo assim
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
              Não
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            onClick={() => (texto.trim() ? setConfirmando(true) : gerar())}
            disabled={!!ocupado}
          >
            <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />
            {ocupado === "gerando" ? "Gerando…" : "Gerar com IA"}
          </Button>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={!!ocupado}>
            Fechar
          </Button>
          <Button onClick={salvar} disabled={!!ocupado}>
            {ocupado === "salvando" ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
