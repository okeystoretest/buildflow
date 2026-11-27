"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/shared/modal";
import { createFollowUp, updateFollowUp } from "@/lib/actions/followups";
import {
  MAX_TEXTO,
  MAX_TOPICO,
  MIN_BUSCA_COLABORADOR,
  type FollowUpKindValue,
} from "@/lib/validations/followup";
import type { ColaboradorOpt, FollowUpRow } from "@/lib/followup-kanban";

/**
 * O formulário de acompanhamento, agora num MODAL.
 *
 * Ele ficava fixo no topo da aba (pedido do dono de 17/11/2026) e saiu de lá
 * em 27/11/2026, quando a tela virou quadro: dez campos de texto longo
 * empurravam as colunas para baixo da dobra, e quem abre um Kanban vem mexer
 * em cartão.
 *
 * NÃO TEM MAIS O SELECT DE "STATUS DE EVOLUÇÃO". Quem é dono do status agora é
 * o quadro — arrastar o cartão, as setas, "Mover para" —, e cada uma dessas
 * ações grava uma linha na trilha de movimentação. Um segundo caminho pelo
 * formulário trocaria o status SEM deixar rastro, e aí o histórico que a
 * especificação pede (item 5) nasceria com buracos e o tempo do trecho se
 * perderia. Registro novo nasce em "Não Iniciado", que é a primeira coluna; se
 * a conversa já estava concluída, arrasta-se o cartão — e esse arrasto fica
 * registrado, o que é o comportamento desejado numa auditoria.
 *
 * Mesma decisão tomada no Cronograma em 26/11/2026, pelo mesmo motivo.
 */

/**
 * A caixa de texto dos campos longos.
 *
 * `resize-none` porque o campo tem teto de caracteres: uma caixa que o usuário
 * esticasse prometeria espaço que o schema recusa.
 *
 * `kanban-scroll` é consequência direta disso: caixa fixa faz o texto rolar por
 * dentro, e a barra que apareceria é a padrão do sistema — 15px, com setas nas
 * pontas, dentro de um campo de 78px de altura. A classe da casa a deixa com
 * 6px, trilho transparente e a cor da borda, escurecendo só enquanto o campo
 * está em foco. É a mesma barra das tabelas do Painel.
 */
const CAMPO =
  "kanban-scroll w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm";

function Texto({
  label,
  help,
  value,
  onChange,
  rows = 3,
  max = MAX_TEXTO,
}: {
  label: string;
  help?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  /** Teto em caracteres. O MESMO do schema — ver `MAX_TEXTO`. */
  max?: number;
}) {
  // O AVISO SO APARECE PERTO DO TETO (ultimo quinto). Oito campos com contador
  // permanente poem oito numeros a competir com os rotulos, num formulario cuja
  // tarefa e escrever; e o teto e tao alto que o numero seria decoracao em 99%
  // das vezes. Mas ele PRECISA aparecer antes de o `maxLength` travar a tecla:
  // digitacao que para de responder sem explicacao e o pior dos dois mundos.
  const restante = max - value.length;
  const perto = restante <= max / 5;
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <textarea
        className={CAMPO}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={max}
      />
      <div className="flex items-start justify-between gap-3">
        {help ? <p className="text-xs text-muted-foreground">{help}</p> : <span />}
        {perto &&
          (restante > 0 ? (
            <p className="shrink-0 font-data text-xs text-muted-foreground">
              {restante.toLocaleString("pt-BR")} caracteres restantes
            </p>
          ) : (
            // `role="status"` so no estado de LIMITE, que acontece uma vez: num
            // contador a cada tecla, a regiao viva viraria tagarelice no leitor
            // de tela. Tom 700/300, os que passam os 4.5:1 da WCAG AA.
            <p role="status" className="shrink-0 text-xs font-medium text-rose-700 dark:text-rose-300">
              Limite de {max.toLocaleString("pt-BR")} caracteres atingido.
            </p>
          ))}
      </div>
    </div>
  );
}

/**
 * Busca do colaborador por digitação, com o mínimo de caracteres que a
 * especificação pede (cinco).
 *
 * FILTRA NO NAVEGADOR, e isto é correto aqui: a lista inteira de usuários
 * ativos são algumas dezenas de nomes, que já vêm com a página. Uma rota de
 * busca no servidor existiria para resolver um volume que esta tela não tem —
 * ao contrário do cadastro de clientes, que tem dezenas de milhares e por isso
 * usa o `CustomerCombobox`.
 */
