// Supervisao da lideranca da conexao do WhatsApp.
//
// POR QUE ISTO EXISTE: a primeira versao tentava obter a concessao UMA vez, no
// boot, e desistia para sempre se ela estivesse ocupada. Como o EasyPanel
// recria o container em segundos e a concessao vale por 90s, todo redeploy
// caia nesse caso — o processo novo via a concessao do container antigo (que ja
// tinha morrido, mas cujo heartbeat ainda estava dentro do TTL), desistia, e o
// painel ficava em "Desconectado" indefinidamente.
//
// As dependencias sao injetadas para esta logica poder ser verificada sem banco
// e sem relogio (ver scripts/checks/whatsapp-supervisor.ts).

export interface SupervisorDeps {
  /** Tenta assumir a concessao. */
  tryAcquire: () => Promise<boolean>;
  /** Chamado uma unica vez, quando a concessao e obtida. */
  onLeader: () => Promise<void>;
  /** Chamado a cada tentativa frustrada. */
  onWaiting: () => void;
  /** Agenda a proxima tentativa. Injetavel para o teste nao depender de tempo. */
  setTimer: (fn: () => void, ms: number) => void;
  retryMs: number;
}

/**
 * Tenta assumir a lideranca e, se nao conseguir, INSISTE indefinidamente.
 *
 * Insistir para sempre e proposital: um processo que nao e lider agora pode
 * passar a ser a qualquer momento (o lider caiu, o container dele foi
 * recriado). A alternativa — desistir — foi justamente o defeito.
 */
export async function superviseLeadership(deps: SupervisorDeps): Promise<void> {
  const obteve = await deps.tryAcquire();
  if (obteve) {
    await deps.onLeader();
    return;
  }
  deps.onWaiting();
  deps.setTimer(() => {
    void superviseLeadership(deps);
  }, deps.retryMs);
}
