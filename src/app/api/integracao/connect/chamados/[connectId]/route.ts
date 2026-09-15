import { NextResponse } from "next/server";
import { requireConnectToken } from "@/lib/integration/connect-auth";
import { getTransportByConnectId } from "@/lib/transport/queries";
import { toConnectStatus } from "@/lib/transport/status";

// GET /api/integracao/connect/chamados/:connectId — detalhe + status no
// vocabulario do Connect + historico.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { connectId: string } },
): Promise<Response> {
  const denied = requireConnectToken(req);
  if (denied) return denied;

  const r = await getTransportByConnectId(params.connectId);
  if (!r) return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 });

  return NextResponse.json(
    {
      id: r.id,
      connectId: r.connectId,
      code: r.code,
      status: toConnectStatus(r.status),
      flowStatus: r.status,
      driver: r.driverId ? { id: r.driverId, name: r.driverName } : null,
      assignedAt: r.assignedAt,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      distanceKm: r.distanceKm,
      hasProof: Boolean(r.proofPath),
      cancelReason: r.cancelReason,
      history: r.history,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
