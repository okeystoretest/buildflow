import { randomBytes } from "crypto";

/**
 * Link de indicação: como um lead da LP pública encontra a vendedora dona.
 *
 * O PARÂMETRO NÃO É O userId (decisão 13). Um `?v=<userId>` vazaria ids
 * internos, seria enumerável e deixaria qualquer pessoa apontar submissões
 * para qualquer vendedora. O código é opaco, aleatório e único, e pode ser
 * rotacionado se vazar.
 *
 * Função PURA de propósito: quem chama carrega os candidatos do banco e
 * obedece ao veredito, e um script confere a regra sem subir Postgres.
 */

export const REFERRAL_CODE_LENGTH = 10;

// Base32 sem I, L, O e U: os três primeiros se confundem com 1 e 0 quando
// alguém lê o link em voz alta ou digita à mão, e U sai em palavra acidental.
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export function generateReferralCode(): string {
  // randomBytes, não Math.random: o código é credencial de atribuição.
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function isWellFormedReferralCode(code: string): boolean {
  if (typeof code !== "string" || code.length !== REFERRAL_CODE_LENGTH) return false;
  for (const ch of code) if (!ALPHABET.includes(ch)) return false;
  return true;
}

export interface ReferralCandidate {
  id: string;
  referralCode: string | null;
  role: string;
  salesModel: string | null;
  active: boolean;
}

/**
 * De quem é este lead? Devolve o id da vendedora, ou null.
 *
 * NUNCA lança e nunca devolve erro: código ausente, malformado, inexistente,
 * de usuária desativada ou que deixou de ser VENDAS+ATACADO resolve para null,
 * e o lead entra sem dono para a Gestão distribuir (decisão 14). O link pode
 * ter circulado por meses antes de alguém clicar — a elegibilidade é conferida
 * no momento do envio, não no da geração.
 */
export function resolveReferral(
  code: string | null | undefined,
  candidatos: ReferralCandidate[],
): string | null {
  if (!code || !isWellFormedReferralCode(code)) return null;
  const achado = candidatos.find((c) => c.referralCode === code);
  if (!achado) return null;
  if (!achado.active) return null;
  if (achado.role !== "VENDAS") return null;
  if (achado.salesModel !== "ATACADO") return null;
  return achado.id;
}

/** Slug público de cada marca. Único lugar onde essa tradução existe. */
export function brandSlug(brand: "OKEY" | "LOV_CLUB"): string {
  return brand === "LOV_CLUB" ? "lov-club" : "okey";
}

/**
 * O texto que o botão "Copiar link de indicação" entrega.
 * `baseUrl` vem de variável de ambiente, não do Host da requisição (decisão
 * 35): o botão é clicado dentro do dashboard, mas o link vai para fora, e
 * inferir do Host produz link quebrado atrás do proxy do EasyPanel — erro que
 * só apareceria no celular da lojista.
 */
export function buildReferralLink(
  baseUrl: string,
  brand: "OKEY" | "LOV_CLUB",
  code: string,
): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/atacado/${brandSlug(brand)}?r=${code}`;
}
