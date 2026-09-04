// Estado VIVO da conexao com o WhatsApp, guardado no globalThis.
//
// POR QUE NAO EM `let` DE MODULO: o Next compila este codigo em mais de um
// bundle — a instrumentacao carrega uma copia (chunks/*.js) e a Server Action
// do painel carrega outra. Cada bundle tem seu proprio registro de modulos,
// entao um `let` de modulo vira N conjuntos independentes de variaveis: o boot
// conecta num deles e o painel le outro, que nunca saiu de "DESCONECTADO".
// Foi exatamente essa a causa do "QR nao aparece".
//
// O mesmo problema esta documentado em src/lib/realtime/bus.ts, que resolveu
// persistindo no Postgres. Aqui o Postgres nao serve para TUDO: o socket e um
// objeto vivo e nao pode ser serializado. Entao a divisao e:
//
//   - socket, timers e contadores  -> globalThis (mesmo padrao de prisma.ts)
//   - estado observavel (state/qr) -> tambem espelhado no Postgres, para o
//     painel funcionar mesmo servido por outra replica (ver connection.ts)
//
// Symbol.for usa o registro global de simbolos: a mesma chave resolve para o
// mesmo simbolo em qualquer bundle do processo.

/** Estados possiveis da conexao. */
export type WhatsappState =
  | "DESCONECTADO"
  | "AGUARDANDO_QR"
  | "CONECTANDO"
  | "CONECTADO"
  | "SEM_LIDERANCA"
  | "BLOQUEADO";

export interface WhatsappRuntime {
  /** WASocket corrente. `unknown` para este modulo nao importar Baileys. */
  socket: unknown | null;
  state: WhatsappState;
  qr: string | null;
  connectedNumber: string | null;
  attempt: number;
  starting: boolean;
  /**
   * Ja existe um supervisor de lideranca rodando neste processo?
   *
   * Uma vez ligado, nunca desliga: o supervisor insiste indefinidamente, e um
   * segundo supervisor poderia abrir um SEGUNDO socket com a mesma credencial
   * — exatamente o que a concessao existe para impedir.
   */
  supervising: boolean;
  stopHeartbeat: (() => void) | null;
  /** Id desta instancia, usado pela concessao. Criado uma unica vez. */
  instanceId: string;
}

const CHAVE = Symbol.for("buildflow.whatsapp.runtime");

type Portador = { [CHAVE]?: WhatsappRuntime };

/**
 * Devolve o runtime compartilhado, criando-o na primeira chamada. Todas as
 * copias do modulo, em qualquer bundle do processo, recebem o MESMO objeto.
 */
export function getRuntime(): WhatsappRuntime {
  const portador = globalThis as unknown as Portador;
  portador[CHAVE] ??= {
    socket: null,
    state: "DESCONECTADO",
    qr: null,
    connectedNumber: null,
    attempt: 0,
    starting: false,
    supervising: false,
    stopHeartbeat: null,
    instanceId: `${process.pid}-${Math.random().toString(36).slice(2, 10)}`,
  };
  return portador[CHAVE];
}
