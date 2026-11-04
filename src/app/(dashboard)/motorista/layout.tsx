import { requireRole } from "@/lib/auth";

/**
 * Modulo Motorista. As ferramentas (Entregas, Chamados, Dashboard) vivem na
 * barra lateral desde 04/11/2026 — ver `(dashboard)/nav.ts`. Este layout
 * guarda apenas a porta do modulo; cada pagina confere o proprio papel.
 */
export default async function MotoristaLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["MOTORISTA", "LOGISTICA", "GESTAO"]);
  return <>{children}</>;
}
