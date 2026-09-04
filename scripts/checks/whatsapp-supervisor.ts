// Reproduz o segundo defeito do "QR nao aparece": ao nao obter a concessao no
// boot, o processo desistia PARA SEMPRE. Como o EasyPanel recria o container em
// segundos e o TTL da concessao e de 90s, todo redeploy caia nesse caso — o
// processo novo via a concessao do antigo ainda viva, desistia, e nunca mais
// tentava. O painel ficava em "Desconectado" indefinidamente.
//
// Rodar com: npx tsx scripts/checks/whatsapp-supervisor.ts
import { superviseLeadership } from "../../src/lib/whatsapp/supervisor";
import { LEASE_RETRY_MS, LEASE_TTL_MS } from "../../src/lib/whatsapp/pure";

let falhas = 0;
function check(nome: string, cond: boolean) {
  if (!cond) { falhas++; console.log(`FALHOU ${nome}`); }
}

// Teto de reagendamentos drenados por cenario. O supervisor insiste para
// sempre por design, entao a drenagem precisa de limite — sem ele o proprio
// teste entra em laco infinito.
const MAX_TICKS = 10;

async function cenario(respostas: boolean[]) {
  const fila = [...respostas];
  let lider = 0;
  let esperando = 0;
  const timers: (() => void)[] = [];

  await superviseLeadership({
    tryAcquire: async () => fila.shift() ?? false,
    onLeader: async () => { lider++; },
    onWaiting: () => { esperando++; },
    // Executa o timer na hora, para o teste nao depender de tempo real.
    setTimer: (fn) => { timers.push(fn); },
    retryMs: LEASE_RETRY_MS,
  });

  // Drena os reagendamentos, como o relogio faria, com teto.
  let ticks = 0;
  while (timers.length > 0 && ticks < MAX_TICKS) {
    ticks++;
    const fn = timers.shift()!;
    fn();
    await new Promise((r) => setImmediate(r));
  }

  return { lider, esperando };
}

async function main() {
  // Lider de primeira: conecta e nao reagenda nada.
  const a = await cenario([true]);
  check("lider de primeira conecta", a.lider === 1);
  check("lider de primeira nao espera", a.esperando === 0);

  // Concessao ocupada nas duas primeiras tentativas: precisa INSISTIR e conectar.
  const b = await cenario([false, false, true]);
  check("insiste ate obter a concessao", b.lider === 1);
  check("registra as duas esperas", b.esperando === 2);

  // Nunca livre: continua tentando, sem conectar e sem estourar.
  const c = await cenario([false, false, false, false]);
  check("nunca conecta se nunca livre", c.lider === 0);
  check("segue tentando", c.esperando >= 3);

  // A retentativa precisa ser bem mais curta que o TTL, senao a espera apos um
  // redeploy fica maior que o necessario.
  check("retentativa menor que o TTL", LEASE_RETRY_MS < LEASE_TTL_MS);

  console.log(falhas === 0 ? "OK: whatsapp-supervisor" : `${falhas} falha(s) em whatsapp-supervisor`);
  process.exit(falhas === 0 ? 0 : 1);
}

void main();
