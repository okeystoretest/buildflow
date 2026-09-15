import { requireRole } from "@/lib/auth";
import { ToolTabs, type ToolTab } from "./tool-tabs";

/**
 * Modulo Motorista = ferramentas. Cada uma confere o proprio papel na pagina;
 * aqui so decidimos QUAIS abas aparecem:
 *   Entregas  MOTORISTA, GESTAO
 *   Chamados  MOTORISTA, LOGISTICA, GESTAO   (vindos do Build.Connect)
 *   Dashboard LOGISTICA, GESTAO
 */
export default async function MotoristaLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(["MOTORISTA", "LOGISTICA", "GESTAO"]);
  const role = session.role;

  const tabs: ToolTab[] = [];
  if (role === "MOTORISTA" || role === "GESTAO") {
    tabs.push({ href: "/motorista", label: "Entregas", icon: "entregas" });
  }
  tabs.push({ href: "/motorista/chamados", label: "Chamados", icon: "chamados" });
  if (role === "LOGISTICA" || role === "GESTAO") {
    tabs.push({ href: "/motorista/dashboard", label: "Dashboard", icon: "dashboard" });
  }

  return (
    <div>
      <ToolTabs tabs={tabs} />
      {children}
    </div>
  );
}
