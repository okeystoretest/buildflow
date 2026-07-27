/**
 * Inicializacao exclusiva do runtime Node. Isolado de `instrumentation.ts`
 * para que o bundler edge nunca alcance este modulo.
 */
export async function bootstrapNodeRuntime(): Promise<void> {
  try {
    const { recoverStuckJobs } = await import('@/lib/queue');
    const count = await recoverStuckJobs();
    if (count > 0) {
      console.log(`[boot] ${count} video(s) reenfileirado(s) para processamento.`);
    }
  } catch (e) {
    console.error('[boot] falha ao recuperar fila de transcode:', e);
  }
}
