/**
 * Executado uma vez no boot do servidor Next.js.
 * Reenfileira transcodes que ficaram presos apos um restart do PM2.
 *
 * IMPORTANTE: este arquivo e compilado para todos os runtimes, inclusive edge.
 * O import de `./instrumentation.node` fica dentro do guard de runtime porque
 * um import estatico no topo seria resolvido pelo webpack em tempo de build,
 * arrastando sharp/ffmpeg/fs para o bundle edge — que nao tem essas APIs.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { bootstrapNodeRuntime } = await import('./instrumentation.node');
  await bootstrapNodeRuntime();
}
