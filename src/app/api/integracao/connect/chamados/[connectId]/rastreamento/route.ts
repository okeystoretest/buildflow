import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireConnectToken } from "@/lib/integration/connect-auth";
import { buildTracking } from "@/lib/transport/tracking";
import { addressLabel } from "@/lib/transport/geocode";

// GET .../rastreamento — DTO TripTracking (o mesmo do mapa do Connect).
// 404 enquanto a rota nao foi iniciada: o front do Connect ja trata como
// "sem tracking".
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { connectId: string } },
): Promise<Response> {
  const denied = requireConnectToken(req);
  if (denied) return denied;

  const r = await prisma.transportRequest.findUnique({
    where: { connectId: params.connectId },
    select: {
      id: true,
      status: true,
      startedAt: true,
      originUnit: true, originStreet: true, originNumber: true, originDistrict: true,
      destStreet: true, destNumber: true, destDistrict: true,
      originLat: true, originLng: true, destLat: true, destLng: true,
      driver: { select: { name: true } },
      positions: {
        orderBy: { recordedAt: "asc" },
        select: { lat: true, lng: true, heading: true, speed: true, recordedAt: true },
      },
    },
  });
  if (!r) return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 });
  if (!r.startedAt) return NextResponse.json({ error: "Corrida não iniciada." }, { status: 404 });

  const dto = buildTracking({
    id: r.id,
    status: r.status,
    originLat: r.originLat,
    originLng: r.originLng,
    originLabel:
      r.originUnit ??
      addressLabel({ street: r.originStreet, number: r.originNumber, district: r.originDistrict }, "Origem não informada"),
    destLat: r.destLat,
    destLng: r.destLng,
    destLabel: addressLabel({ street: r.destStreet, number: r.destNumber, district: r.destDistrict }, "Destino não informado"),
    startedAt: r.startedAt,
    driverName: r.driver?.name ?? "Motorista",
    positions: r.positions,
  });
  return NextResponse.json(dto, { headers: { "Cache-Control": "no-store" } });
}
