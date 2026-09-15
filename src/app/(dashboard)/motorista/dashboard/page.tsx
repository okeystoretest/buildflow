import { requireRole } from "@/lib/auth";
import { getTransportDashboard } from "@/lib/transport/dashboard";
import { TRANSPORT_COLUMNS, TRANSPORT_STATUS_STYLE } from "@/lib/transport/status";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Bars({ title, entries }: { title: string; entries: { label: string; count: number }[] }) {
  const max = Math.max(1, ...entries.map((e) => e.count));
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold">{title}</p>
      <div className="space-y-2">
        {entries.length === 0 && <p className="text-xs text-muted-foreground">Sem dados.</p>}
        {entries.slice(0, 8).map((e) => (
          <div key={e.label}>
            <div className="flex justify-between text-xs">
              <span>{e.label}</span>
              <span className="text-muted-foreground">{e.count}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-secondary">
              <div className="h-2 rounded-full bg-motorista" style={{ width: `${(e.count / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Ferramenta "Dashboard" do modulo Motorista — os numeros dos chamados de
// transporte (o que antes morava no Connect).
export default async function MotoristaDashboardPage() {
  await requireRole(["LOGISTICA", "GESTAO"]);
  const d = await getTransportDashboard();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-motorista">Dashboard de chamados</h1>
        <p className="text-sm text-muted-foreground">Chamados de transporte vindos do Build.Connect.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Chamados" value={d.total} hint="sem os cancelados" />
        <Tile label="Concluídos hoje" value={d.concludedToday} hint={`${d.concluded30d} nos últimos 30 dias`} />
        <Tile label="Tempo médio" value={d.avgResolution} hint="da abertura à conclusão" />
        <Tile label="Taxa de conclusão" value={`${d.completionRate}%`} />
        <Tile label="Quilometragem total" value={`${d.totalKm} km`} />
        <Tile label="Média por corrida" value={`${d.avgKmPerTrip} km`} />
        <Tile label="Motoristas ativos" value={d.activeDrivers} hint="com chamado nos últimos 30 dias" />
        <Tile label="Mais corridas" value={d.topDriver} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold">Por status</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TRANSPORT_COLUMNS.map((s) => {
            const st = TRANSPORT_STATUS_STYLE[s];
            return (
              <div key={s} className={cn("rounded-lg border px-3 py-2", st.header)}>
                <p className="text-xs">{st.label}</p>
                <p className="text-xl font-bold">{d.byStatus[s]}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bars title="Por tipo de serviço" entries={d.byService} />
        <Bars title="Por setor solicitante" entries={d.bySector} />
      </div>
    </div>
  );
}
