import { headers } from "next/headers";

/**
 * IP do cliente atrás do proxy reverso (Nginx / Traefik do EasyPanel).
 *
 * POR QUE NÃO LER O PRIMEIRO ELEMENTO DO X-Forwarded-For:
 * o header é uma lista append-only — o proxy ACRESCENTA o IP real ao FINAL,
 * preservando o que o cliente enviou. Ler `split(",")[0]` entregava, portanto,
 * um valor escolhido pelo visitante: bastava mandar um X-Forwarded-For
 * diferente a cada requisição para cair sempre em um balde novo de rate limit
 * e anular a proteção de força bruta do login e do Código de Cliente.
 *
 * Aqui contamos a partir do FIM. Com TRUSTED_PROXY_HOPS=1 (padrão), o IP válido
 * é o último da lista — escrito pelo nosso próprio proxy, fora do alcance do
 * cliente. Ajuste a variável se houver mais de um proxy confiável na frente
 * (ex.: Cloudflare + Nginx = 2).
 *
 * Sem proxy algum (dev local), a lista vem vazia e caímos no x-real-ip.
 */
export function getClientIp(): string {
  const h = headers();

  const xff = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (xff.length > 0) {
    const configurado = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);
    const hops =
      Number.isFinite(configurado) && configurado > 0 ? Math.floor(configurado) : 1;
    // Índice contado do fim: o último salto é o proxy mais próximo do app.
    return xff[Math.max(0, xff.length - hops)];
  }

  return h.get("x-real-ip")?.trim() || "desconhecido";
}
