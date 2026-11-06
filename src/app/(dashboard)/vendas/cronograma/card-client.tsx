"use client";

import { useState } from "react";
import { Instagram, Video, X, Youtube } from "lucide-react";
import { Modal } from "@/components/shared/modal";
import type { PostDoCronograma } from "@/lib/integration/connect-cronograma";
import {
  corDoCard,
  corDoFunil,
  corDoPonto,
  dataEHoraDaPeca,
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
 */

function IconeDaPlataforma({ plataformas }: { plataformas: string[] }) {
  const Icone =
    plataformas[0] === "YOUTUBE" ? Youtube : plataformas[0] === "INSTAGRAM" ? Instagram : Video;
  return <Icone className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />;
}

export function CardDaPeca({ post }: { post: PostDoCronograma }) {
  const [aberta, setAberta] = useState(false);
  const formatos = seloDeFormatos(post.formats);
  const quando = dataEHoraDaPeca(post.scheduledAt);

  return (
    <>
      {/* `<button>` e não um `<div onClick>`: o teclado abre com Enter e o
          leitor de tela anuncia que isto abre alguma coisa. */}
      <button
        type="button"
        onClick={() => setAberta(true)}
        className={cn(
          "w-full space-y-1 rounded-lg border p-2 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          corDoCard(post.brand),
        )}
      >
        <div className="flex items-center gap-1.5">
          <span
            className={cn("h-1.5 w-1.5 shrink-0 rounded-full", corDoPonto(post.status))}
            aria-hidden
          />
          {post.platforms.length > 0 && <IconeDaPlataforma plataformas={post.platforms} />}
          <span className="min-w-0 flex-1 truncate text-[0.6875rem] font-bold uppercase tracking-wide">
            {post.title}
          </span>
        </div>

        {/* line-clamp-2: a descrição é texto livre e pode vir com um parágrafo
            inteiro. Numa célula de sete colunas, duas linhas é o teto antes de
            um card empurrar o resto do dia para fora da vista — e é por isso
            que a ficha existe: lá ela aparece completa. */}
        {post.notes && (
          <p className="line-clamp-2 text-[0.6875rem] leading-snug text-muted-foreground">
            {post.notes}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1">
          {formatos && (
            <span className="rounded bg-secondary px-1 py-px text-[0.625rem] font-semibold text-foreground">
              {formatos}
            </span>
          )}
          <span
            className={cn(
              "rounded px-1 py-px text-[0.625rem] font-semibold",
              corDoFunil(post.funnel),
            )}
          >
            {post.funnel}
          </span>
          {post.brand && (
            <span className="rounded px-1 py-px text-[0.625rem] font-semibold uppercase text-muted-foreground">
              {rotuloDeMarca(post.brand)}
            </span>
          )}
          {post.responsavel && (
            <span className="rounded px-1 py-px text-[0.625rem] font-semibold uppercase text-muted-foreground">
              {post.responsavel}
            </span>
          )}
        </div>
      </button>

      {aberta && (
        <Modal onClose={() => setAberta(false)} largura="max-w-lg">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-bold">{post.title}</h2>
            <button
              type="button"
              onClick={() => setAberta(false)}
              aria-label="Fechar"
              className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <dl className="mt-4 space-y-4">
            <div>
              <dt className="text-[0.6875rem] font-semibold uppercase tracking-widest text-muted-foreground">
                Data
              </dt>
              {/* Sem data legível a ficha DIZ isso. O valor vem de outro
                  serviço, e "Invalid Date" na tela é pior que admitir. */}
              <dd className="text-sm">{quando?.data ?? "Sem data definida"}</dd>
            </div>
            <div>
              <dt className="text-[0.6875rem] font-semibold uppercase tracking-widest text-muted-foreground">
                Horário
              </dt>
              <dd className="text-sm">{quando ? `${quando.hora}` : "—"}</dd>
            </div>
            <div>
              <dt className="text-[0.6875rem] font-semibold uppercase tracking-widest text-muted-foreground">
                Formatos
              </dt>
              {/* POR EXTENSO e TODOS: no card cabe "REEL +2", e o "+2" não diz
                  quais. É metade do motivo desta ficha existir. */}
              <dd className="text-sm">
                {post.formats.length > 0 ? (
                  post.formats.map(rotuloDeFormato).join(" · ")
                ) : (
                  <span className="text-muted-foreground">Nenhum formato definido.</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[0.6875rem] font-semibold uppercase tracking-widest text-muted-foreground">
                Redes
              </dt>
              {/* No card a rede é um ÍCONE, e só o da primeira. Lista vazia é
                  estado válido no Connect: atividade sem rede definida. */}
              <dd className="text-sm">
                {post.platforms.length > 0 ? (
                  post.platforms.map(rotuloDePlataforma).join(" · ")
                ) : (
                  <span className="text-muted-foreground">Nenhuma rede definida.</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[0.6875rem] font-semibold uppercase tracking-widest text-muted-foreground">
                Observações
              </dt>
              {/* `whitespace-pre-line`: o Marketing escreve em linhas no
                  Connect, e juntar tudo num parágrafo muda o que foi escrito. */}
              <dd className="whitespace-pre-line text-sm leading-relaxed">
                {post.notes?.trim() || (
                  <span className="text-muted-foreground">Sem observações.</span>
                )}
              </dd>
            </div>
          </dl>
        </Modal>
      )}
    </>
  );
}
