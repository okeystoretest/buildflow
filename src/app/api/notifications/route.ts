import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Central de Notificações — leitura.
 *
 * GET /api/notifications
 * Retorna as notificações recentes do usuário logado (as 30 últimas) e a
 * contagem de não lidas. O sino no cabeçalho consulta este endpoint em
 * intervalos curtos (e ao ser aberto).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX = 30;

export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: "desc" },
        take: MAX,
        select: { id: true, message: true, orderId: true, read: true, createdAt: true },
      }),
      prisma.notification.count({ where: { userId: session.userId, read: false } }),
    ]);

    return NextResponse.json({
      unread,
      items: items.map((n) => ({
        id: n.id,
        message: n.message,
        orderId: n.orderId,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
      })),
    });
  } catch {
    // Nunca derruba o cabeçalho por causa do sino: devolve vazio.
    return NextResponse.json({ unread: 0, items: [] });
  }
}
