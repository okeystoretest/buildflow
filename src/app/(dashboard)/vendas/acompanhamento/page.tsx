import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { computeAcompanhamento } from "@/lib/acompanhamento-data";
import { janelaDoMes, instanteNoFuso, FUSO_NEGOCIO } from "@/lib/rank-window";
import type { Prisma, SalesModel } from "@prisma/client";
import { AcompanhamentoFiltros } from "./filtros-client";
import { AcompanhamentoPainel } from "./painel";
import { FollowUpsClient } from "./followups-client";
import {
  resumirFollowUps,
  type ColaboradorOpt,
  type FollowUpRow,
} from "@/lib/followup-kanban";
import { filtroDeSituacao, type FollowUpKindValue } from "@/lib/validations/followup";

export const dynamic = "force-dynamic";

/**
 * COMERCIAL > Acompanhamento (rotulo do menu; a planilha de origem chama
 * "Acompanhamento Gerencial")
 * ---------------------------------------------------------------------------
 * As tres abas da planilha `Acompanhamento Gerencial - FLOW.xlsx`, que o dono
 * mantinha a mao: o painel de meta da loja e das vendedoras, o One-on-One e o
 * Acompanhamento Quinzenal.
 *
 * SO GESTAO (decisao do dono, 13/11/2026): os formularios registram pontos de
 * desenvolvimento e falas do colaborador.
 *
 * A ABA VIVE NA URL (?aba=), e nao em estado de cliente, porque cada uma lê
 * dados diferentes: com `useState` o servidor teria de carregar a grade do ano
 * e os dois formularios a cada visita, para mostrar um terco disso.
 */

const ABAS = [
  { id: "painel", label: "Painel" },
  { id: "one-on-one", label: "One-on-One" },
  { id: "quinzenal", label: "Quinzenal" },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

/** Registros por página na lista de conversas (mínimo pedido pelo dono). */
const POR_PAGINA = 5;

/** "YYYY-MM-DD" de um instante NO FUSO DO NEGOCIO (en-CA ja usa esse formato). */
const diaDoNegocio = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_NEGOCIO }).format(d);

export default async function AcompanhamentoPage(props: {
  searchParams?: Promise<{
    aba?: string;
    ano?: string;
    mes?: string;
    loja?: string;
    vendedora?: string;
    escopo?: string;
    colab?: string;
    situacao?: string;
    page?: string;
  }>;
}) {
  const sp = await props.searchParams;
  const session = await requireRole(["GESTAO"]);

  const agora = new Date();
  const anoAtual = Number(diaDoNegocio(agora).slice(0, 4));
  const anoParam = Number(sp?.ano);
  const ano = anoParam > 2000 && anoParam < 3000 ? anoParam : anoAtual;

  const aba: AbaId = ABAS.some((a) => a.id === sp?.aba) ? (sp!.aba as AbaId) : "painel";

  // MES EM FOCO (0 = ano inteiro). Sem parametro, o mes VIGENTE no fuso do
  // negocio, a pedido do dono: a pergunta de todo dia e "como estamos este
  // mes", e responder exigia achar uma coluna no meio de uma tabela de doze.
  //
  // O mes NAO filtra a grade — ela continua com os doze meses. Ele troca o
  // recorte dos quatro numeros do topo e acende a coluna correspondente.
  //
  // "ano" e um VALOR e nao a ausencia do parametro: a querystring descarta
  // valor vazio, e ausencia ja significa "mes vigente". Sem valor proprio,
  // "Ano inteiro" nao teria como ser escolhido.
  const mesParam = Number(sp?.mes);
  const mesFoco =
    sp?.mes === "ano"
      ? 0
      : mesParam >= 1 && mesParam <= 12
        ? mesParam
        : Number(diaDoNegocio(agora).slice(5, 7));
  /** O que volta para a URL, para aba e filtros preservarem o periodo escolhido. */
  const mesUrl = mesFoco === 0 ? "ano" : String(mesFoco);

  const loja = sp?.loja?.trim() || "";
  const vendedora = sp?.vendedora?.trim() || "";
  const escopo = (sp?.escopo === "VAREJO" || sp?.escopo === "ATACADO" ? sp.escopo : "") as
    | SalesModel
    | "";
  const colab = sp?.colab?.trim() || "";
  // "" = todas; "abertos"; "concluidos" (o historico). Valor cru, como `colab`:
  // quem interpreta e `FormularioAba`, e a querystring so o carrega entre abas.
  const situacao = sp?.situacao?.trim() || "";
  // Pagina 1 para qualquer coisa que nao seja um inteiro >= 1 (?page=0, =-3,
  // =abc): a alternativa e `skip` negativo, que o Prisma recusa em runtime.
  const paginaParam = Number(sp?.page);
  const pagina = Number.isInteger(paginaParam) && paginaParam >= 1 ? paginaParam : 1;

  const querystring = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({
      aba,
      ano: String(ano),
      mes: mesUrl,
      loja,
      vendedora,
      escopo,
      colab,
      situacao,
      ...patch,
    })) {
      if (v) p.set(k, v);
    }
    return p.toString();
  };

  // Colaboradores dos formularios: qualquer usuario ATIVO. A Gestao tambem
  // acompanha quem nao e vendedora, e um formulario que so lista VENDAS
  // obrigaria a cadastrar a conversa "no nome de alguem".
  const colaboradores: ColaboradorOpt[] =
    aba === "painel"
      ? []
      : (
          await prisma.user.findMany({
            where: { active: true },
            select: { id: true, name: true, role: true, salesModel: true },
            orderBy: [{ role: "asc" }, { name: "asc" }],
          })
        ).map((u) => ({
          id: u.id,
          name: u.name,
          detalhe:
            u.role === "VENDAS"
              ? `Vendas · ${u.salesModel === "ATACADO" ? "Atacado" : "Varejo"}`
              : u.role.charAt(0) + u.role.slice(1).toLowerCase(),
        }));

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        A meta da loja e das vendedoras mês a mês, e o registro das conversas de acompanhamento.
      </p>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {ABAS.map((a) => (
          <Link
            key={a.id}
            href={`/vendas/acompanhamento?${querystring({ aba: a.id })}`}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              aba === a.id
                ? "border-b-2 border-vendas text-vendas-text"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {a.label}
          </Link>
        ))}
      </div>

      {aba === "painel" ? (
        <PainelAba
          ano={ano}
          anoAtual={anoAtual}
          mesFoco={mesFoco}
          loja={loja}
          vendedora={vendedora}
          escopo={escopo}
          // Ano passado: os doze meses já aconteceram. Ano corrente: só até o
          // mês de hoje NO FUSO DO NEGÓCIO (não o do servidor).
          mesLimite={ano < anoAtual ? 12 : ano > anoAtual ? 0 : Number(diaDoNegocio(agora).slice(5, 7))}
        />
      ) : (
        <FormularioAba
          kind={aba === "one-on-one" ? "ONE_ON_ONE" : "QUINZENAL"}
          ano={ano}
          colab={colab}
          colaboradores={colaboradores}
          hoje={diaDoNegocio(agora)}
          gestorNome={session.name}
          gestorId={session.userId}
          situacao={situacao}
          paginaPedida={pagina}
        />
      )}
    </div>
  );
}

