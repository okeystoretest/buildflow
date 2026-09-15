import { NextResponse } from "next/server";
import { verifyBearer } from "./signature";

/**
 * Variaveis da integracao com o Build.Connect. Sem as tres, a integracao fica
 * DESLIGADA com erro explicito (503 na API, log no webhook) — nunca aberta.
 *
 *   CONNECT_INTEGRATION_TOKEN  bearer aceito na API de integracao
 *   CONNECT_WEBHOOK_URL        base do Connect na rede interna (http://buildconnect:3000)
 *   CONNECT_WEBHOOK_SECRET     chave do HMAC do webhook
 */
export function integrationEnv(): {
  token: string;
  webhookUrl: string;
  webhookSecret: string;
} | null {
  const token = process.env.CONNECT_INTEGRATION_TOKEN?.trim();
  const webhookUrl = process.env.CONNECT_WEBHOOK_URL?.trim().replace(/\/+$/, "");
  const webhookSecret = process.env.CONNECT_WEBHOOK_SECRET?.trim();
  if (!token || !webhookUrl || !webhookSecret) return null;
  return { token, webhookUrl, webhookSecret };
}

/**
 * Porta da API de integracao. Devolve null quando o chamador esta autorizado;
 * caso contrario, a resposta pronta (503 sem configuracao, 401 sem token).
 */
export function requireConnectToken(req: Request): Response | null {
  const env = integrationEnv();
  if (!env) {
    console.error("[integracao] CONNECT_INTEGRATION_TOKEN/WEBHOOK_URL/WEBHOOK_SECRET ausentes.");
    return NextResponse.json(
      { error: "Integração com o Build.Connect não configurada." },
      { status: 503 },
    );
  }
  if (!verifyBearer(req.headers.get("authorization"), env.token)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  return null;
}
