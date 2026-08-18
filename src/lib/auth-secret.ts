/**
 * Fonte única do segredo de assinatura dos JWT de sessão.
 *
 * SEGURANÇA: não há fallback ("dev_inseguro_troque"). Se `AUTH_SECRET` estiver
 * ausente ou fraco, o app FALHA ao tentar usar o segredo — o que impede rodar
 * com um segredo público (qualquer um forjaria uma sessão de GESTAO).
 *
 * IMPORTANTE (build): a validação é PREGUIÇOSA (só na 1ª utilização), não no
 * import. Assim o `next build` — que executa código de módulo ao coletar
 * páginas/middleware — nunca quebra por causa de env de runtime ausente.
 */

let cached: Uint8Array | null = null;

function validateAndEncode(raw: string | undefined): Uint8Array {
  if (!raw || raw.trim().length === 0) {
    throw new Error(
      "AUTH_SECRET ausente. Defina AUTH_SECRET no ambiente do serviço " +
        "(mínimo 32 caracteres). O app não opera sem um segredo válido.",
    );
  }
  if (process.env.NODE_ENV === "production") {
    if (raw.length < 32) {
      throw new Error(
        "AUTH_SECRET muito curto para produção (mínimo 32 caracteres).",
      );
    }
    if (raw === "dev_inseguro_troque") {
      throw new Error("AUTH_SECRET está com o valor de exemplo. Troque-o.");
    }
  }
  return new TextEncoder().encode(raw);
}

/**
 * Retorna a chave de assinatura, validando na primeira chamada e cacheando.
 * Chamada nos pontos de uso (sign/verify), nunca no topo do módulo.
 */
export function getAuthSecret(): Uint8Array {
  if (cached) return cached;
  cached = validateAndEncode(process.env.AUTH_SECRET);
  return cached;
}
