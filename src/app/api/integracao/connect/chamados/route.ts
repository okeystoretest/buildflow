import { NextResponse } from "next/server";
import { requireConnectToken } from "@/lib/integration/connect-auth";
import { checkRate } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { createFromConnect, createFromConnectSchema } from "@/lib/transport/create";

// POST /api/integracao/connect/chamados — multipart: campo `payload` (JSON com
// o chamado) + `images` (0..5 fotos). Idempotente por connectId.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const denied = requireConnectToken(req);
  if (denied) return denied;

  // Teto generoso: e uma maquina falando, mas um loop de reenvio com bug nao
  // pode afogar o banco.
  const rate = checkRate(`integracao:${getClientIp()}`, { max: 120, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Muitas requisições." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Corpo inválido (esperado multipart)." }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return NextResponse.json({ error: "Campo payload inválido." }, { status: 400 });
  }
  const parsed = createFromConnectSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Chamado inválido.", issues: parsed.error.issues }, { status: 422 });
  }

  const images = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);

  try {
    const result = await createFromConnect(parsed.data, images);
    return NextResponse.json(
      { id: result.id, status: result.status, driver: result.driver },
      { status: result.created ? 201 : 200 },
    );
  } catch (err) {
    console.error("[integracao] criar chamado falhou:", err);
    const msg = err instanceof Error ? err.message : "Falha ao criar o chamado.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
