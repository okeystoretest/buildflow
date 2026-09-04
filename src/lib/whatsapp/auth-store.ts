// Estado de autenticacao do Baileys sobre o Postgres.
//
// Substitui o useMultiFileAuthState (que grava arquivos): todo deploy do
// EasyPanel recria o container, entao a sessao em disco exigiria escanear o QR
// de novo a cada implantacao.

import { BufferJSON, initAuthCreds, proto } from "@whiskeysockets/baileys";
import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import { prisma } from "@/lib/prisma";

/** Linha que guarda as credenciais principais. */
const CREDS_ID = "creds";

/**
 * Serializa com o BufferJSON do Baileys.
 *
 * OBRIGATORIO: o estado contem Buffer e Uint8Array, que JSON.stringify puro
 * converte em objeto comum. O erro nao aparece na gravacao — a sessao so falha
 * depois, na hora de enviar, com mensagem que nao aponta para a causa.
 */
export function serializeAuthValue(value: unknown): string {
  return JSON.stringify(value, BufferJSON.replacer);
}

/** Contraparte de serializeAuthValue. */
export function deserializeAuthValue<T>(raw: string): T {
  return JSON.parse(raw, BufferJSON.reviver) as T;
}

async function readRow<T>(id: string): Promise<T | null> {
  const row = await prisma.whatsappSession.findUnique({ where: { id } });
  if (!row) return null;
  try {
    return deserializeAuthValue<T>(row.data);
  } catch {
    // Linha corrompida: tratada como ausente. O Baileys regenera a chave, e
    // se forem as creds o fluxo cai em "aguardando QR".
    return null;
  }
}

async function writeRow(id: string, value: unknown): Promise<void> {
  const data = serializeAuthValue(value);
  await prisma.whatsappSession.upsert({
    where: { id },
    update: { data },
    create: { id, data },
  });
}

async function deleteRows(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.whatsappSession.deleteMany({ where: { id: { in: ids } } });
}

/**
 * Monta o AuthenticationState lendo e gravando na tabela WhatsappSession.
 * Espelha o useMultiFileAuthState oficial, trocando arquivo por linha.
 */
export async function useDatabaseAuthState(): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const creds: AuthenticationCreds =
    (await readRow<AuthenticationCreds>(CREDS_ID)) ?? initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const rowIds = ids.map((id) => `${type}:${id}`);
          const rows = await prisma.whatsappSession.findMany({
            where: { id: { in: rowIds } },
          });
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          for (const row of rows) {
            // O prefixo e "<type>:", entao o id comeca depois dele.
            const id = row.id.slice(type.length + 1);
            let value = deserializeAuthValue<SignalDataTypeMap[T]>(row.data);
            // O app-state-sync-key precisa voltar como mensagem do protobuf, e
            // nao como objeto solto — igual ao store oficial do Baileys.
            // O cast passa por unknown porque o `if` estreita `type` apenas em
            // tempo de execucao: para o compilador, T continua sendo qualquer
            // chave do mapa, e AppStateSyncKeyData nao se sobrepoe as demais.
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(
                value as object,
              ) as unknown as SignalDataTypeMap[T];
            }
            data[id] = value;
          }
          return data;
        },
        set: async (data) => {
          const gravar: Promise<void>[] = [];
          const remover: string[] = [];
          for (const category in data) {
            const bucket = data[category as keyof typeof data];
            if (!bucket) continue;
            for (const id in bucket) {
              const value = bucket[id];
              const rowId = `${category}:${id}`;
              // valor null significa "remover esta chave".
              if (value) gravar.push(writeRow(rowId, value));
              else remover.push(rowId);
            }
          }
          await Promise.all(gravar);
          await deleteRows(remover);
        },
      },
    },
    saveCreds: () => writeRow(CREDS_ID, creds),
  };
}

/**
 * Apaga a sessao inteira. Usado no "desconectar/reparear" da tela de Gestao e
 * quando o WhatsApp responde loggedOut (credencial morta).
 */
export async function clearWhatsappSession(): Promise<void> {
  await prisma.whatsappSession.deleteMany({});
}
