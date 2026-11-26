import Link from "next/link";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { buscarAtividades, pessoasDoCronograma } from "@/lib/cronograma-data";
import {
  ancoraDaQuery,
  filtrarPorFunil,
  filtrarPorResponsavel,
  funisDaQuery,
  responsaveisDaQuery,
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
import { CardDaAtividade } from "./card-client";
import { NovaAtividade, NovaAtividadeNoDia } from "./nova-atividade";
import { Funil } from "./funil";
import { FiltroResponsavel } from "./filtro-responsavel";
import { LegendaDoFunil } from "./legenda";

/**
 * CRONOGRAMA DE CONTEÚDO — o calendário do Marketing, vindo do Build.Connect.
 *
 * CALENDÁRIO, e não lista (pedido do dono, 06/11/2026): é assim que o Marketing
 * olha a própria agenda no Connect, e duas formas diferentes de ver a MESMA
 * agenda obrigam a traduzir de cabeça toda vez que alguém compara as telas.
 *
 * DUAS ORIGENS NO MESMO CALENDÁRIO (decisão do dono, 25/11/2026): as atividades que
 * o Marketing publica no Connect, que aqui são SÓ LEITURA, e as criadas aqui,
 * que o autor edita. A sincronização é de mão única — o que nasce aqui não vai
 * para lá — então não há edição simultânea da mesma atividade para discordar.
 *
 * SEM JAVASCRIPT: período e navegação são `<Link>` com `?periodo=` e `?data=`.
 * Trocar de mês é navegação; mandar um componente cliente ao navegador só para
 * reescrever a URL é pagar caro por um link.
 *
 * DO CONNECT, MOSTRA SÓ O QUE O MARKETING PUBLICOU PARA TODOS
 * (`visibility: SHARED` lá). O filtro mora no Connect, não aqui: regra de
 * visibilidade aplicada no consumidor é regra que o próximo consumidor esquece.
 * As atividades daqui não têm alcance: quem abre o Cronograma vê todas.
 */
export const dynamic = "force-dynamic";

const COLUNAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

/**
 * As duas formas de olhar o mesmo recorte. Qualquer outra coisa vira o
 * calendario — e isso inclui `?vista=backlog`, que existiu ate 26/11/2026 e
 * agora cai no calendario em vez de dar tela vazia a quem guardou o link.
 */
type Vista = "calendario" | "funil";
const VISTAS: { chave: Vista; rotulo: string }[] = [
  { chave: "calendario", rotulo: "Calendário" },
  { chave: "funil", rotulo: "Funil" },
];
const vistaDaQuery = (v: string | undefined): Vista =>
  VISTAS.some((x) => x.chave === v) ? (v as Vista) : "calendario";

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
  searchParams: Promise<{
    periodo?: string;
    data?: string;
    marca?: string;
    vista?: string;
    responsavel?: string;
    funil?: string;
  }>;
}) {
  const sessao = await requireRole(["GESTAO", "VENDAS"]);
  const searchParams = await props.searchParams;

  const hoje = new Date();
  const periodo = periodoDaQuery(searchParams.periodo);
  const ancora = ancoraDaQuery(searchParams.data, hoje);
  const marca = marcaDaQuery(searchParams.marca);
  const vista = vistaDaQuery(searchParams.vista);
  const responsaveis = responsaveisDaQuery(searchParams.responsavel);
  const funis = funisDaQuery(searchParams.funil);
  const dias = diasDaVisao(periodo, ancora);
  const { de, ate } = recorteDaVisao(periodo, ancora);
  const [leitura, pessoas] = await Promise.all([
    buscarAtividades(de, ate, sessao.userId),
    pessoasDoCronograma(),
  ]);

  // Filtrado AQUI e nao no Connect: a janela ja esta limitada ao periodo
  // visivel (no maximo 42 dias, teto de 200 linhas), entao um parametro novo
  // na rota seria outra conta para manter dos dois lados sem ganho nenhum. O
  // mesmo filtro vale para as atividades daqui: uma marca é uma marca.
  const atividades = filtrarPorFunil(
    filtrarPorResponsavel(filtrarPorMarca(leitura.atividades, marca), responsaveis),
    funis,
  );

  // Os nomes vem das atividades do periodo, ANTES do filtro de pessoa — senao, com
  // "Ana" marcada, a lista do modal passaria a ter so "Ana" e nao daria para
  // trocar de pessoa sem limpar antes. Os ja escolhidos entram mesmo sem atividade
  // no periodo, para a marcacao continuar visivel ao virar o mes.
  const nomesDePessoas = [
    ...new Set([
      ...leitura.atividades.map((p) => p.responsavel).filter((n): n is string => n !== null),
      ...responsaveis,
    ]),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const porDia = indexarPorDia(atividades);
  const chaveDeHoje = hoje.toISOString().slice(0, 10);
  const colunas = periodo === "dia" ? 1 : 7;
  // UM SO MONTADOR DE LINK, e ele carrega TODOS os recortes: com um por
  // controle, trocar de mes apagaria o filtro de marca, e trocar de vista
  // apagaria o de pessoa. Foi assim que o filtro de marca sumia ao navegar.
  const href = (troca: {
    p?: Periodo;
    d?: string;
    m?: string | null;
    v?: Vista;
    f?: string[];
  }) => {
    const q = new URLSearchParams();
    q.set("periodo", troca.p ?? periodo);
    q.set("data", troca.d ?? ancora);
    q.set("vista", troca.v ?? vista);
    const marcaFinal = troca.m === undefined ? marca : troca.m;
    if (marcaFinal) q.set("marca", marcaFinal);
    if (responsaveis.length > 0) q.set("responsavel", responsaveis.join(","));
    const funisFinal = troca.f ?? funis;
    if (funisFinal.length > 0) q.set("funil", funisFinal.join(","));
    return `/marketing/cronograma?${q.toString()}`;
  };

  // O VAZIO PRECISA DIZER QUAL RECORTE O ESVAZIOU: "nenhuma atividade neste
  // periodo", com um filtro de etapa ligado, manda a pessoa procurar no mes
  // errado. Montado como LISTA e nao como ternarios encadeados porque agora
  // sao tres filtros, e o terceiro ja nao cabia na linha.
  const recortes = [
    responsaveis.length > 0 ? responsaveis.join(", ") : null,
    marca ? rotuloDeMarca(marca) : null,
    funis.length > 0 ? funis.join(", ") : null,
  ].filter((r): r is string => r !== null);

  return (
    <div className="space-y-4">
      {/* CABEÇALHO: navegação à esquerda, período à direita. Sem o seletor de
          usuários e sem "expandir" — não há o que filtrar por pessoa numa tela
          de leitura, e a página já ocupa a largura toda. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={href({ d: deslocar(periodo, ancora, -1) })}
            aria-label="Período anterior"
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Link>
          <h2 className="min-w-[11rem] text-base font-bold">{rotuloDaVisao(periodo, ancora)}</h2>
          <Link
            href={href({ d: deslocar(periodo, ancora, 1) })}
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
              href={href({ m: null })}
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
                href={href({ m })}
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
                href={href({ p: p.chave })}
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

          {/* QUEM FILTRA POR PESSOA E SO A GESTAO, como no Build.Connect. A
              vendedora ve a agenda inteira do time — e e o ponto da
              ferramenta —, mas recortar por gente e leitura gerencial. */}
          {sessao.role === "GESTAO" && (
            <FiltroResponsavel nomes={nomesDePessoas} selecionados={responsaveis} />
          )}

          <NovaAtividade pessoas={pessoas} />
        </div>
      </div>

      {/* O MOTIVO APARECE NA TELA, não só no log: sem ele a pessoa não sabe se
          esperar, se avisar alguém, ou se o problema é ela. */}
      {/* AS DUAS VISTAS. Links e nao botoes: trocar de vista e navegacao, e a
          pagina inteira continua sendo servida pronta. */}
      <div className="flex w-fit items-center gap-1 rounded-lg border border-border p-1">
        {VISTAS.map((v) => (
          <Link
            key={v.chave}
            href={href({ v: v.chave })}
            aria-current={v.chave === vista ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              v.chave === vista
                ? "bg-marketing text-marketing-fg"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {v.rotulo}
          </Link>
        ))}
      </div>

      {/* A BARRA DO FUNIL FICA ACIMA DA GRADE, e nao embaixo como no Connect:
          ela carrega um FILTRO, e todos os outros controles desta tela (marca,
          periodo, pessoa, vista) estao aqui em cima. Um filtro sozinho embaixo
          de um calendario de seis semanas e um controle que so se acha depois
          de rolar a tela inteira. */}
      <LegendaDoFunil selecionados={funis} href={(f) => href({ f })} />

      {/* TARJA, E NÃO A TELA INTEIRA: as atividades criadas aqui vivem no nosso
          banco e continuam valendo com o Connect fora do ar. Trocar o
          calendário por um erro esconderia o trabalho da própria pessoa por
          causa de OUTRO serviço. */}
      {leitura.avisoConnect && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium">As atividades do Build.Connect não entraram.</p>
            <p className="text-sm text-muted-foreground">{leitura.avisoConnect}</p>
            <p className="text-xs text-muted-foreground">
              O calendário abaixo mostra o que foi criado aqui.
            </p>
          </div>
        </div>
      )}

      {(
        <>
          {leitura.truncado && (
            <p className="text-xs text-muted-foreground">
              Mostrando as primeiras atividades do período — há mais no Build.Connect.
            </p>
          )}

          {vista === "funil" && <Funil atividades={atividades} dias={dias} />}

          {vista === "calendario" && (
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
                const atividades = porDia.get(chave) ?? [];
                return (
                  <div
                    key={chave}
                    className={cn(
                      // COLUNA, e nao `space-y`: o botao de criar e o ultimo
                      // filho e precisa esticar ate o fim da celula (`flex-1`)
                      // para o espaco livre inteiro ser clicavel.
                      "flex flex-col gap-1.5 border-b border-r border-border p-1.5",
                      ALTURA[periodo],
                      // Dia do mês vizinho fica apagado: está na grade só para a
                      // semana ficar inteira, não é deste mês.
                      !doMes && "bg-secondary/30",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-5 min-w-5 shrink-0 self-start items-center justify-center rounded px-1 text-xs font-semibold",
                        chave === chaveDeHoje
                          ? "bg-servico text-servico-fg"
                          : doMes
                            ? "text-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      {Number(chave.slice(8, 10))}
                    </span>
                    {atividades.map((p) => (
                      <CardDaAtividade key={p.id} atividade={p} pessoas={pessoas} />
                    ))}
                    <NovaAtividadeNoDia data={chave} pessoas={pessoas} />
                  </div>
                );
              })}
            </div>
          </div>
          )}

          {/* O VAZIO SO APARECE NO CALENDARIO: o funil ja diz "0" em cada
              etapa, e uma segunda frase embaixo repetiria o que o grafico
              acabou de mostrar. */}
          {atividades.length === 0 && vista !== "funil" && (
            <div className="rounded-xl border border-border bg-card p-6 text-center">
              <CalendarDays className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
              <p className="mt-2 text-sm text-muted-foreground">
                {recortes.length > 0
                  ? `Nada de ${recortes.join(" · ")} neste período.`
                  : "Nenhuma atividade neste período."}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
