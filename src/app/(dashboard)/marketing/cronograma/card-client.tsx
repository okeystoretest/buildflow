"use client";

import { useState } from "react";
import { CalendarDays, Clock, Tag, User as UserIcon, X } from "lucide-react";
import { IconeDaRede } from "./plataforma-icone";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/shared/modal";
import type { Atividade } from "@/lib/cronograma-data";
import { AtividadeModal } from "./atividade-modal";
import { RoteiroModal } from "./roteiro-modal";
import {
  corDoCard,
  corDeMarca,
  CORES_DE_FORMATO,
  CORES_DE_FUNIL,
  CORES_DE_PLATAFORMA,
  corDoStatus,
  estiloDeSelo,
  estiloSolido,
  rotuloDeFunil,
  rotuloDeStatus,
  dataEHoraDaAtividade,
  rotuloDeFormato,
  rotuloDeMarca,
  rotuloDePlataforma,
  seloDeFormatos,
} from "@/lib/cronograma";
import { cn } from "@/lib/utils";

/**
 * O CARD DO CALENDÁRIO e a ficha que ele abre.
 *
 * É o único pedaço de JavaScript desta tela, e é por isso que ele é um arquivo
 * só: a grade, o cabeçalho e os botões de período continuam sendo servidos
 * prontos. Abrir uma ficha é interação de verdade — diferente de trocar de
 * mês, que é navegação e por isso continua `<Link>`.
 *
 * A FICHA MOSTRA DATA, HORÁRIO, FORMATOS, REDES E OBSERVAÇÕES (pedido do dono,
 * 06/11/2026). Funil, marca e responsável ficam de FORA: no card eles já
 * aparecem inteiros, e repetir faria a pessoa procurar duas vezes a mesma
 * coisa. O título fica porque é o que diz QUAL card foi aberto.
 *
 * FORMATOS E REDES ENTRAM porque no card eles estão CORTADOS: o formato vira
 * "REEL +2" para caber numa célula de sete colunas, e a rede é só um ícone
 * mudo. Aqui saem por extenso, que é a única forma de saber o que é "+2".
 *
 * O HORÁRIO É O DADO NOVO DE VERDADE: existe em `scheduledAt` desde sempre e
 * nunca apareceu em lugar nenhum do Flow.
 *
 * O LÁPIS SÓ APARECE EM PEÇA DAQUI E SUA (`podeEditar`, calculado no
 * servidor). A atividade do Build.Connect abre a mesma ficha, em leitura, e diz de
 * onde veio — sem essa linha, um card sem botão de editar parece defeito, e a
 * pessoa procura o lápis que nunca existiu.
 */

/**
 * UMA INFORMAÇÃO DENTRO DA PRÓPRIA MOLDURA — é o `Field` da ficha do
 * Build.Connect, com os mesmos valores: canto arredondado, borda do tema,
 * fundo levemente erguido, rótulo de 10px em versalete com o ícone antes.
 *
 * A moldura não é enfeite: sem ela, rótulo e valor viram uma lista corrida e
 * "Data / Horário / Responsável / Criado por" se lê como um parágrafo.
 */
function Campo({
  icone,
  rotulo,
  children,
}: {
  icone: React.ReactNode;
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icone}
        {rotulo}
      </p>
      <div className="mt-1.5 text-sm">{children}</div>
    </div>
  );
}


