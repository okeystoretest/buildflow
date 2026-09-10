// Envio de notificacao aos motoristas.
//
// Fronteira publica do modulo: nada fora de src/lib/whatsapp/ conhece Baileys.
// Nunca lanca — falha de WhatsApp nao pode derrubar uma acao de logistica.

import { prisma } from "@/lib/prisma";
import { getSocket, getConnectionSnapshot } from "./connection";
import { toWhatsappJid, phoneSuffix, sendSpacingMs, resolveSendJid } from "./pure";
import { getOutbox, MENSAGEM_NOVO_PACOTE } from "./outbox";

// O texto mora no outbox porque o reenvio precisa dele sem passar por aqui.
// Reexportado para nao mudar a superficie publica do modulo.
export { MENSAGEM_NOVO_PACOTE };

function espera(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function envioLigado(): Promise<boolean> {
  const cfg = await prisma.whatsappConfig.findUnique({ where: { id: "singleton" } });
  return cfg?.enabled === true;
}

/**
 * Avisa os motoristas de que ha pacote disponivel.
 *
 * Sem `driverId`, avisa TODOS (pedido em aberto: e uma corrida). Com
 * `driverId`, avisa so aquele motorista — o pedido ja tem dono e chamar a
 * equipe inteira viraria ruido.
 *
 * O filtro por papel esta na consulta ao banco, e nao numa checagem posterior:
 * nao existe caminho neste codigo em que outro perfil receba mensagem. O
 * `driverId` ESTREITA essa consulta, nunca a substitui — pedir a mensagem para
 * um usuario que nao e motorista ativo simplesmente nao encontra ninguem.
 */
export async function sendWhatsappToDrivers(args: {
  orderId?: string;
  driverId?: string | null;
}): Promise<void> {
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
      where: {
        role: "MOTORISTA",
        active: true,
        phone: { not: null },
        ...(args.driverId ? { id: args.driverId } : {}),
      },
      select: { id: true, phone: true },
    });

    if (motoristas.length === 0) {
      console.log(
        args.driverId
          ? "[whatsapp] motorista atribuido sem telefone cadastrado; nada enviado."
          : "[whatsapp] nenhum motorista com telefone cadastrado.",
      );
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
        // CONFIRMA o JID antes de enviar. O JID construido (55 + DDD + numero)
        // nao e necessariamente o que o WhatsApp reconhece — numero brasileiro
        // registrado antes do nono digito tem JID canonico sem o 9. Enviar para
        // a forma errada NAO da erro: o Baileys aceita e a mensagem se perde,
        // que era exatamente o caso de "log diz ENVIADO e ninguem recebe".
        const lookup = await sock.onWhatsApp(jid).catch(() => undefined);
        const alvo = resolveSendJid(jid, lookup);

        if (alvo.kind === "sem-whatsapp") {
          ignorados++;
          await registrar(
            args.orderId,
            m.id,
            sufixo,
            "IGNORADO",
            "Numero nao possui WhatsApp.",
          );
          console.warn(
            `[whatsapp] usuario ${m.id} (final ${sufixo ?? "?"}): numero sem WhatsApp; ignorado.`,
          );
          continue;
        }

        const enviado = await sock.sendMessage(alvo.jid, { text: MENSAGEM_NOVO_PACOTE });
        // GUARDA O CONTEUDO ENVIADO. Se o aparelho do motorista nao
        // conseguir descriptografar, ele exibe "Aguardando mensagem" e pede o
        // reenvio; o Baileys busca o conteudo aqui (ver getMessage em
        // connection.ts). Sem este registro nao ha o que reenviar, e o
        // placeholder fica na tela do motorista para sempre.
        if (enviado?.key.id && enviado.message) {
          getOutbox().lembrar(enviado.key.id, enviado.message);
        }
        enviados++;
        await registrar(args.orderId, m.id, sufixo, "ENVIADO", null);
        console.log(
          `[whatsapp] enviado para usuario ${m.id} (final ${sufixo ?? "?"}, jid ${alvo.kind}).`,
        );
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
