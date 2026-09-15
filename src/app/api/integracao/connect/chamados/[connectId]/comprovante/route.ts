import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { requireConnectToken } from "@/lib/integration/connect-auth";
import { resolveUploadedFilePath } from "@/lib/image";

// GET .../comprovante — bytes do .webp. O Connect serve ao solicitante pela
// propria rota autenticada; aqui so o token de servico entra.
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
    select: { proofPath: true },
  });
  if (!r?.proofPath) return NextResponse.json({ error: "Sem comprovante." }, { status: 404 });

  const absolute = resolveUploadedFilePath(r.proofPath);
  if (!absolute) return NextResponse.json({ error: "Arquivo indisponível." }, { status: 404 });

  try {
    const data = await readFile(absolute);
    return new NextResponse(data, {
      status: 200,
      headers: { "content-type": "image/webp", "Cache-Control": "private, max-age=300" },
    });
  } catch {
    return NextResponse.json({ error: "Arquivo indisponível." }, { status: 404 });
  }
}
