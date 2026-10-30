import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  Percent,
  ShoppingBag,
  TrendingUp,
  User,
  Users,
  XCircle,
} from "lucide-react";
// `pct` vem do dashboard de chamados: é a mesma conta (contagem sobre total,
// zero quando a base é zero) e o mesmo idioma visual. Reescrevê-la aqui criaria
// duas versões da mesma linha para divergirem no arredondamento.
import { pct } from "@/lib/transport/dashboard-math";
import { cn, shortName } from "@/lib/utils";
import { LEAD_STATUS_META, PURCHASE_META } from "./lead-status-chip";
import type { ContagemPorVendedora, ResumoDoAtacado } from "@/lib/wholesale-dashboard";

/**
 * PAINEL DA ANÁLISE DE CLIENTES — os números que ficam ACIMA da tabela.
 *
 * Era uma rota própria (`analise-clientes/dashboard`) com abas até 28/10/2026.
 * A aba saiu a pedido do dono: o painel e a fila respondem perguntas da mesma
 * conversa ("quanto chegou, quanto converteu, e quem são"), e trocar de tela
 * entre as duas obrigava a reaplicar os filtros na mão. Agora a barra de
 * filtros é UMA e vale para os dois.
 *
 * O custo dessa junção é real e foi aceito: abrir a tela paga o painel E as 18
 * respostas de cada linha da tabela. Em troca, os números nunca discordam da
 * lista embaixo deles, porque leem o mesmo recorte.
 *
 * MESMO DESENHO DO DASHBOARD DE CHAMADOS (`motorista/dashboard`): faixa de KPIs
 * com ícone, número grande e dica; depois painéis de contorno fino com listas
 * "ponto · rótulo · contagem (percentual)". Duas telas de métrica no mesmo
 * sistema que se parecem são duas telas que se aprendem uma vez.
 *
 * SEM BIBLIOTECA DE GRÁFICO. O projeto não tem nenhuma, e as formas aqui são a
 * barra empilhada, a barra de proporção e as listas que aquele painel já usa.
 * Uma dependência de charts entraria no bundle de todo mundo para substituir
 * divs com `width: %`.
 *
 * O ESCOPO é o mesmo da fila (`resumoDoAtacado` o monta a partir do ator): a
 * vendedora vê o painel das candidaturas dela. "28 recebidas, 19 aprovadas"
 * somado sobre a equipe é informação da equipe, não dela.
 */

/** "2026-10-19" -> "19/10/2026", sem passar por `Date`. */
function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

/**
 * O mês em palavras, a partir de "2026-10-01".
 *
 * Só para o recorte PADRÃO (o mês vigente, desde 30/10/2026): "outubro de 2026"
 * diz num relance o que "de 01/10/2026 a 31/10/2026" faz ler duas datas para
 * concluir a mesma coisa. Período escolhido à mão continua mostrando as pontas,
 * que é o que importa quando elas não são um mês fechado.
 */
const MES_NOME = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
function mesBR(iso: string): string {
  const [ano, mes] = iso.split("-");
  return `${MES_NOME[Number(mes) - 1] ?? mes} de ${ano}`;
}

/** Cores dos pontos das listas, cicladas por posição. */
const PALETA = ["bg-sky-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-rose-500"];

/* --------------------------------------------------------------- cartões */

