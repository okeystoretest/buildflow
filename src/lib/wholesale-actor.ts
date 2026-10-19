import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { canUseWholesaleTool, type WholesaleActor } from "@/lib/wholesale-permissions";

/**
 * O ator da Análise de Clientes, resolvido uma vez para as DUAS telas (lista e
 * dashboard).
 *
 * Existe para que a segunda tela não repita a regra da primeira. `requireRole`
 * libera o PAPEL, não o ESCOPO de venda: uma vendedora de VAREJO tem papel
 * VENDAS e passaria por ele digitando a URL à mão, e esta ferramenta é da
 * equipe de Atacado (decisão 15). Escrita duas vezes, essa regra diverge na
 * primeira correção — e a metade esquecida vira uma tela aberta.
 *
 * O ator é RELIDO DO BANCO: papel e `salesModel` podem ter mudado desde que o
 * cookie foi emitido, e o cookie não é fonte de verdade para autorização.
 *
 * Devolve `null` (e não redireciona) quando não serve: cada tela decide o que
 * mostrar, e todas mostram a mesma mensagem em vez de um 500.
 *
 * Vive fora de `wholesale-queries.ts` de propósito: aquele arquivo é importado
 * por script de checagem, e trazer `@/lib/auth` (e o `next/headers` que ele usa)
 * para dentro dele quebraria o check fora do runtime do Next.
 */
export async function atorDaFerramenta(): Promise<WholesaleActor | null> {
  const session = await requireRole(["VENDAS", "GESTAO"]);

  // Sem `!`: se o usuário da sessão não existe mais (desativado, removido), o
  // caminho é negar, não estourar um 500 por acesso a `undefined`.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, salesModel: true },
  });
  if (!user) return null;

  const actor: WholesaleActor = {
    userId: user.id,
    role: user.role,
    salesModel: user.salesModel,
  };
  return canUseWholesaleTool(actor) ? actor : null;
}
