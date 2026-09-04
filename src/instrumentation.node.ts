/**
 * Inicializacao exclusiva do runtime Node. Isolado de `instrumentation.ts`
 * para que o bundler edge nunca alcance este modulo.
 */
export async function bootstrapNodeRuntime(): Promise<void> {
  // Durante `next build` o Next carrega este modulo ao coletar as paginas.
  // Abrir a conexao ali gastaria uma tentativa de pareamento a cada build.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startWhatsapp, registrarEtapa } = await import('@/lib/whatsapp/connection');
  // Fire-and-forget: um WhatsApp fora do ar nunca pode impedir o servidor
  // de subir e atender pedidos.
  //
  // A falha tambem e GRAVADA, e nao so logada: sem isso o painel mostrava
  // "Desconectado" sem distinguir "nunca iniciou" de "iniciou e quebrou".
  void startWhatsapp().catch(async (err) => {
    console.error('[boot] falha ao iniciar o WhatsApp:', err);
    await registrarEtapa('falha-no-boot', err).catch(() => undefined);
  });
}
