// Conexao unica com o WhatsApp via Baileys.
//
// Sobe no boot do servidor (instrumentation.node.ts) e vive enquanto o
// processo viver.
//
// O estado NAO fica em `let` de modulo: o Next compila este arquivo em mais de
// um bundle, e cada um teria o seu proprio conjunto de variaveis. Ver
// runtime-state.ts para a explicacao completa. Alem do globalThis, o estado
// observavel e publicado no Postgres, para o painel de Gestao enxergar a
// conexao mesmo quando servido por outro processo.

import makeWASocket, {
  Browsers,
  DisconnectReason,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { prisma } from "@/lib/prisma";
import { useDatabaseAuthState, clearWhatsappSession } from "./auth-store";
import { acquireLease, startHeartbeat } from "./lease";
import { nextBackoffDelay, LEASE_RETRY_MS } from "./pure";
import { superviseLeadership } from "./supervisor";
import { getRuntime, type WhatsappState } from "./runtime-state";

export type { WhatsappState } from "./runtime-state";

const LOCK_ID = "singleton";

/**
 * Logger silencioso, passado explicitamente.
 *
 * O logger padrao do Baileys e verboso e imprime JIDs — silencia-lo faz parte
 * do requisito de nao expor numeros em log.
 */
const logger = pino({ level: "silent" });

/**
 * Grava o estado observavel na linha da concessao. Best-effort: uma falha aqui
 * nao pode derrubar a conexao, no maximo deixa o painel desatualizado ate a
 * proxima transicao.
 */
function publicarEstado(): void {
  const rt = getRuntime();
  void prisma.whatsappLock
    .updateMany({
      where: { id: LOCK_ID, instanceId: rt.instanceId },
      data: { state: rt.state, qr: rt.qr, connectedNumber: rt.connectedNumber },
    })
    .catch((err) => console.error("[whatsapp] falha ao publicar estado:", err));
}

/**
 * Registra ONDE o boot chegou, numa linha que qualquer processo consegue
 * gravar (upsert, sem filtro de lideranca).
 *
 * Existe porque "Desconectado" no painel era ambiguo: significava tanto "a
 * conexao nunca iniciou" quanto "iniciou e falhou", que exigem correcoes
 * diferentes. Nunca lanca — diagnostico nao pode derrubar a conexao.
 */
export async function registrarEtapa(stage: string, erro?: unknown): Promise<void> {
  const rt = getRuntime();
  const lastError =
    erro === undefined ? undefined : erro instanceof Error ? erro.message : String(erro);
  try {
    await prisma.whatsappConfig.upsert({
      where: { id: "singleton" },
      update: {
        stage,
        holderInstanceId: rt.instanceId,
        ...(lastError === undefined ? {} : { lastError }),
        ...(stage === "boot" ? { bootAt: new Date() } : {}),
      },
      create: {
        id: "singleton",
        enabled: false,
        stage,
        holderInstanceId: rt.instanceId,
        lastError: lastError ?? null,
        bootAt: new Date(),
      },
    });
  } catch (err) {
    console.error("[whatsapp] falha ao registrar etapa:", err);
  }
}

function setState(novo: WhatsappState): void {
  const rt = getRuntime();
  if (rt.state === novo) return;
  rt.state = novo;
  publicarEstado();
}

export function getSocket(): WASocket | null {
  const rt = getRuntime();
  return rt.state === "CONECTADO" ? (rt.socket as WASocket | null) : null;
}

/**
 * Leitura local do estado. O painel NAO usa isto (le do banco, para funcionar
 * a partir de qualquer processo); serve para diagnostico dentro do processo
 * que detem a conexao.
 */
export function getConnectionSnapshot(): {
  state: WhatsappState;
  qr: string | null;
  connectedNumber: string | null;
} {
  const rt = getRuntime();
  return { state: rt.state, qr: rt.qr, connectedNumber: rt.connectedNumber };
}

/**
 * Sobe a conexao. Idempotente: chamadas concorrentes ou repetidas nao abrem
 * um segundo socket.
 */
export async function startWhatsapp(): Promise<void> {
  const rt = getRuntime();
  if (rt.supervising || rt.starting || rt.socket) return;
  rt.supervising = true;
  rt.starting = true;

  // Loga a espera uma vez a cada bloco de tentativas, e nao a cada 15s, para
  // nao encher o log do container quando outro processo detem a conexao.
  let jaAvisou = false;

  await registrarEtapa("boot");

  try {
    await superviseLeadership({
      tryAcquire: () => acquireLease(rt.instanceId),
      onLeader: async () => {
        await registrarEtapa("concessao-obtida");
        rt.stopHeartbeat ??= startHeartbeat(rt.instanceId);
        try {
          await connect();
        } catch (err) {
          await registrarEtapa("falha-ao-conectar", err);
          throw err;
        }
      },
      onWaiting: () => {
        setState("SEM_LIDERANCA");
        void registrarEtapa("sem-lideranca");
        if (!jaAvisou) {
          jaAvisou = true;
          console.log(
            `[whatsapp] concessao ocupada por outro processo; tentando de novo a cada ${LEASE_RETRY_MS}ms.`,
          );
        }
      },
      setTimer: (fn, ms) => {
        const t = setTimeout(fn, ms);
        (t as unknown as { unref?: () => void }).unref?.();
      },
      retryMs: LEASE_RETRY_MS,
    });
  } finally {
    rt.starting = false;
  }
}

async function connect(): Promise<void> {
  const rt = getRuntime();
  const { state: authState, saveCreds } = await useDatabaseAuthState();
  setState(authState.creds.registered ? "CONECTANDO" : "AGUARDANDO_QR");

  const sock = makeWASocket({
    auth: authState,
    logger,
    // O QR vai para a tela de Gestao, nunca para o log do container.
    printQRInTerminal: false,
    browser: Browsers.appropriate("Build.Flow"),
    // Nao marcar online: se marcasse, o WhatsApp passaria a entregar as
    // notificacoes a este cliente em vez de ao celular do dono do numero.
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  rt.socket = sock;
  void registrarEtapa("socket-criado");

  sock.ev.on("creds.update", () => {
    void saveCreds().catch((err) =>
      console.error("[whatsapp] falha ao gravar credenciais:", err),
    );
  });

  sock.ev.on("connection.update", (update) => {
    if (update.qr) {
      rt.qr = update.qr;
      rt.state = "AGUARDANDO_QR";
      // Publica sempre: o QR muda a cada poucos segundos e o painel depende
      // dessa gravacao para exibir o codigo corrente.
      publicarEstado();
      void registrarEtapa("qr-recebido");
    }

    if (update.connection === "open") {
      rt.qr = null;
      rt.attempt = 0;
      // Guarda so a parte numerica do JID proprio, para exibir na tela.
      rt.connectedNumber = sock.user?.id?.split(":")[0]?.split("@")[0] ?? null;
      rt.state = "CONECTADO";
      publicarEstado();
      void registrarEtapa("conectado");
      console.log("[whatsapp] conectado.");
      return;
    }

    if (update.connection === "close") {
      void handleClose(update.lastDisconnect);
    }
  });
}

async function handleClose(lastDisconnect: unknown): Promise<void> {
  const rt = getRuntime();
  rt.socket = null;
  const code = extractStatusCode(lastDisconnect);

  // 515 (restartRequired) NAO e erro: acontece logo apos parear o QR, e o
  // Baileys exige reabrir o socket. Reconecta na hora, sem backoff.
  if (code === DisconnectReason.restartRequired) {
    console.log("[whatsapp] reinicio solicitado apos pareamento; reconectando.");
    rt.attempt = 0;
    await connect().catch((err) => console.error("[whatsapp] falha ao reconectar:", err));
    return;
  }

  // Credencial morta: reconectar nao resolve, precisa de QR novo.
  if (code === DisconnectReason.loggedOut) {
    console.log("[whatsapp] sessao encerrada no aparelho; aguardando novo QR.");
    await clearWhatsappSession().catch(() => undefined);
    rt.qr = null;
    rt.connectedNumber = null;
    rt.attempt = 0;
    setState("AGUARDANDO_QR");
    await connect().catch((err) => console.error("[whatsapp] falha ao reiniciar:", err));
    return;
  }

  // Numero bloqueado ou sessao tomada por outro cliente: parar e esperar
  // intervencao humana. Reconectar aqui so piora.
  if (code === DisconnectReason.forbidden || code === DisconnectReason.connectionReplaced) {
    console.error(`[whatsapp] conexao encerrada em definitivo (codigo ${code}).`);
    rt.connectedNumber = null;
    setState("BLOQUEADO");
    return;
  }

  const espera = nextBackoffDelay(rt.attempt);
  rt.attempt += 1;
  setState("CONECTANDO");
  console.log(`[whatsapp] queda (codigo ${code ?? "?"}); reconectando em ${espera}ms.`);
  // Com a lib "dom" no tsconfig, setTimeout pode tipar como number, que nao
  // tem unref().
  const t = setTimeout(() => {
    void connect().catch((err) => console.error("[whatsapp] falha ao reconectar:", err));
  }, espera);
  (t as unknown as { unref?: () => void }).unref?.();
}

/** Extrai o statusCode do Boom que o Baileys anexa ao lastDisconnect. */
function extractStatusCode(lastDisconnect: unknown): number | undefined {
  const erro = (lastDisconnect as { error?: unknown } | undefined)?.error;
  const output = (erro as { output?: { statusCode?: number } } | undefined)?.output;
  return output?.statusCode;
}

/**
 * Desconecta e apaga a sessao, forcando novo pareamento. Usado pela tela de
 * Gestao quando alguem quer trocar o numero.
 *
 * So tem efeito no processo que detem a conexao. Chamada de um processo que
 * nao e o dono, limpa a sessao no banco — o dono cai em loggedOut e reinicia.
 */
export async function disconnectAndReset(): Promise<void> {
  const rt = getRuntime();
  try {
    (rt.socket as WASocket | null)?.end(undefined);
  } catch {
    // Socket ja caido: nada a fazer.
  }
  rt.socket = null;
  rt.qr = null;
  rt.connectedNumber = null;
  rt.attempt = 0;
  await clearWhatsappSession();
  setState("AGUARDANDO_QR");
  await connect().catch((err) => console.error("[whatsapp] falha ao reiniciar:", err));
}
