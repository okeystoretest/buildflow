import { NextResponse, type NextRequest } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { hasTrackingAccess } from "@/lib/tracking-auth";
import { resolveUploadedFilePath } from "@/lib/image";

/**
 * COMPROVANTE DE ENTREGA no acompanhamento do CLIENTE FINAL.
 *
 * Por que uma rota própria em vez de apontar para /api/uploads: aquele handler
 * exige uma sessão do dashboard (`bf_session`) e devolveria 401 para o cliente.
 * E o cookie do acompanhamento (`bf_track`) é gravado com `path: "/acompanhar"`
 * — ele só é enviado para requisições sob esse caminho. Por isso a rota mora
 * aqui dentro, e não em /api: fora daqui o navegador não mandaria a credencial
 * que autoriza a leitura.
 *
 * Autorização em duas camadas:
 *  1) o visitante precisa ter passado pelo gate do Código de Cliente DESTE
 *     token (hasTrackingAccess confere o token dentro do JWT);
 *  2) a foto precisa pertencer a um pedido DO MESMO CLIENTE do token. Isso é o
 *     que permite servir também os comprovantes das compras anteriores sem
 *     abrir a porta para o comprovante de outra pessoa — o id da foto sozinho
 *     não autoriza nada.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string; proofId: string } },
) {
  // 1) O visitante validou o Código de Cliente deste link?
  if (!(await hasTrackingAccess(params.token))) {
    return new NextResponse("Não autorizado.", { status: 401 });
  }

  // 2) Cliente dono do link.
  const order = await prisma.order.findUnique({
    where: { trackingToken: params.token },
    select: { customerId: true },
  });
  if (!order) return new NextResponse("Não encontrado.", { status: 404 });

  // 3) A foto pertence a um pedido desse mesmo cliente?
  const proof = await prisma.proof.findUnique({
    where: { id: params.proofId },
    select: {
      filePath: true,
      delivery: { select: { order: { select: { customerId: true } } } },
    },
  });
  if (!proof || proof.delivery.order.customerId !== order.customerId) {
    // 404 (e não 403) de propósito: para quem não tem acesso, a existência da
    // foto não é informação.
    return new NextResponse("Não encontrado.", { status: 404 });
  }

  // 4) Caminho em disco (com a proteção contra traversal do próprio helper) e
  //    apenas extensões de imagem — o comprovante do motorista é sempre foto.
  const absolute = resolveUploadedFilePath(proof.filePath);
  if (!absolute) return new NextResponse("Caminho inválido.", { status: 400 });
  const contentType = CONTENT_TYPES[path.extname(absolute).toLowerCase()];
  if (!contentType) {
    return new NextResponse("Tipo de arquivo não permitido.", { status: 400 });
  }

  try {
    const info = await stat(absolute);
    if (!info.isFile()) return new NextResponse("Não encontrado.", { status: 404 });
    const data = await readFile(absolute);
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(info.size),
        // Cache privado: fica no navegador do cliente, nunca em proxy comum.
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Não encontrado.", { status: 404 });
  }
}
