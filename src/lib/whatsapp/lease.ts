// Concessao de instancia unica para a conexao do WhatsApp.
//
// Duas conexoes com a mesma credencial se derrubam e colocam o numero em risco
// de bloqueio, entao apenas um processo pode conectar.
//
// pg_advisory_lock foi descartado: o lock do Postgres vive preso a conexao que
// o tomou, e o Prisma trabalha com pool — nao ha como garantir que a conexao
// detentora continue viva nem que seja reutilizada. A concessao por linha com
// heartbeat funciona com pool e sobrevive a queda do processo (a linha
// simplesmente expira).

import { prisma } from "@/lib/prisma";
import { isLeaseExpired, LEASE_HEARTBEAT_MS } from "./pure";

const LOCK_ID = "singleton";

/**
 * Tenta assumir a lideranca. Devolve true se este processo pode conectar.
 *
 * Assume quando: a linha nao existe, ja e deste processo, ou o heartbeat do
 * dono atual expirou. A corrida entre processos e resolvida no banco pelo
 * updateMany condicionado ao dono esperado — dois processos podem ler o mesmo
 * estado, mas so um consegue o update.
 */
export async function acquireLease(instanceId: string): Promise<boolean> {
  const agora = new Date();
  const atual = await prisma.whatsappLock.findUnique({ where: { id: LOCK_ID } });

  if (!atual) {
    try {
      await prisma.whatsappLock.create({
        data: { id: LOCK_ID, instanceId, heartbeatAt: agora },
      });
      return true;
    } catch {
      // Outro processo criou a linha entre o findUnique e o create.
      return false;
    }
  }

  if (atual.instanceId === instanceId) {
    await prisma.whatsappLock.update({
      where: { id: LOCK_ID },
      data: { heartbeatAt: agora },
    });
    return true;
  }

  if (!isLeaseExpired(atual.heartbeatAt, agora)) return false;

  // Toma a concessao abandonada, mas so se o dono ainda for o que lemos.
  const { count } = await prisma.whatsappLock.updateMany({
    where: { id: LOCK_ID, instanceId: atual.instanceId, heartbeatAt: atual.heartbeatAt },
    data: { instanceId, heartbeatAt: agora },
  });
  return count === 1;
}

/**
 * Mantem a concessao viva enquanto o processo estiver de pe. Devolve a funcao
 * que interrompe a renovacao.
 */
export function startHeartbeat(instanceId: string): () => void {
  const timer = setInterval(() => {
    void prisma.whatsappLock
      .updateMany({ where: { id: LOCK_ID, instanceId }, data: { heartbeatAt: new Date() } })
      .catch((err) => console.error("[whatsapp] falha ao renovar concessao:", err));
  }, LEASE_HEARTBEAT_MS);
  // O tsconfig inclui a lib "dom", entao setInterval pode tipar como number,
  // que nao tem unref(). O cast mantem o unref quando existe (Node) e nao
  // quebra o type-check. unref evita que o timer segure o processo aberto.
  (timer as unknown as { unref?: () => void }).unref?.();
  return () => clearInterval(timer);
}

// Nao existe "liberar concessao" de proposito: se o processo morre, o
// heartbeat para e a linha expira sozinha pelo TTL. Uma liberacao explicita so
// teria valor num encerramento limpo, que nao e garantido de qualquer forma.
