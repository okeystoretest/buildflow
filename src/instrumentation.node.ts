/**
 * Inicializacao exclusiva do runtime Node. Isolado de `instrumentation.ts`
 * para que o bundler edge nunca alcance este modulo.
 *
 * NOTA: a recuperacao da fila de transcode (@/lib/queue) esta desativada ate
 * o modulo ser implementado. Para reativar, reintroduza:
 *
 *   const { recoverStuckJobs } = await import('@/lib/queue');
 *   const count = await recoverStuckJobs();
 *   if (count > 0) console.log(`[boot] ${count} video(s) reenfileirado(s).`);
 */
export async function bootstrapNodeRuntime(): Promise<void> {
  // Sem tarefas de boot no momento.
}
