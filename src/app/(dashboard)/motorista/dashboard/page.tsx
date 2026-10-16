import type { TransportStatus } from "@prisma/client";
import {
  Inbox,
  Clock,
  Users,
  Truck,
  CheckCircle2,
  Percent,
  Route,
  User,
  Tag,
  Building2,
  LayoutGrid,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getTransportDashboard, getTransportDrivers } from "@/lib/transport/dashboard";
import { pct, type Fatia } from "@/lib/transport/dashboard-math";
import { TRANSPORT_COLUMNS, TRANSPORT_STATUS_STYLE } from "@/lib/transport/status";
import { cn } from "@/lib/utils";
import { DriverFilter } from "./driver-filter";

export const dynamic = "force-dynamic";

/** Cor do número grande por status. As faixas/pontos vêm do TRANSPORT_STATUS_STYLE. */
const NUMERO: Record<TransportStatus, string> = {
  ABERTO: "text-amber-600 dark:text-amber-400",
  ATRIBUIDO: "text-sky-700 dark:text-sky-300",
  EM_ROTA: "text-motorista",
  CONCLUIDO: "text-emerald-700 dark:text-emerald-300",
  CANCELADO: "text-destructive",
};

/** Cores dos pontos das listas, cicladas por posição (como na referência). */
const PALETA = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
];

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
function Lista({ fatias, total }: { fatias: Fatia[]; total: number }) {
  if (fatias.length === 0) {
    return <p className="text-xs text-muted-foreground">Sem dados.</p>;
  }
  return (
    <ul className="space-y-2">
      {fatias.map((f, i) => (
        <li key={f.label} className="flex items-center gap-2 text-sm">
          <span
            className={cn("h-2 w-2 shrink-0 rounded-full", PALETA[i % PALETA.length])}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate">{f.label}</span>
          <span className="shrink-0 font-semibold">{f.count}</span>
          <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">
            ({pct(f.count, total)}%)
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ página */

// Ferramenta "Dashboard" do modulo Motorista — os numeros dos chamados de
// transporte (o que antes morava no Connect). O recorte por motorista vem da
// URL (?motorista=<id>) e atravessa TUDO: os KPIs, o tempo medio, a
// quilometragem e as tres distribuicoes.
export default async function MotoristaDashboardPage(
  props: {
    searchParams?: Promise<{ motorista?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  await requireRole(["LOGISTICA", "GESTAO"]);

  const drivers = await getTransportDrivers();
  // Id desconhecido na URL vira "todos": um parametro forcado a mao nao deve
  // produzir um painel zerado sem explicacao.
  const motoristaId = drivers.some((d) => d.id === searchParams?.motorista)
    ? searchParams!.motorista!
    : "";
  const d = await getTransportDashboard(motoristaId || undefined);
  const selecionado = drivers.find((m) => m.id === motoristaId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-motorista">Dashboard de chamados</h1>
          <p className="text-sm text-muted-foreground">
            {selecionado
              ? `Chamados de transporte de ${selecionado.name}.`
              : "Chamados de transporte vindos do Build.Connect."}
          </p>
        </div>
        <DriverFilter drivers={drivers} selectedId={motoristaId} />
      </div>

      {/* Linha 1 — volume e status. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi
          icon={<Inbox className="h-5 w-5" />}
          chip="bg-secondary text-foreground"
          valor={d.total}
          label="Total no período"
          hint="sem os cancelados"
        />
        {TRANSPORT_COLUMNS.map((s) => {
          const st = TRANSPORT_STATUS_STYLE[s];
          const icone = {
            ABERTO: <Clock className="h-5 w-5" />,
            ATRIBUIDO: <Users className="h-5 w-5" />,
            EM_ROTA: <Truck className="h-5 w-5" />,
            CONCLUIDO: <CheckCircle2 className="h-5 w-5" />,
            CANCELADO: <Clock className="h-5 w-5" />,
          }[s];
          return (
            <Kpi
              key={s}
              icon={icone}
              chip={st.badge}
              valor={d.byStatus[s]}
              corValor={NUMERO[s]}
              label={st.label}
              hint={`${pct(d.byStatus[s], d.total)}% do total`}
            />
          );
        })}
      </div>

      {/* Linha 2 — destaques. A quilometragem fica aqui, inteira: o total no
          valor e a média por corrida logo abaixo. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={<Clock className="h-5 w-5" />}
          chip="bg-secondary text-foreground"
          valor={d.avgResolution}
          label="Tempo médio de resolução"
          hint="da abertura à conclusão"
        />
        <Kpi
          icon={<Percent className="h-5 w-5" />}
          chip="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          valor={`${d.completionRate}%`}
          corValor="text-emerald-700 dark:text-emerald-300"
          label="Taxa de conclusão"
          hint={`${d.concludedToday} hoje · ${d.concluded30d} em 30 dias`}
        />
        <Kpi
          icon={<Route className="h-5 w-5" />}
          chip="bg-motorista/15 text-motorista"
          valor={`${d.totalKm} km`}
          corValor="text-motorista"
          label="Quilometragem total"
          hint={`média de ${d.avgKmPerTrip} km por corrida`}
        />
        <Kpi
          icon={<User className="h-5 w-5" />}
          chip="bg-secondary text-foreground"
          valor={d.topDriver}
          label="Quem mais rodou"
          hint={`${d.activeDrivers} motorista(s) ativo(s) em 30 dias`}
        />
      </div>

      {/* Linha 3 — distribuições. */}
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <Painel titulo="Por tipo de serviço" icon={<Tag className="h-3.5 w-3.5" />}>
          <Lista fatias={d.byService} total={d.total} />
        </Painel>

        <Painel titulo="Por setor solicitante" icon={<Building2 className="h-3.5 w-3.5" />}>
          <Lista fatias={d.bySector} total={d.total} />
        </Painel>

        <Painel titulo="Por motorista" icon={<Truck className="h-3.5 w-3.5" />}>
          <Lista fatias={d.byDriver} total={d.byDriver.reduce((s, f) => s + f.count, 0)} />
        </Painel>

        <Painel titulo="Distribuição" icon={<LayoutGrid className="h-3.5 w-3.5" />}>
          <div className="mb-3 flex h-2 w-full overflow-hidden rounded-full bg-secondary">
            {TRANSPORT_COLUMNS.map((s) => (
              <span
                key={s}
                className={TRANSPORT_STATUS_STYLE[s].dot}
                style={{ width: `${pct(d.byStatus[s], d.total)}%` }}
                aria-hidden
              />
            ))}
          </div>
          <ul className="space-y-2">
            {TRANSPORT_COLUMNS.map((s) => (
              <li key={s} className="flex items-center gap-2 text-sm">
                <span
                  className={cn("h-2 w-2 shrink-0 rounded-full", TRANSPORT_STATUS_STYLE[s].dot)}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{TRANSPORT_STATUS_STYLE[s].label}</span>
                <span className="shrink-0 font-semibold">{d.byStatus[s]}</span>
              </li>
            ))}
          </ul>
        </Painel>
      </div>
    </div>
  );
}