function BuscaColaborador({
  colaboradores,
  value,
  onChange,
}: {
  colaboradores: readonly ColaboradorOpt[];
  value: string;
  onChange: (id: string) => void;
}) {
  const selecionado = colaboradores.find((c) => c.id === value) ?? null;
  const [termo, setTermo] = useState("");

  const achados = useMemo(() => {
    const t = termo.trim().toLowerCase();
    if (t.length < MIN_BUSCA_COLABORADOR) return [];
    return colaboradores.filter((c) => c.name.toLowerCase().includes(t)).slice(0, 10);
  }, [termo, colaboradores]);

  if (selecionado) {
    return (
      <div className="space-y-1.5">
        <Label>Colaborador</Label>
        <div className="flex h-10 items-center justify-between rounded-lg border border-input bg-secondary/40 px-3 text-sm">
          <span className="font-medium">{selecionado.name}</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              onChange("");
              setTermo("");
            }}
            aria-label="Trocar colaborador"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  const curto = termo.trim().length > 0 && termo.trim().length < MIN_BUSCA_COLABORADOR;

  return (
    <div className="space-y-1.5">
      <Label htmlFor="busca-colaborador">Colaborador</Label>
      <Input
        id="busca-colaborador"
        placeholder={`Digite ${MIN_BUSCA_COLABORADOR} letras do nome...`}
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        autoComplete="off"
      />
      {curto && (
        <p className="text-xs text-muted-foreground">
          Faltam {MIN_BUSCA_COLABORADOR - termo.trim().length} caractere(s) para buscar.
        </p>
      )}
      {achados.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-lg border border-border bg-card">
          {achados.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-secondary/60"
                onClick={() => {
                  onChange(c.id);
                  setTermo("");
                }}
              >
                <span>{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.detalhe}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!curto && termo.trim().length >= MIN_BUSCA_COLABORADOR && achados.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum colaborador com esse nome.</p>
      )}
    </div>
  );
}

const VAZIO = {
  collaboratorId: "",
  heldOn: "",
  strengths: "",
  improvement: "",
  collaboratorView: "",
  actionPlan: "",
  notes: "",
  performance: "",
  topic: "",
  support: "",
  reviewOn: "",
};

