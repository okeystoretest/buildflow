import { NextResponse } from "next/server";
import { requireConnectToken } from "@/lib/integration/connect-auth";
import { listActiveDrivers } from "@/lib/transport/queries";

// GET /api/integracao/connect/motoristas — MOTORISTA ativos para o formulario
// do Connect. Sem dados alem de id e nome.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const denied = requireConnectToken(req);
  if (denied) return denied;
  const drivers = await listActiveDrivers();
  return NextResponse.json({ drivers }, { headers: { "Cache-Control": "no-store" } });
}