function Kpi({
  icon,
  chip,
  valor,
  corValor,
  label,
  hint,
}: {
  icon: React.ReactNode;
  chip: string;
  valor: string | number;
  corValor?: string;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", chip)}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className={cn("text-2xl font-bold leading-tight", corValor)}>{valor}</p>
        <p className="truncate text-sm font-medium">{label}</p>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

function Painel({
  titulo,
  icon,
  children,
}: {
  titulo: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {titulo}
      </p>
      {children}
    </div>
  );
}

/** Lista "ponto · rótulo · contagem (percentual)" — o corpo dos painéis. */
function Lista({
  fatias,
  total,
}: {
  fatias: { label: string; count: number; cor?: string }[];
  total: number;
}) {
  if (fatias.length === 0) {
    return <p className="text-xs text-muted-foreground">Sem dados.</p>;
  }
  return (
    <ul className="space-y-2">
      {fatias.map((f, i) => (
        <li key={f.label} className="flex items-center gap-2 text-sm">
          <span
            className={cn("h-2 w-2 shrink-0 rounded-full", f.cor ?? PALETA[i % PALETA.length])}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate" title={f.label}>
            {f.label}
          </span>
          <span className="shrink-0 font-semibold">{f.count}</span>
          <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">
            ({pct(f.count, total)}%)
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * CONVERSÃO por vendedora: barra proporcional à TAXA, não ao volume.
 *
 * Mostrava a APROVAÇÃO até 29/10/2026. Mudou a pedido do dono, e a troca é de
 * assunto, não de rótulo: aprovar é a decisão da analista, converter é a venda
 * acontecer. A taxa de aprovação continua na tela, no cartão do topo, mas só no
 * total — por vendedora o painel fala de venda.
 *
 * `Lista` não serve aqui: o percentual dela é fatia-do-total ("quanto desta
 * vendedora no total recebido"), e aqui o percentual é compraram ÷ recebidas
 * DELA. São dois números diferentes com o mesmo símbolo, e trocar um pelo outro
 * é o erro que esta tela não pode cometer.
 *
 * O DENOMINADOR VAI EM CADA LINHA de propósito: 1 de 1 também é 100%, e sem o
 * "1/1" ao lado ela empata na leitura com quem converteu 30 de 40.
 */
function Conversoes({ linhas }: { linhas: ContagemPorVendedora[] }) {
  if (linhas.length === 0) {
    return <p className="text-xs text-muted-foreground">Sem dados.</p>;
  }
  return (
    <ul className="space-y-2.5">
      {linhas.map((v) => (
        <li key={v.sellerId ?? "sem-dona"} className="space-y-1">
          <div className="flex items-baseline gap-2 text-sm">
            {/* Nome curto na barra, inteiro no `title`: a barra identifica a
                vendedora, e o nome completo continua a um apontar de mouse. */}
            <span className="min-w-0 flex-1 truncate" title={v.nome}>
              {shortName(v.nome)}
            </span>
            {/* Mesmo verde do cartão "Taxa de Conversão" e do chip COMPROU:
                a cor amarra o número ao estado que ele conta. */}
            <span className="shrink-0 font-semibold text-emerald-800 dark:text-emerald-200">
              {v.conversao.toLocaleString("pt-BR")}%
            </span>
            <span className="w-14 shrink-0 text-right font-data text-xs text-muted-foreground">
              {v.comprou}/{v.total}
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
            role="img"
            aria-label={`${v.nome}: ${v.conversao}% de conversão, ${v.comprou} compraram de ${v.total} recebidas`}
          >
            <span
              className="block h-full rounded-full bg-emerald-700"
              // Sem mínimo: 0% precisa ficar VAZIO. Um traço de cortesia aqui
              // viraria "quase vendeu" em quem não vendeu nada.
              style={{ width: `${v.conversao}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ painel */

export function AnaliseClientesPainel({
  resumo: r,
  ehGestao,
  filtros,
  nomeVendedora,
}: {
  resumo: ResumoDoAtacado;
  ehGestao: boolean;
  filtros: { de: string; ate: string; temFiltro: boolean; padraoDoMes: boolean };
  /** Nome da vendedora escolhida no filtro, quando há uma. */
  nomeVendedora: string | null;
}) {
  const rotuloPeriodo = filtros.padraoDoMes
    ? mesBR(filtros.de)
    : filtros.de && filtros.ate
      ? `de ${dataBR(filtros.de)} a ${dataBR(filtros.ate)}`
      : filtros.de
        ? `desde ${dataBR(filtros.de)}`
        : filtros.ate
          ? `até ${dataBR(filtros.ate)}`
          : "todo o histórico";

  const porStatus = new Map(r.porStatus.map((s) => [s.status, s.total]));
  const somaJanela = r.entradasPorMes.reduce((s, m) => s + m.total, 0);
  // A janela do gráfico varia com o período, então a média divide pelos meses
  // MOSTRADOS, não por uma constante — dividir por 6 um recorte de 2 meses
  // daria um terço do valor certo.
  const mesesNaJanela = Math.max(1, r.entradasPorMes.length);
  const mediaMensal = Math.round((somaJanela / mesesNaJanela) * 10) / 10;
  const lider = r.porVendedora[0];
  // O motivo que mais reprova NESTE recorte. `porMotivo` já vem ordenado do
  // mais frequente para o menos (ver `agrupaPorMotivo`).
  //
  // O PRIMEIRO COM CÓDIGO, e não a primeira linha: o balde "Sem código" — as
  // reprovadas de antes de o código ser obrigatório — é hoje o maior de todos,
  // e um cartão anunciando que o motivo que mais reprova é "nenhum motivo
  // registrado" não ensina nada a ninguém. Ele continua na LISTA embaixo, onde
  // as parcelas têm de fechar com o total de reprovações; aqui, onde o número é
  // manchete e não distribuição, ele cede o lugar ao primeiro motivo de
  // verdade. Sobra como último recurso: um recorte só com reprovadas antigas
  // mostra "Sem código" em vez de mentir que não houve reprovação.
  const motivoLider = r.porMotivo.find((m) => m.code) ?? r.porMotivo[0];
  // Cópia antes de ordenar: `r.porVendedora` vem por VOLUME, e `lider` acima
  // depende dessa ordem. O painel de conversão lê melhor pela taxa.
  const conversoes = [...r.porVendedora].sort((a, b) => b.conversao - a.conversao);

  if (r.total === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground shadow-sm">
        <Inbox className="h-6 w-6" aria-hidden />
        {/* "Nada ainda" e "nada NESTE recorte" são estados diferentes: sem a
            distinção, um período mal escolhido parece base vazia. */}
        <span className="text-sm">
          {filtros.temFiltro
            ? "Nenhuma candidatura neste recorte. Abra os filtros, na borda direita da tela, e troque o recorte."
            : filtros.padraoDoMes
              ? // A tela abre no mês vigente, então "nada aqui" quase sempre quer
                // dizer "nada NESTE mês" — e o caminho para o histórico tem de
                // estar escrito, ou o padrão esconde a base sem avisar.
                `Nenhuma candidatura em ${mesBR(filtros.de)}. Abra os filtros, na borda direita da tela, e limpe o período para ver todo o histórico.`
              : ehGestao
                ? "Nenhuma candidatura recebida ainda. O painel se preenche assim que a primeira lojista enviar o formulário."
                : "Nenhuma candidatura na sua fila ainda. O painel se preenche quando uma lojista enviar o formulário pelo seu link."}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* O recorte vale para TODOS os números abaixo, então ele é dito em
          palavras aqui: ler "42 recebidas" sem saber de que período é a forma
          mais fácil de levar um número errado para uma reunião. */}
      <p className="text-sm text-muted-foreground">
        {nomeVendedora
          ? `Candidaturas de ${nomeVendedora}`
          : ehGestao
            ? "Todas as vendedoras"
            : "A sua fila"}{" "}
        · {rotuloPeriodo}
      </p>

      {/* Linha 1 — o funil: recebidas, em análise, aprovado, COMPROU,
          reprovado. "Comprou" entra à DIREITA de "Aprovado" (30/10/2026, a
          pedido do dono) porque é a etapa seguinte dele.
          
          CUIDADO não tem cartão, e desde 30/10/2026 não aparece em NENHUM
          lugar do painel — saiu a pedido do dono, e a Compra ocupou o espaço.
          Ele continua na tabela, no filtro e no modal de decisão: o que saiu é
          a MÉTRICA, não o estado. A consequência aceita é que estes cartões não
          somam o total recebido quando existe candidatura em Cuidado (o painel
          não tem mais nenhuma soma que precise fechar, então a diferença não
          contradiz nada na tela).
          
          Escritos um a um, e não por um `map` sobre o enum: a faixa mistura
          DOIS eixos (três status e um estado de compra), e nenhuma lista de
          status descreve essa ordem. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi
          icon={<Inbox className="h-5 w-5" />}
          chip="bg-secondary text-foreground"
          valor={r.total}
          label="Candidaturas recebidas"
          hint={rotuloPeriodo}
        />
        <Kpi
          icon={<Clock className="h-5 w-5" />}
          chip={LEAD_STATUS_META.EM_ANALISE.chip}
          valor={porStatus.get("EM_ANALISE") ?? 0}
          label={LEAD_STATUS_META.EM_ANALISE.label}
          hint={`${pct(porStatus.get("EM_ANALISE") ?? 0, r.total)}% do total`}
        />
        <Kpi
          icon={<CheckCircle2 className="h-5 w-5" />}
          chip={LEAD_STATUS_META.APROVADO.chip}
          valor={porStatus.get("APROVADO") ?? 0}
          corValor="text-emerald-700 dark:text-emerald-300"
          label={LEAD_STATUS_META.APROVADO.label}
          hint={`${pct(porStatus.get("APROVADO") ?? 0, r.total)}% do total`}
        />
        {/* COMPROU é o eixo de COMPRA, não um status, mas desde 30/10/2026 usa
            o MESMO verde de "Aprovado" (ver `PURCHASE_META`). O número grande
            vai um tom acima do cartão vizinho para os dois não empatarem na
            leitura. A conta é a mesma de `r.conversao`: quem comprou sobre o
            total recebido. */}
        <Kpi
          icon={<ShoppingBag className="h-5 w-5" />}
          chip={PURCHASE_META.COMPROU.chip}
          valor={r.comprou}
          corValor="text-emerald-800 dark:text-emerald-200"
          label="Comprou"
          hint={`${pct(r.comprou, r.total)}% do total`}
        />
        <Kpi
          icon={<XCircle className="h-5 w-5" />}
          chip={LEAD_STATUS_META.REPROVADO.chip}
          valor={porStatus.get("REPROVADO") ?? 0}
          corValor="text-destructive"
          label={LEAD_STATUS_META.REPROVADO.label}
          hint={`${pct(porStatus.get("REPROVADO") ?? 0, r.total)}% do total`}
        />
      </div>

      {/* Linha 2 — destaques. As DUAS taxas vêm juntas e na ordem em que se
          lê o funil: converter é mais difícil que aprovar, e lado a lado a
          distância entre os dois números é a informação. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi
          icon={<ShoppingBag className="h-5 w-5" />}
          chip="bg-emerald-800/15 text-emerald-800 dark:text-emerald-200"
          valor={`${r.conversao.toLocaleString("pt-BR")}%`}
          corValor="text-emerald-800 dark:text-emerald-200"
          label="Taxa de Conversão"
          // O denominador vai na dica porque a conta MUDOU em 28/10/2026: era
          // aprovadas ÷ recebidas, e quem lembra da versão antiga precisa ver
          // de onde o número novo sai.
          hint={`${r.comprou} compraram ÷ ${r.total} recebidas`}
        />
        <Kpi
          icon={<Percent className="h-5 w-5" />}
          chip="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          valor={`${r.aprovacao.toLocaleString("pt-BR")}%`}
          corValor="text-emerald-700 dark:text-emerald-300"
          label="Taxa de Aprovação"
          // "aprovadas" inclui quem já comprou: o status é um só, e sem isso
          // fechar uma venda derrubaria este número. Ver `APROVADAS`.
          hint={`${r.aprovadas} aprovadas ÷ ${r.total} recebidas`}
        />
        {/* Era "Entradas no mês" até 30/10/2026. Trocado a pedido do dono
            quando o recorte padrão passou a SER o mês vigente: o cartão
            repetia o número de "Candidaturas recebidas" ao lado dele.
            
            O número grande é a CONTAGEM, como em todo cartão desta faixa, e o
            motivo vai na dica — ela tem `truncate`, e um rótulo de motivo no
            lugar do número quebraria a altura do cartão em duas linhas. A lista
            completa está no painel "Reprovações por motivo", embaixo. */}
        <Kpi
          icon={<AlertTriangle className="h-5 w-5" />}
          chip="bg-destructive/15 text-destructive"
          valor={motivoLider?.total ?? 0}
          corValor="text-destructive"
          label="Motivo que mais reprova"
          hint={motivoLider?.rotulo ?? "nenhuma reprovação no recorte"}
        />
        <Kpi
          icon={<TrendingUp className="h-5 w-5" />}
          chip="bg-secondary text-foreground"
          valor={mediaMensal.toLocaleString("pt-BR")}
          label="Média mensal"
          hint={`${somaJanela} em ${mesesNaJanela} ${mesesNaJanela === 1 ? "mês" : "meses"}`}
        />
        {ehGestao ? (
          <Kpi
            icon={<User className="h-5 w-5" />}
            chip="bg-secondary text-foreground"
            valor={lider ? shortName(lider.nome) : "—"}
            label="Quem mais recebeu"
            hint={lider ? `${lider.total} candidatura(s)` : "sem distribuição"}
          />
        ) : (
          <Kpi
            icon={<Clock className="h-5 w-5" />}
            chip="bg-secondary text-foreground"
            valor={r.recentes[0]?.createdAtLabel ?? "—"}
            label="Última candidatura"
            hint={r.recentes[0]?.contactName ?? "—"}
          />
        )}
      </div>

      {/* Linha 3 — distribuições. O painel "Status das análises" (barra
          empilhada + lista dos quatro status) saiu em 30/10/2026: era o único
          lugar do painel onde o CUIDADO ainda aparecia, e tirar só a linha dele
          deixaria uma barra cujas parcelas não fecham mais com o total — o
          defeito exato que o comentário daquele painel existia para impedir.
          Os três números que ele mostrava estão nos cartões da primeira linha,
          cada um com o seu "% do total". */}
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <Painel titulo="Taxa de conversão por vendedora" icon={<Percent className="h-3.5 w-3.5" />}>
          <Conversoes linhas={conversoes} />
        </Painel>

        {/* Distribuição por vendedora só existe para a Gestão: para a
            vendedora, o escopo já reduz o painel a uma barra dela. */}
        {ehGestao && (
          <Painel titulo="Por vendedora" icon={<Users className="h-3.5 w-3.5" />}>
            <Lista
              fatias={r.porVendedora.map((v) => ({
                label: shortName(v.nome),
                count: v.total,
                // Sem dona = chegou pelo link geral sem vendedora ativa.
                // Âmbar porque é aviso de operação, não mais uma fatia.
                cor: v.sellerId ? undefined : "bg-amber-400",
              }))}
              total={r.total}
            />
          </Painel>
        )}

        {/* REPROVAÇÕES POR MOTIVO. O que o painel tem a dizer é POR QUE as
            candidaturas caem — é isso que muda o que a Gestão faz. */}
        <Painel titulo="Reprovações por motivo" icon={<Inbox className="h-3.5 w-3.5" />}>
          <Lista
            // Oito linhas: a taxonomia tem 34 motivos e a cauda é longa,
            // mas quem lê um painel age sobre os primeiros.
            fatias={r.porMotivo.slice(0, 8).map((m) => ({ label: m.rotulo, count: m.total }))}
            // Percentual sobre o total de REPROVAÇÕES, não sobre o total
            // recebido: "22% das reprovações foram por isto" é a leitura
            // útil, e sobre o total daria um número menor e sem sentido.
            total={r.porMotivo.reduce((n, m) => n + m.total, 0)}
          />
        </Painel>
      </div>
    </div>
  );
}