export function FollowUpFormModal({
  kind,
  registro,
  colaboradores,
  hoje,
  gestorNome,
  onClose,
}: {
  kind: FollowUpKindValue;
  /** Ausente = "Novo registro". Presente = edição daquele registro. */
  registro?: FollowUpRow;
  colaboradores: readonly ColaboradorOpt[];
  /** "YYYY-MM-DD" de hoje no fuso do negócio, calculado no servidor. */
  hoje: string;
  gestorNome: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // O estado nasce do `registro` NO INICIALIZADOR, e por isso quem abre este
  // modal precisa de uma `key` por registro: sem ela, abrir o segundo registro
  // mostraria os dados do primeiro. Ver o cabeçalho de `kanban-board.tsx` do
  // Relatório Semanal, onde a mesma armadilha está documentada.
  const [f, setF] = useState(() =>
    registro
      ? {
          collaboratorId: registro.collaboratorId,
          heldOn: registro.heldOn,
          strengths: registro.strengths,
          improvement: registro.improvement,
          collaboratorView: registro.collaboratorView,
          actionPlan: registro.actionPlan,
          notes: registro.notes ?? "",
          performance: registro.performance ?? "",
          topic: registro.topic ?? "",
          support: registro.support ?? "",
          reviewOn: registro.reviewOn ?? "",
        }
      : // A data já nasce preenchida com hoje (especificação), e segue
        // editável: a conversa de sexta às vezes é registrada na segunda.
        { ...VAZIO, heldOn: hoje },
  );

  const umAum = kind === "ONE_ON_ONE";
  const set = (k: keyof typeof VAZIO, v: string) => setF((p) => ({ ...p, [k]: v }));

  function salvar() {
    setError(null);
    const payload = { ...f, kind };
    start(async () => {
      const res = registro
        ? await updateFollowUp({ ...payload, id: registro.id })
        : await createFollowUp(payload);
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        // `fieldErrors` traz a mensagem do campo que faltou; sem ela o usuário
        // via só "Dados inválidos." e tinha de adivinhar qual campo era.
        const primeiro = Object.values(res.fieldErrors ?? {})[0]?.[0];
        setError(primeiro ?? res.error);
      }
    });
  }

  return (
    <Modal onClose={() => !pending && onClose()} largura="max-w-4xl">
      <div role="dialog" aria-modal="true" aria-label="Formulário de acompanhamento" className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">
            {registro
              ? "Editar registro"
              : umAum
                ? "Novo One-on-One"
                : "Novo Acompanhamento Quinzenal"}
          </h2>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            aria-label="Fechar"
            className="rounded-lg px-1 text-2xl leading-none text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 border-t border-border pt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <BuscaColaborador
              colaboradores={colaboradores}
              value={f.collaboratorId}
              onChange={(id) => set("collaboratorId", id)}
            />
            <div className="space-y-1.5">
              <Label htmlFor="held-on">{umAum ? "Data de Realização" : "Data do Feedback"}</Label>
              <Input
                id="held-on"
                type="date"
                value={f.heldOn}
                onChange={(e) => set("heldOn", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Gestor Responsável pelo Suporte</Label>
              <div className="flex h-10 items-center rounded-lg border border-input bg-secondary/40 px-3 text-sm text-muted-foreground">
                {registro ? "mantém quem conduziu" : gestorNome}
              </div>
              <p className="text-xs text-muted-foreground">
                Registrado automaticamente: quem preenche o formulário.
              </p>
            </div>
          </div>

          {umAum ? (
            <Texto
              label="Métricas e Indicadores de Desempenho"
              help="Atingimento de metas, postura, pontualidade e qualidade no atendimento."
              value={f.performance}
              onChange={(v) => set("performance", v)}
              rows={4}
            />
          ) : (
            <Texto
              label="Tema Central da Conversa"
              help="Assunto principal, projeto, desafio ou foco do encontro."
              max={MAX_TOPICO}
              value={f.topic}
              onChange={(v) => set("topic", v)}
              rows={2}
            />
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Texto
              label={umAum ? "Reconhecimento e Pontos Fortes" : "Forças em Evidência"}
              help={
                umAum
                  ? "Um elogio fundamentado em fatos concretos da atuação recente."
                  : "Competências, entregas de destaque e comportamentos positivos do período."
              }
              value={f.strengths}
              onChange={(v) => set("strengths", v)}
            />
            <Texto
              label={umAum ? "Oportunidades de Desenvolvimento" : "Ponto de Desenvolvimento"}
              help="O que precisa de aprimoramento ou correção de rota."
              value={f.improvement}
              onChange={(v) => set("improvement", v)}
            />
            <Texto
              label={umAum ? "Perspectiva do Colaborador" : "Reflexão do Colaborador (Frase)"}
              help="Nas palavras dele, o mais fiel possível."
              value={f.collaboratorView}
              onChange={(v) => set("collaboratorView", v)}
            />
            <Texto
              label={umAum ? "Plano de Ação Semanal" : "Plano de Ação Definido"}
              help={
                umAum
                  ? "Uma meta prática e de curto prazo até o próximo acompanhamento."
                  : "Ações práticas e etapas acordadas para o próximo período."
              }
              value={f.actionPlan}
              onChange={(v) => set("actionPlan", v)}
            />
          </div>

          {!umAum && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Texto
                label="Apoio Necessário"
                help="Recursos, treinamentos ou suporte da liderança para viabilizar o plano."
                value={f.support}
                onChange={(v) => set("support", v)}
              />
              <div className="space-y-1.5">
                <Label htmlFor="review-on">Prazo de Reavaliação</Label>
                <Input
                  id="review-on"
                  type="date"
                  value={f.reviewOn}
                  onChange={(e) => set("reviewOn", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Data limite para verificar o progresso das ações.
                </p>
              </div>
            </div>
          )}

          <Texto
            label={umAum ? "Considerações Gerais" : "Observações"}
            help="Opcional: acordos paralelos, intercorrências e recados que merecem registro."
            value={f.notes}
            onChange={(v) => set("notes", v)}
            rows={2}
          />

          {/* O status NÃO está aqui de propósito — ver o cabeçalho do arquivo.
              A linha diz onde ele mudou de lugar, para ninguém procurar o
              campo achando que ele foi esquecido. */}
          {!registro && (
            <p className="text-xs text-muted-foreground">
              O registro nasce em <strong>Não Iniciado</strong>. O Status de Evolução passou a ser do
              quadro: arraste o cartão, ou use &quot;Mover para&quot; na ficha — assim cada mudança
              fica no histórico de movimentação.
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="brand" onClick={salvar} disabled={pending || !f.collaboratorId}>
            {registro ? "Salvar alterações" : "Registrar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
