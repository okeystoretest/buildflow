import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Registro e cancelamento de inscrições de Web Push do usuário logado.
 *
 * POST  { endpoint, keys: { p256dh, auth } }  -> salva/atualiza (upsert por endpoint)
 * DELETE { endpoint }                          -> remove a inscrição daquele device
 *
 * A inscrição é sempre atrelada ao usuário da SESSÃO — o client não escolhe o
 * dono. O upsert por endpoint evita duplicatas quando o navegador reassina.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const sub = payload as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Inscricao incompleta" }, { status: 400 });
  }

  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh, auth, userId: session.userId },
      // Se o endpoint migrar de dono (mesmo device, outro login), reatribui.
      update: { p256dh, auth, userId: session.userId },
    });
  } catch (err) {
    console.error("[push] falha ao salvar inscricao:", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  let endpoint: string | undefined;
  try {
    const body = (await req.json()) as { endpoint?: string };
    endpoint = body?.endpoint;
  } catch {
    /* corpo opcional */
  }

  if (!endpoint) return NextResponse.json({ error: "endpoint ausente" }, { status: 400 });

  try {
    // Só remove se for do próprio usuário (evita apagar device de outro).
    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: session.userId },
    });
  } catch (err) {
    console.error("[push] falha ao remover inscricao:", err);
    return NextResponse.json({ error: "Falha ao remover" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