async function PainelAba({
  ano,
  anoAtual,
  mesFoco,
  loja,
  vendedora,
  escopo,
  mesLimite,
}: {
  ano: number;
  anoAtual: number;
  /** 0 = ano inteiro; 1-12 = mes em foco nos numeros do topo. */
  mesFoco: number;
  loja: string;
  vendedora: string;
  escopo: SalesModel | "";
  mesLimite: number;
}) {
  const dados = await computeAcompanhamento({ year: ano, lojaId: loja, escopo });
  const nomeDaLoja = loja
    ? (dados.lojas.find((l) => l.id === loja)?.name ?? "Loja")
    : "Todas as lojas";

  return (
    <>
      <AcompanhamentoFiltros
        ano={String(ano)}
        mes={mesFoco === 0 ? "ano" : String(mesFoco)}
        anoAtual={anoAtual}
        loja={loja}
        vendedora={vendedora}
        escopo={escopo}
        lojas={dados.lojas}
        vendedoras={dados.vendedoras}
      />

      {dados.semLojaPrincipal.length > 0 && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <strong>{dados.semLojaPrincipal.length}</strong> vendedora(s) ativa(s) sem{" "}
          <strong>loja principal</strong> definida ficam fora de toda apuração por loja:{" "}
          {dados.semLojaPrincipal.map((v) => v.name).join(", ")}. Defina em{" "}
          <a className="underline" href="/gestao">Gestão &gt; Usuários</a>.
        </p>
      )}

      <AcompanhamentoPainel
        dados={dados}
        mesFoco={mesFoco}
        vendedoraId={vendedora}
        nomeDaLoja={nomeDaLoja}
        mesLimite={mesLimite}
      />
    </>
  );
}

