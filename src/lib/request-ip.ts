import { headers, type UnsafeUnwrappedHeaders } from "next/headers";
import { isIP } from "node:net";

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
 * (ex.: Cloudflare + Nginx = 2) — mas veja o aviso abaixo: **alto demais é a
 * direção perigosa**.
 *
 * POR QUE O RESULTADO TEM DE SER UM IP LITERAL:
 * ler de trás para frente está certo, e ainda assim dois gatilhos devolviam
 * texto escolhido pelo remetente:
 *
 *  - **hop configurado acima do real.** Com TRUSTED_PROXY_HOPS=2 e só um proxy
 *    de fato na frente, o remetente manda `X-Forwarded-For: 1.2.3.4`; o proxy
 *    acrescenta, a lista fica `1.2.3.4, <real>`, `length` é 2, `2 - 2 = 0`, e a
 *    função devolvia **a string do próprio remetente**. O `Math.max(0, …)`
 *    transformava "estou configurado para mais proxies do que existem" em
 *    "confio no cliente" em vez de em erro.
 *  - **o fallback.** Alcançada sem o proxy que escreve o XFF (contêiner batido
 *    direto na porta, router que deixou de casar, porta de debug aberta), `xff`
 *    fica vazia e `x-real-ip` é o que o remetente digitou.
 *
 * Nos dois casos o efeito era o mesmo da falha que este arquivo existe para
 * fechar: rotacionando o valor por requisição, o balde é novo sempre —
 * submissões ilimitadas na porta pública do atacado e **tentativas de login
 * ilimitadas em toda a aplicação**, porque `checkLoginRate` usa esta função. E
 * `buckets` crescia uma entrada por string distinta: vazamento de memória lento
 * dirigido de fora.
 *
 * Então o resultado só sai daqui quando **é** um IP literal (`isIP`). Falhar
 * FECHADO é o default certo: todos passam a dividir um balde só, que é
 * restritivo e não permissivo. `wholesale-apply.ts` já mapeia "desconhecido"
 * para `submittedIp: null`, então a coluna também deixa de guardar texto
 * escolhido pelo remetente — o campo passa a ser um IP ou nada, que é o que uma
 * heurística de fraude comparando leads precisa para não mentir.
 */
export function getClientIp(): string {
  const h = (headers() as unknown as UnsafeUnwrappedHeaders);

  const xff = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (xff.length > 0) {
    const configurado = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);
    const hops =
      Number.isFinite(configurado) && configurado > 0 ? Math.floor(configurado) : 1;
    // Índice contado do fim: o último salto é o proxy mais próximo do app.
    // Sem `Math.max`: hop maior que a lista significa configuração errada, e a
    // resposta certa para isso é recusar, não cair no elemento 0 (que é
    // justamente o que o remetente escolhe).
    const indice = xff.length - hops;
    const candidato = indice >= 0 ? xff[indice] : undefined;
    if (candidato && isIP(candidato)) return candidato;
    return "desconhecido";
  }

  const real = h.get("x-real-ip")?.trim();
  return real && isIP(real) ? real : "desconhecido";
}