export function CardDaAtividade({
  atividade,
  pessoas,
}: {
  atividade: Atividade;
  pessoas: readonly { id: string; name: string }[];
}) {
  const [aberta, setAberta] = useState(false);
  const [editando, setEditando] = useState(false);
  const [noRoteiro, setNoRoteiro] = useState(false);
  const marca = corDeMarca(atividade.brand);
  const formatos = seloDeFormatos(atividade.formats);
  const quando = dataEHoraDaAtividade(atividade.scheduledAt);
  // O selo sem cor própria (marca, responsável). No card de MARCA o fundo é
  // claro e fixo nos dois temas, então o selo tem de ser também — o cinza do
  // tema escuro sobre o amarelo da OKEY seria uma mancha.
  const chipNeutro = marca
    ? "border-black/15 bg-white/55"
    : "border-border bg-secondary text-muted-foreground";

  return (
    <>
      {/* `<button>` e não um `<div onClick>`: o teclado abre com Enter e o
          leitor de tela anuncia que isto abre alguma coisa. */}
      <button
        type="button"
        onClick={() => setAberta(true)}
        className={cn(
          "w-full space-y-1 rounded-lg border p-2 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          corDoCard(atividade.brand),
        )}
        // Card de marca: fundo, borda e TINTA saem juntos da paleta do
        // Connect. A tinta no elemento-pai e o que faz os filhos herdarem —
        // sem ela, `text-foreground` viraria texto claro sobre o amarelo
        // claro no modo escuro, e o card ficava ilegivel.
        style={
          marca
            ? { backgroundColor: marca.fundo, borderColor: marca.borda, color: marca.texto }
            : undefined
        }
      >
        <div className="flex items-center gap-1.5">
          {/* A BOLINHA É A ETAPA DO FUNIL, como no chip do Build.Connect. Era
              o status até 26/11/2026, e a troca tem um preço dito em voz alta:
              o status saiu do card e agora só aparece ao abrir a ficha. */}
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: CORES_DE_FUNIL[atividade.funnel] ?? "currentColor" }}
            aria-hidden
          />
          {/* UM ÍCONE POR REDE, e o ícone é o da rede de verdade. Antes vinha
              só o da PRIMEIRA, e qualquer rede fora Instagram e YouTube caía
              num símbolo genérico de vídeo — um conteúdo de TikTok mostrava
              uma câmera. No card de marca a tinta da marca manda: o rosa do
              Instagram sobre o amarelo claro não se lê, e é a condição do
              Connect na letra. */}
          {atividade.platforms.map((p) => (
            <IconeDaRede
              key={p}
              plataforma={p}
              style={{ color: marca ? marca.texto : CORES_DE_PLATAFORMA[p] }}
            />
          ))}
          <span className="min-w-0 flex-1 truncate text-[0.6875rem] font-bold uppercase tracking-wide">
            {atividade.title}
          </span>
        </div>

        {/* line-clamp-2: a descrição é texto livre e pode vir com um parágrafo
            inteiro. Numa célula de sete colunas, duas linhas é o teto antes de
            um card empurrar o resto do dia para fora da vista — e é por isso
            que a ficha existe: lá ela aparece completa. */}
        {atividade.notes && (
          <p className={cn(
            "line-clamp-2 text-[0.6875rem] leading-snug",
            // Herda a tinta da marca em 75%, como o Connect faz: o cinza do
            // tema nao tem contraste nenhum sobre o fundo da marca.
            marca ? "opacity-75" : "text-muted-foreground",
          )}>
            {atividade.notes}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1">
          {/* SELO SÓLIDO AQUI, translúcido na ficha — são as duas receitas do
              Connect, e quem escolhe é a superfície (ver `estiloSolido`).

              A COR CHEIA É O QUE RESOLVE O CARD DE MARCA. Enquanto o selo era
              translúcido, ele dependia do que estava atrás: sobre o amarelo da
              OKEY o âmbar do MOFU caía para 1,9:1. Sólido, o fundo do selo é a
              própria cor e o mesmo código serve ao card neutro e ao de marca —
              sem a bifurcação que existia aqui. */}
          {formatos && (
            <span
              className="rounded bg-secondary px-1 py-px text-[0.625rem] font-semibold"
              style={estiloSolido(CORES_DE_FORMATO, atividade.formats[0] ?? "")}
            >
              {formatos}
            </span>
          )}
          <span
            className="rounded bg-secondary px-1 py-px text-[0.625rem] font-semibold"
            style={estiloSolido(CORES_DE_FUNIL, atividade.funnel)}
          >
            {atividade.funnel}
          </span>
          {/* MARCA E RESPONSÁVEL TAMBÉM SÃO SELOS, com contorno e preenchimento
              como no Connect. Eram texto solto, e na fila ao lado de dois selos
              sólidos pareciam sobra de legenda em vez de informação.

              NEUTROS, e não na cor da marca: a cor da marca JÁ É o fundo do
              card inteiro, e repeti-la num selo em cima dela não acrescenta
              nada — só perde contorno. */}
          {atividade.brand && (
            <span className={cn("rounded border px-1 py-px text-[0.625rem] font-semibold uppercase", chipNeutro)}>
              {rotuloDeMarca(atividade.brand)}
            </span>
          )}
          {atividade.responsavel && (
            <span className={cn("rounded border px-1 py-px text-[0.625rem] font-semibold uppercase", chipNeutro)}>
              {atividade.responsavel}
            </span>
          )}
        </div>
      </button>

      {aberta && (
        <Modal onClose={() => setAberta(false)} largura="max-w-2xl">
          {/* O DESENHO É O DA FICHA DO BUILD.CONNECT, bloco a bloco: rótulo
              miúdo acima do título, fila de selos coloridos, e cada informação
              dentro da própria moldura. As duas ferramentas abrem a MESMA
              atividade — com duas fichas diferentes, quem usa as duas tem de
              reaprender onde cada coisa está. */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Detalhes da atividade
              </p>
              <h2 className="mt-1 break-words text-lg font-semibold">{atividade.title}</h2>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  corDoStatus(atividade.status),
                )}
              >
                {rotuloDeStatus(atividade.status)}
              </span>
              <button
                type="button"
                onClick={() => setAberta(false)}
                aria-label="Fechar"
                className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>

          {/* OS SELOS INTEIROS, sem corte: no card o formato vira "REEL +2" e
              a rede é um ícone mudo, porque a célula tem sete colunas. Aqui há
              espaço, e é metade do motivo desta ficha existir. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* A ETAPA NA MESMA RECEITA DO FORMATO E DA REDE, que já estavam
                aqui: era o único selo da fila que ainda vinha da escala do
                Tailwind, e na mesma linha isso aparecia como um selo de outro
                sistema. */}
            <span
              className="rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={estiloDeSelo(CORES_DE_FUNIL, atividade.funnel)}
            >
              {rotuloDeFunil(atividade.funnel)}
            </span>
            {atividade.formats.map((f) => (
              <span
                key={f}
                className="rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={estiloDeSelo(CORES_DE_FORMATO, f)}
              >
                {/* "Outro" mostra o que a pessoa digitou: a palavra "Outro"
                    não diz qual formato é. */}
                {f === "OUTRO" && atividade.formatOther
                  ? atividade.formatOther
                  : rotuloDeFormato(f)}
              </span>
            ))}
            {atividade.platforms.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={estiloDeSelo(CORES_DE_PLATAFORMA, p)}
              >
                <IconeDaRede plataforma={p} />
                {rotuloDePlataforma(p)}
              </span>
            ))}
            {marca && (
              <span
                className="rounded border px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  backgroundColor: marca.fundo,
                  borderColor: marca.borda,
                  color: marca.texto,
                }}
              >
                {rotuloDeMarca(atividade.brand)}
              </span>
            )}
          </div>

          {atividade.lineUp !== null && (
            <div className="mt-3 inline-flex items-baseline gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                Line-up
              </span>
              <span className="text-lg font-bold leading-none tabular-nums text-primary">
                {atividade.lineUp}
              </span>
            </div>
          )}

          {/* NO LUGAR DO BLOCO DE ALCANCE DO CONNECT, que aqui não existe (a
              ferramenta é uma só, sem abas), vai a ORIGEM — a pergunta que
              esta ficha precisa responder: "por que não posso editar isto?" */}
          <div
            className={cn(
              "mt-4 rounded-lg border p-3",
              atividade.origem === "connect"
                ? "border-primary/30 bg-primary/5"
                : "border-border bg-secondary/40",
            )}
          >
            <p className="text-xs font-semibold">
              {atividade.origem === "connect"
                ? "Vinda do Build.Connect"
                : atividade.podeEditar
                  ? "Criada por você"
                  : "Criada por outra pessoa"}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {atividade.origem === "connect"
                ? "O Marketing mantém esta atividade no Build.Connect. Aqui ela é somente leitura."
                : atividade.podeEditar
                  ? "Você pode editar, excluir e escrever o roteiro desta atividade."
                  : "Só quem criou a atividade pode alterá-la."}
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Campo icone={<CalendarDays className="h-3 w-3" />} rotulo="Data">
              {/* Sem data legível a ficha DIZ isso. O valor vem de outro
                  serviço, e "Invalid Date" na tela é pior que admitir. */}
              {quando?.data ?? <span className="text-muted-foreground">Sem data definida</span>}
            </Campo>
            <Campo icone={<Clock className="h-3 w-3" />} rotulo="Horário">
              {quando?.hora ?? <span className="text-muted-foreground">—</span>}
            </Campo>
            <Campo icone={<UserIcon className="h-3 w-3" />} rotulo="Responsável">
              {atividade.responsavel ? (
                <span className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
                    {atividade.responsavel.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="truncate">{atividade.responsavel}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">Sem responsável</span>
              )}
            </Campo>
            <Campo icone={<Tag className="h-3 w-3" />} rotulo="Criado por">
              {atividade.autor ?? (
                <span className="text-muted-foreground">
                  {atividade.origem === "connect" ? "No Build.Connect" : "—"}
                </span>
              )}
            </Campo>
          </div>

          <div className="mt-3 rounded-lg border border-border bg-secondary/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Observações
            </p>
            {/* `whitespace-pre-wrap`: o Marketing escreve em linhas, e juntar
                tudo num parágrafo muda o que foi escrito. */}
            {atividade.notes?.trim() ? (
              <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed">
                {atividade.notes}
              </p>
            ) : (
              <p className="mt-1.5 text-sm text-muted-foreground">
                Nenhuma observação registrada.
              </p>
            )}
          </div>

          {atividade.podeEditar && (
            <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" size="sm" onClick={() => setNoRoteiro(true)}>
                Roteiro
                {atividade.script && (
                  <span
                    className="ml-1.5 h-1.5 w-1.5 rounded-full bg-marketing"
                    aria-label="já tem roteiro"
                  />
                )}
              </Button>
              <Button size="sm" onClick={() => setEditando(true)}>
                Editar
              </Button>
            </div>
          )}
        </Modal>
      )}

      {noRoteiro && <RoteiroModal atividade={atividade} onClose={() => setNoRoteiro(false)} />}

      {editando && (
        <AtividadeModal
          atividade={atividade}
          pessoas={pessoas}
          onClose={() => {
            setEditando(false);
            // A ficha fecha junto: ela mostra os valores de ANTES da edição, e
            // reabrir sobre o formulário recém-salvo mostraria o texto velho
            // até o `router.refresh()` chegar.
            setAberta(false);
          }}
        />
      )}
    </>
  );
}
