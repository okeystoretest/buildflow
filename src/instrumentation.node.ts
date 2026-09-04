/**
 * Inicializacao exclusiva do runtime Node. Isolado de `instrumentation.ts`
 * para que o bundler edge nunca alcance este modulo.
 */
export async function bootstrapNodeRuntime(): Promise<void> {
  // Durante `next build` o Next carrega este modulo ao coletar as paginas.
  // Abrir a conexao ali gastaria uma tentativa de pareamento a cada build.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startWhatsapp } = await import('@/lib/whatsapp/connection');
  // Fire-and-forget: um WhatsApp fora do ar nunca pode impedir o servidor
  // de subir e atender pedidos.
  void startWhatsapp().catch((err) =>
    console.error('[boot] falha ao iniciar o WhatsApp:', err),
  );
}
