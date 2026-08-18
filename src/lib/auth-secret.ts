/**
 * Fonte única do segredo de assinatura dos JWT de sessão.
 *
 * SEGURANÇA: não há mais fallback ("dev_inseguro_troque"). Se `AUTH_SECRET`
 * estiver ausente ou fraco, o app FALHA AO INICIAR em vez de rodar com um
 * segredo público — o que permitiria a qualquer um forjar uma sessão de
 * GESTAO. Falhar cedo é preferível a uma brecha silenciosa.
 *
 * Em desenvolvimento, para não travar o fluxo local, aceitamos um segredo de
 * dev explícito vindo do ambiente; mesmo assim exigimos que ele exista.
 */
function loadSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;

  if (!raw || raw.trim().length === 0) {
    throw new Error(
      "AUTH_SECRET ausente. Defina AUTH_SECRET no ambiente do serviço " +
        "(mínimo 32 caracteres). O app não sobe sem um segredo válido.",
    );
  }

  // Em produção, recusa segredos curtos/óbvios (defesa contra config frouxa).
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

export const AUTH_SECRET_KEY = loadSecret();
