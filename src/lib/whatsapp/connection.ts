// Conexao unica com o WhatsApp via Baileys.
//
// Sobe no boot do servidor (instrumentation.node.ts) e vive enquanto o
// processo viver. Guarda o QR corrente em memoria para a tela de Gestao ler —
// o QR NUNCA vai para o log.

import makeWASocket, {
  Browsers,
  DisconnectReason,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { useDatabaseAuthState, clearWhatsappSession } from "./auth-store";
import { acquireLease, startHeartbeat } from "./lease";
import { nextBackoffDelay } from "./pure";

export type WhatsappState =
  | "DESCONECTADO"
  | "AGUARDANDO_QR"
  | "CONECTANDO"
  | "CONECTADO"
  | "SEM_LIDERANCA"
  | "BLOQUEADO";

// Instancia deste processo. Aleatoria e so em memoria: se o processo morre, a
// concessao expira sozinha pelo heartbeat.
const INSTANCE_ID = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

let socket: WASocket | null = null;
let state: WhatsappState = "DESCONECTADO";
let qr: string | null = null;
let connectedNumber: string | null = null;
let attempt = 0;
let starting = false;
let stopHeartbeat: (() => void) | null = null;

/**
 * Logger silencioso, passado explicitamente.
 *
 * O logger padrao do Baileys e verboso e imprime JIDs — silencia-lo faz parte
 * do requisito de nao expor numeros em log.
 */
const logger = pino({ level: "silent" });

export function getConnectionSnapshot(): {
  state: WhatsappState;
  qr: string | null;
  connectedNumber: string | null;
} {
  return { state, qr, connectedNumber };
}

export function getSocket(): WASocket | null {
  return state === "CONECTADO" ? socket : null;
}

/**
 * Sobe a conexao. Idempotente: chamadas concorrentes ou repetidas nao abrem
 * um segundo socket.
 */
export async function startWhatsapp(): Promise<void> {
  if (starting || socket) return;
  starting = true;
  try {
    const lider = await acquireLease(INSTANCE_ID);
    if (!lider) {
      state = "SEM_LIDERANCA";
      // Uma linha so: outro processo ja conectou, e isso e o esperado.
      console.log("[whatsapp] outro processo detem a conexao; este nao vai conectar.");
      return;
    }
    stopHeartbeat ??= startHeartbeat(INSTANCE_ID);
    await connect();
  } finally {
    starting = false;
  }
}

async function connect(): Promise<void> {
  const { state: authState, saveCreds } = await useDatabaseAuthState();
  state = authState.creds.registered ? "CONECTANDO" : "AGUARDANDO_QR";

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
  socket = sock;

  sock.ev.on("creds.update", () => {
    void saveCreds().catch((err) =>
      console.error("[whatsapp] falha ao gravar credenciais:", err),
    );
  });

  sock.ev.on("connection.update", (update) => {
    if (update.qr) {
      qr = update.qr;
      state = "AGUARDANDO_QR";
    }

    if (update.connection === "open") {
      qr = null;
      attempt = 0;
      state = "CONECTADO";
      // Guarda so a parte numerica do JID proprio, para exibir na tela.
      connectedNumber = sock.user?.id?.split(":")[0]?.split("@")[0] ?? null;
      console.log("[whatsapp] conectado.");
      return;
    }

    if (update.connection === "close") {
      void handleClose(update.lastDisconnect);
    }
  });
}

async function handleClose(lastDisconnect: unknown): Promise<void> {
  socket = null;
  const code = extractStatusCode(lastDisconnect);

  // 515 (restartRequired) NAO e erro: acontece logo apos parear o QR, e o
  // Baileys exige reabrir o socket. Reconecta na hora, sem backoff.
  if (code === DisconnectReason.restartRequired) {
    console.log("[whatsapp] reinicio solicitado apos pareamento; reconectando.");
    attempt = 0;
    await connect().catch((err) => console.error("[whatsapp] falha ao reconectar:", err));
    return;
  }

  // Credencial morta: reconectar nao resolve, precisa de QR novo.
  if (code === DisconnectReason.loggedOut) {
    console.log("[whatsapp] sessao encerrada no aparelho; aguardando novo QR.");
    await clearWhatsappSession().catch(() => undefined);
    qr = null;
    connectedNumber = null;
    state = "AGUARDANDO_QR";
    attempt = 0;
    await connect().catch((err) => console.error("[whatsapp] falha ao reiniciar:", err));
    return;
  }

  // Numero bloqueado ou sessao tomada por outro cliente: parar e esperar
  // intervencao humana. Reconectar aqui so piora.
  if (code === DisconnectReason.forbidden || code === DisconnectReason.connectionReplaced) {
    console.error(`[whatsapp] conexao encerrada em definitivo (codigo ${code}).`);
    state = "BLOQUEADO";
    connectedNumber = null;
    return;
  }

  const espera = nextBackoffDelay(attempt);
  attempt += 1;
  state = "CONECTANDO";
  console.log(`[whatsapp] queda (codigo ${code ?? "?"}); reconectando em ${espera}ms.`);
  // Mesmo motivo do lease.ts: com a lib "dom" no tsconfig, setTimeout pode
  // tipar como number, que nao tem unref().
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
 */
export async function disconnectAndReset(): Promise<void> {
  try {
    socket?.end(undefined);
  } catch {
    // Socket ja caido: nada a fazer.
  }
  socket = null;
  qr = null;
  connectedNumber = null;
  attempt = 0;
  await clearWhatsappSession();
  state = "AGUARDANDO_QR";
  await connect().catch((err) => console.error("[whatsapp] falha ao reiniciar:", err));
}
