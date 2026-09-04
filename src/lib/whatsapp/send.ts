// Envio de notificacao aos motoristas.
//
// Fronteira publica do modulo: nada fora de src/lib/whatsapp/ conhece Baileys.
// Nunca lanca — falha de WhatsApp nao pode derrubar uma acao de logistica.

import { prisma } from "@/lib/prisma";
import { getSocket, getConnectionSnapshot } from "./connection";
import { toWhatsappJid, phoneSuffix, sendSpacingMs } from "./pure";

/** Texto exato definido pelo produto. */
export const MENSAGEM_NOVO_PACOTE =
  "Novo pacote disponível para entrega!\n" +
  "Acesse https://buildflowapp.com.br/login para mais informações.";

function espera(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function envioLigado(): Promise<boolean> {
  const cfg = await prisma.whatsappConfig.findUnique({ where: { id: "singleton" } });
  return cfg?.enabled === true;
}

/**
 * Avisa TODOS os motoristas de que ha pacote disponivel.
 *
 * O filtro por papel esta na consulta ao banco, e nao numa checagem posterior:
 * nao existe caminho neste codigo em que outro perfil receba mensagem.
 */
export async function sendWhatsappToDrivers(args: { orderId?: string }): Promise<void> {
  try {
    if (!(await envioLigado())) {
      console.log("[whatsapp] envio desligado; nada enviado.");
      return;
    }

    const snap = getConnectionSnapshot();
    const sock = getSocket();
    if (!sock) {
      console.warn(`[whatsapp] sem conexao (estado ${snap.state}); nada enviado.`);
      return;
    }

    const motoristas = await prisma.user.findMany({
      where: { role: "MOTORISTA", active: true, phone: { not: null } },
      select: { id: true, phone: true },
    });

    if (motoristas.length === 0) {
      console.log("[whatsapp] nenhum motorista com telefone cadastrado.");
      return;
    }

    let enviados = 0;
    let falhas = 0;
    let ignorados = 0;

    for (let i = 0; i < motoristas.length; i++) {
      const m = motoristas[i];
      const sufixo = phoneSuffix(m.phone);
      const jid = toWhatsappJid(m.phone);

      if (!jid) {
        ignorados++;
        await registrar(args.orderId, m.id, sufixo, "IGNORADO", "Telefone ausente ou inválido.");
        console.warn(`[whatsapp] usuario ${m.id}: telefone invalido; ignorado.`);
        continue;
      }

      // try/catch POR DESTINATARIO: uma falha nunca interrompe as demais.
      try {
        await sock.sendMessage(jid, { text: MENSAGEM_NOVO_PACOTE });
        enviados++;
        await registrar(args.orderId, m.id, sufixo, "ENVIADO", null);
        console.log(`[whatsapp] enviado para usuario ${m.id} (final ${sufixo ?? "?"}).`);
      } catch (err) {
        falhas++;
        const motivo = err instanceof Error ? err.message : "Erro desconhecido.";
        await registrar(args.orderId, m.id, sufixo, "FALHOU", motivo);
        console.error(`[whatsapp] falha para usuario ${m.id} (final ${sufixo ?? "?"}): ${motivo}`);
      }

      // Espacamento entre destinatarios. Disparo paralelo para N numeros e o
      // padrao que mais provoca bloqueio do numero.
      if (i < motoristas.length - 1) await espera(sendSpacingMs());
    }

    console.log(
      `[whatsapp] concluido: ${enviados} enviado(s), ${falhas} falha(s), ${ignorados} ignorado(s).`,
    );
  } catch (err) {
    // Rede de seguranca: esta funcao nunca lanca para quem a chamou.
    console.error("[whatsapp] erro inesperado no envio:", err);
  }
}

async function registrar(
  orderId: string | undefined,
  userId: string,
  phoneSuffixValue: string | null,
  status: "ENVIADO" | "FALHOU" | "IGNORADO",
  error: string | null,
): Promise<void> {
  try {
    await prisma.whatsappSendLog.create({
      data: { orderId: orderId ?? null, userId, phoneSuffix: phoneSuffixValue, status, error },
    });
  } catch (err) {
    // Falhar ao gravar o log nao pode interromper os envios seguintes.
    console.error("[whatsapp] falha ao gravar log de envio:", err);
  }
}
