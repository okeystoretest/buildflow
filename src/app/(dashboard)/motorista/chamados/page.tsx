import { requireRole } from "@/lib/auth";
import { listBoard, listActiveDrivers } from "@/lib/transport/queries";
import { TransportBoard } from "./board";

export const dynamic = "force-dynamic";

// Ferramenta "Chamados" do modulo Motorista: chamados de transporte abertos no
// Build.Connect. Logistica/Gestao gerenciam; o motorista assume e executa.
export default async function ChamadosPage() {
  const session = await requireRole(["MOTORISTA", "LOGISTICA", "GESTAO"]);
  const isManager = session.role === "LOGISTICA" || session.role === "GESTAO";
  const [items, drivers] = await Promise.all([
    listBoard(),
    isManager ? listActiveDrivers() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-motorista">Chamados</h1>
        <p className="text-sm text-muted-foreground">Em Aberto → Atribuído → Em Rota → Concluído</p>
      </div>
      <TransportBoard items={items} role={session.role} userId={session.userId} drivers={drivers} />
    </div>
  );
}
