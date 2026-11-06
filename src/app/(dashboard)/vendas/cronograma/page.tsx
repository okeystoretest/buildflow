import Link from "next/link";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { buscarCronograma } from "@/lib/integration/connect-cronograma";
import {
  ancoraDaQuery,
  deslocar,
  diasDaVisao,
  filtrarPorMarca,
  doMesDaAncora,
  marcaDaQuery,
  MARCAS,
  indexarPorDia,
  periodoDaQuery,
  recorteDaVisao,
  rotuloDaVisao,
  rotuloDeMarca,
  type Periodo,
} from "@/lib/cronograma";
import { cn } from "@/lib/utils";
import { CardDaPeca } from "./card-client";

/**
 * CRONOGRAMA DE CONTEÚDO — o calendário do Marketing, vindo do Build.Connect.
 *
 * CALENDÁRIO, e não lista (pedido do dono, 06/11/2026): é assim que o Marketing
 * olha a própria agenda no Connect, e duas formas diferentes de ver a MESMA
 * agenda obrigam a traduzir de cabeça toda vez que alguém compara as telas.
 *
 * SOMENTE LEITURA. Quem edita é o Marketing, no Connect; duas telas que editam
 * a mesma agenda discordariam na primeira edição simultânea. Por isso não há
 * aqui o "+" de cada card nem o seletor de usuários que a tela de lá tem.
 *
 * SEM JAVASCRIPT: período e navegação são `<Link>` com `?periodo=` e `?data=`.
 * Trocar de mês é navegação; mandar um componente cliente ao navegador só para
 * reescrever a URL é pagar caro por um link.
 *
 * MOSTRA SÓ O QUE O MARKETING PUBLICOU PARA TODOS (`visibility: SHARED` lá). O
 * filtro mora no Connect, não aqui: regra de visibilidade aplicada no consumidor
 * é regra que o próximo consumidor esquece.
 */
export const dynamic = "force-dynamic";

const COLUNAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

const PERIODOS: { chave: Periodo; rotulo: string }[] = [
  { chave: "mes", rotulo: "Mês" },
  { chave: "semana", rotulo: "Semana" },
  { chave: "dia", rotulo: "Dia" },
];

/** Altura mínima da célula. Numa coluna só cabe — e se espera — mais conteúdo. */
const ALTURA: Record<Periodo, string> = {
  mes: "min-h-[7.5rem]",
  semana: "min-h-[18rem]",
  dia: "min-h-[20rem]",
};

export default async function CronogramaPage(props: {
  searchParams: Promise<{ periodo?: string; data?: string; marca?: string }>;
}) {
  await requireRole(["VENDAS", "GESTAO", "FINANCEIRO"]);
  const searchParams = await props.searchParams;

  const hoje = new Date();
  const periodo = periodoDaQuery(searchParams.periodo);
  const ancora = ancoraDaQuery(searchParams.data, hoje);
  const marca = marcaDaQuery(searchParams.marca);
  const dias = diasDaVisao(periodo, ancora);
  const { de, ate } = recorteDaVisao(periodo, ancora);
  const resposta = await buscarCronograma(de, ate);

  // Filtrado AQUI e nao no Connect: a janela ja esta limitada ao periodo
  // visivel (no maximo 42 dias, teto de 200 linhas), entao um parametro novo
  // na rota seria outra conta para manter dos dois lados sem ganho nenhum.
  const pecas = resposta.ok ? filtrarPorMarca(resposta.posts, marca) : [];
  const porDia = indexarPorDia(pecas);
  const chaveDeHoje = hoje.toISOString().slice(0, 10);
  const colunas = periodo === "dia" ? 1 : 7;
  const href = (p: Periodo, d: string, m: string | null) =>
    `/vendas/cronograma?periodo=${p}&data=${d}${m ? `&marca=${m}` : ""}`;

  return (
    <div className="space-y-4">
      {/* CABEÇALHO: navegação à esquerda, período à direita. Sem o seletor de
          usuários e sem "expandir" — não há o que filtrar por pessoa numa tela
          de leitura, e a página já ocupa a largura toda. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={href(periodo, deslocar(periodo, ancora, -1), marca)}
            aria-label="Período anterior"
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Link>
          <h2 className="min-w-[11rem] text-base font-bold">{rotuloDaVisao(periodo, ancora)}</h2>
          <Link
            href={href(periodo, deslocar(periodo, ancora, 1), marca)}
            aria-label="Próximo período"
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* MARCA e PERÍODO lado a lado, com a mesma moldura: são a mesma
              pergunta feita duas vezes ("o que eu quero ver?"), e dar molduras
              diferentes a controles irmãos obriga a reaprender cada um. */}
          <div className="flex items-center gap-1 rounded-lg border border-border p-1">
            <Link
              href={href(periodo, ancora, null)}
              aria-current={marca === null ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                marca === null
                  ? "bg-servico text-servico-fg"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              Todas
            </Link>
            {MARCAS.map((m) => (
              <Link
                key={m}
                href={href(periodo, ancora, m)}
                aria-current={m === marca ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  m === marca
                    ? "bg-servico text-servico-fg"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {rotuloDeMarca(m)}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-border p-1">
            {PERIODOS.map((p) => (
              <Link
                key={p.chave}
                href={href(p.chave, ancora, marca)}
                aria-current={p.chave === periodo ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  p.chave === periodo
                    ? "bg-servico text-servico-fg"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {p.rotulo}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* O MOTIVO APARECE NA TELA, não só no log: sem ele a pessoa não sabe se
          esperar, se avisar alguém, ou se o problema é ela. */}
      {!resposta.ok ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium">O cronograma não pôde ser carregado.</p>
            <p className="text-sm text-muted-foreground">{resposta.motivo}</p>
            <p className="text-xs text-muted-foreground">
              O calendário é mantido no Build.Connect — esta tela só o exibe.
            </p>
          </div>
        </div>
      ) : (
        <>
          {resposta.truncado && (
            <p className="text-xs text-muted-foreground">
              Mostrando as primeiras peças do período — há mais no Build.Connect.
            </p>
          )}

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {colunas === 7 && (
              <div className="grid grid-cols-7 border-b border-border bg-secondary/50">
                {COLUNAS.map((c) => (
                  <div
                    key={c}
                    className="px-2 py-2 text-center text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground"
                  >
                    {c}
                  </div>
                ))}
              </div>
            )}

            <div className={cn("grid", colunas === 7 ? "grid-cols-7" : "grid-cols-1")}>
              {dias.map((chave) => {
                const doMes = periodo !== "mes" || doMesDaAncora(chave, ancora);
                const posts = porDia.get(chave) ?? [];
                return (
                  <div
                    key={chave}
                    className={cn(
                      "space-y-1.5 border-b border-r border-border p-1.5",
                      ALTURA[periodo],
                      // Dia do mês vizinho fica apagado: está na grade só para a
                      // semana ficar inteira, não é deste mês.
                      !doMes && "bg-secondary/30",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-xs font-semibold",
                        chave === chaveDeHoje
                          ? "bg-servico text-servico-fg"
                          : doMes
                            ? "text-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {Number(chave.slice(8, 10))}
                    </span>
                    {posts.map((p) => (
                      <CardDaPeca key={p.id} post={p} />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {pecas.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-6 text-center">
              <CalendarDays className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
              <p className="mt-2 text-sm text-muted-foreground">
                {marca
                  ? `Nada de ${rotuloDeMarca(marca)} neste período.`
                  : "Nada publicado pelo Marketing neste período."}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
