"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/auth";
import { actionOk, actionError, type ActionResult } from "@/types/action";
import { generateReferralCode, buildReferralLink, brandSlug } from "@/lib/wholesale-referral";

/**
 * A base pública, conferida. Compartilhada pelo link por vendedora e pelo link
 * geral — validação duplicada é validação que diverge na primeira correção, e
 * esta existe justamente para link quebrado não chegar ao celular da lojista.
 *
 * `new URL` sozinho não basta, por dois motivos:
 * - ele APARA espaço antes de parsear, então "https://app.com " passa — e
 *   `buildReferralLink` só remove barra final, não espaço, produzindo um link
 *   com espaço no meio;
 * - ele aceita qualquer coisa com cara de esquema: "localhost:3000" parseia com
 *   protocolo "localhost:" e gera link que nenhum celular abre.
 *
 * Falhar aqui é melhor que entregar link quebrado: o erro de um Host inferido
 * só apareceria no celular da lojista, dias depois. Por isso não há valor
 * padrão nem inferência a partir da requisição (decisão 35).
 */
function baseValidada(): ActionResult<string> {
  const base = process.env.APP_BASE_URL;
  if (!base) return actionError("APP_BASE_URL não configurada no servidor.");
  if (base !== base.trim()) {
    return actionError("APP_BASE_URL inválida no servidor (espaço em volta do valor).");
  }
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    return actionError("APP_BASE_URL inválida no servidor (precisa incluir https://).");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return actionError("APP_BASE_URL inválida no servidor (precisa incluir https://).");
  }
  return actionOk(base);
}

/**
 * O link GERAL do formulário de atacado — sem código de indicação.
 *
 * Só GESTAO. Não é restrição de segurança da página (a LP é pública por
 * natureza): é escopo de quem distribui esse caminho, que por decisão do dono é
 * da Gestão. Quem recebe o link não precisa de sessão nenhuma.
 *
 * Quem chega por aqui não tem vendedora de origem, então entra no RODÍZIO: a
 * candidatura ganha dona na chegada e passa adiante a cada dia sem avaliação
 * (ver `src/lib/wholesale-rodizio.ts`).
 *
 * É a mesma página do link por vendedora, sem o `?r=`. Não existe LP separada:
 * criar uma duplicaria a copy, as imagens e o digest da trava de conteúdo, e as
 * duas divergiriam na primeira edição.
 */
export async function linkGeralDoAtacado(): Promise<ActionResult<{ link: string }>> {
  await requireRoleAction(["GESTAO"]);
  const baseOk = baseValidada();
  if (!baseOk.ok) return baseOk;
  return actionOk({ link: `${baseOk.data.replace(/\/+$/, "")}/atacado/${brandSlug("OKEY")}` });
}

/**
 * Devolve o link de indicação da vendedora, criando o código na primeira vez.
 *
 * Criar sob demanda (em vez de na criação do usuário) evita uma migration de
 * backfill e dá código só a quem de fato usa a ferramenta.
 *
 * DESTINO DA INDICAÇÃO: só VENDAS + ATACADO ativa. A Gestão usa a ferramenta
 * (decisões 15 e 16), mas NÃO é destino de indicação: uma candidatura precisa
 * ter uma vendedora como dona, e a fila sem dono já é da Gestão. Por isso o
 * `requireRoleAction` é só VENDAS e o papel é conferido de novo no banco.
 *
 * A UI esconde o botão para quem não pode, mas esconder botão não é controle de
 * acesso: o papel e o `salesModel` são relidos do banco (podem ter mudado
 * desde que o cookie foi emitido) e a recusa é feita aqui.
 */
export async function ensureMyReferralLink(
  brand: "OKEY" | "LOV_CLUB",
): Promise<ActionResult<{ link: string }>> {
  const session = await requireRoleAction(["VENDAS"]);
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, salesModel: true, active: true, referralCode: true },
  });
  if (!user || !user.active || user.role !== "VENDAS" || user.salesModel !== "ATACADO") {
    return actionError("O link de indicação é da equipe de Atacado.");
  }

  // Variavel de SERVIDOR, lida em tempo de execucao — nao NEXT_PUBLIC_*.
  // Um NEXT_PUBLIC_ e embutido por Next no BUILD, e este projeto compila dentro
  // da imagem Docker: uma variavel definida so no runtime do EasyPanel nunca
  // chegaria aqui, e o botao falharia para sempre num servidor que tem o valor.
  // O prefixo tambem nunca foi necessario: este valor e lido numa action
  // "use server" e nunca vai ao navegador (decisao 35).
  // Falhar aqui e melhor que entregar link quebrado: o erro de um Host
  // inferido so apareceria no celular da lojista, dias depois. Por isso nao ha
  // valor padrao nem inferencia a partir da requisicao.
  const baseOk = baseValidada();
  if (!baseOk.ok) return baseOk;
  const base = baseOk.data;

  let code = user.referralCode;
  if (!code) {
    // Colisão do @unique é astronomicamente improvável, mas a gravação a
    // recusaria; três tentativas custam nada e removem o caso.
    for (let i = 0; i < 3 && !code; i++) {
      const candidato = generateReferralCode();
      try {
        // `updateMany` com `referralCode: null` no WHERE: só grava se ninguém
        // gravou antes. Com `update` simples, dois cliques simultâneos (ambos
        // leram `null` acima) gerariam dois códigos e o segundo SOBRESCREVERIA
        // o primeiro — a vendedora teria copiado um link que deixa de valer
        // sem que nada avise. Assim o primeiro vence e o outro lê o dele.
        const { count } = await prisma.user.updateMany({
          where: { id: user.id, referralCode: null },
          data: { referralCode: candidato },
        });
        if (count === 1) {
          code = candidato;
        } else {
          // Outra requisição já criou o código: reutiliza em vez de trocar.
          const atual = await prisma.user.findUnique({
            where: { id: user.id },
            select: { referralCode: true },
          });
          code = atual?.referralCode ?? null;
        }
      } catch (err) {
        // Só a colisão de @unique (P2002) justifica sortear de novo.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        // Qualquer outra falha (banco fora do ar, coluna ausente) é defeito
        // real e não pode ser engolida como "colisão". O `throw` foi trocado
        // por `actionError` logado: um throw numa Server Action chega ao
        // navegador como 500 opaco e não diz nada à vendedora; assim a falha
        // continua nos logs do servidor e ela recebe uma frase acionável.
        console.error("ensureMyReferralLink: falha ao gravar o código de indicação", err);
        return actionError("Não foi possível gerar o link agora. Tente novamente em instantes.");
      }
    }
    if (!code) return actionError("Não foi possível gerar o link. Tente novamente.");
  }

  return actionOk({ link: buildReferralLink(base, brand, code) });
}