async function FormularioAba({
  kind,
  ano,
  colab,
  colaboradores,
  hoje,
  gestorNome,
  gestorId,
  situacao,
  paginaPedida,
}: {
  kind: FollowUpKindValue;
  ano: number;
  colab: string;
  colaboradores: ColaboradorOpt[];
  hoje: string;
  gestorNome: string;
  gestorId: string;
  /** "" = todas, "abertos", "concluidos". */
  situacao: string;
  /** A página PEDIDA na URL. A exibida é esta travada na última que existe. */
  paginaPedida: number;
}) {
  // Janela do ANO no fuso do negócio, pelas bordas do primeiro e do último mês.
  const inicio = janelaDoMes(ano, 1).inicio;
  const fim = janelaDoMes(ano, 12).fim;

  const where: Prisma.FollowUpWhereInput = {
    kind,
    heldOn: { gte: inicio, lt: fim },
    ...(colab ? { collaboratorId: colab } : {}),
    // CONCLUÍDO = status ENTREGUE. A regra (e o `OR` que sustenta os registros
    // de status nulo) mora em validations/followup.ts, onde a checagem a vê.
    ...filtroDeSituacao(situacao),
  };

  // O `count` é o que a paginação precisa para saber quantas páginas existem —
  // e substitui o antigo `take: 200`, que era um teto cego: num ano cheio o
  // registro 201 simplesmente não existia para a tela.
  // O `count` vem ANTES e sozinho de proposito: ele e quem diz qual e a ultima
  // pagina, e sem trava a tela mente. Bastava o gestor estar na pagina 2 e
  // apagar registros ate sobrarem 5 — `skip` pulava a lista inteira e a tela
  // exibia "Mostrando 6-5 de 5" com a tabela vazia, em vez do fim da lista.
  // Encontrado na tela em 17/11/2026.
  const total = await prisma.followUp.count({ where });
  const pagina = Math.min(paginaPedida, Math.max(1, Math.ceil(total / POR_PAGINA)));

  const registros = await prisma.followUp.findMany({
    where,
    include: {
      collaborator: { select: { name: true } },
      manager: { select: { name: true } },
      // A trilha inteira do registro: ela é o histórico de movimentação da
      // ficha E a medição de tempo do cartão. `asc` porque é uma linha do
      // tempo, lida de cima para baixo.
      movements: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { heldOn: "desc" },
    skip: (pagina - 1) * POR_PAGINA,
    take: POR_PAGINA,
  });

  // OS NÚMEROS DO QUADRO VARREM O FILTRO INTEIRO, não a página.
  //
  // O dono manteve a paginação de cinco no quadro (27/11/2026). Se os KPIs e o
  // contador do topo da coluna contassem `registros`, a tela diria "Total de
  // registros: 5" num ano com trinta, e "0" numa coluna cheia de cartões que
  // estão na página seguinte.
  //
  // UMA consulta só, e não um `groupBy` à parte: os KPIs e a contagem por
  // coluna saem do mesmo `resumirFollowUps`, então não há como os dois números
  // discordarem.
  const doFiltro = await prisma.followUp.findMany({
    where,
    select: { status: true, reviewOn: true },
  });
  const resumo = resumirFollowUps(
    doFiltro.map((r) => ({
      status: r.status,
      reviewOn: r.reviewOn ? diaDoNegocio(r.reviewOn) : null,
    })),
    hoje,
  );

  // Tarefas do gestor JA EM ANDAMENTO hoje. Existem para o cronometro
  // sobreviver ao recarregamento: o tempo e recalculado de `startTime`, que
  // esta no banco, e nao de estado de cliente, que morre no F5.
  //
  // Recorte do dia no FUSO DO NEGOCIO, nao do servidor: `DailyTask` e
  // declaradamente a tarefa do dia corrente, e as 22h de Brasilia ja sao o dia
  // seguinte em UTC.
  const [ay, am, ad] = hoje.split("-").map(Number);
  const tarefasAtivas = await prisma.dailyTask.findMany({
    where: {
      userId: gestorId,
      status: "FAZENDO",
      createdAt: { gte: instanteNoFuso(ay, am, ad) },
    },
    select: { id: true, title: true, startTime: true },
  });

  const rows: FollowUpRow[] = registros.map((r) => ({
    id: r.id,
    kind: r.kind,
    collaboratorId: r.collaboratorId,
    collaboratorName: r.collaborator.name,
    managerName: r.manager.name,
    heldOn: diaDoNegocio(r.heldOn),
    strengths: r.strengths,
    improvement: r.improvement,
    collaboratorView: r.collaboratorView,
    actionPlan: r.actionPlan,
    notes: r.notes,
    performance: r.performance,
    status: r.status,
    topic: r.topic,
    support: r.support,
    reviewOn: r.reviewOn ? diaDoNegocio(r.reviewOn) : null,
    // ISO, e não `diaDoNegocio`: o cronômetro mede instantes, não dias. É
    // deste campo que a contagem é recalculada depois de um F5 — por isso ela
    // não morre no recarregamento.
    timerStartedAt: r.timerStartedAt?.toISOString() ?? null,
    movements: r.movements.map((m) => ({
      id: m.id,
      fromStatus: m.fromStatus,
      toStatus: m.toStatus,
      changedByName: m.changedByName,
      elapsedMs: m.elapsedMs,
      createdAt: m.createdAt.toISOString(),
    })),
  }));

  return (
    <FollowUpsClient
      kind={kind}
      rows={rows}
      colaboradores={colaboradores}
      hoje={hoje}
      gestorNome={gestorNome}
      colabFiltro={colab}
      anoFiltro={String(ano)}
      situacaoFiltro={situacao}
      pagina={pagina}
      porPagina={POR_PAGINA}
      total={total}
      resumo={resumo}
      tarefasAtivas={tarefasAtivas}
    />
  );
}
