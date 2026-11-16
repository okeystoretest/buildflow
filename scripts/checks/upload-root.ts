// Checagem da RAIZ DOS UPLOADS.
// Rodar com: npx tsx scripts/checks/upload-root.ts
//
// O que esta em jogo: perda silenciosa de arquivo. Havia um default de
// "./uploads"; um deploy sem a variavel gravava comprovante e nota fiscal
// dentro do container, fora do volume, e os arquivos morriam no redeploy
// seguinte — sem erro em tela, sem erro em log. O unico jeito de essa falha
// aparecer e ela ser ALTA, e em producao, so.
import { raizDeUploads } from "../../src/lib/image";

let falhas = 0;
function check(nome: string, fn: () => void) {
  try {
    fn();
  } catch (e) {
    falhas++;
    console.log(`FALHOU ${nome}\n  ${e instanceof Error ? e.message : String(e)}`);
  }
}
function igual(nome: string, obtido: unknown, esperado: unknown) {
  check(nome, () => {
    if (obtido !== esperado) throw new Error(`esperado=${esperado} obtido=${obtido}`);
  });
}

const dirOriginal = process.env.UPLOAD_DIR;
const envOriginal = process.env.NODE_ENV;
// NODE_ENV e somente-leitura no tipo, mas gravavel em runtime.
const setEnv = (v: string | undefined) => {
  if (v === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
  else (process.env as Record<string, string | undefined>).NODE_ENV = v;
};

// 1) Variavel definida: devolve o valor, em qualquer ambiente.
process.env.UPLOAD_DIR = "/var/www/app/uploads";
setEnv("production");
igual("definida em producao devolve o valor", raizDeUploads(), "/var/www/app/uploads");
setEnv("development");
igual("definida em dev devolve o valor", raizDeUploads(), "/var/www/app/uploads");

// 2) Ausente em DEV: cai no default, para ninguem precisar de .env para rodar.
delete process.env.UPLOAD_DIR;
setEnv("development");
igual("ausente em dev usa ./uploads", raizDeUploads(), "./uploads");

// 3) Ausente em PRODUCAO: tem de EXPLODIR. E a razao desta checagem existir.
setEnv("production");
check("ausente em producao lanca erro", () => {
  let lancou = false;
  try {
    raizDeUploads();
  } catch {
    lancou = true;
  }
  if (!lancou) throw new Error("nao lancou — o default silencioso voltou, e com ele a perda de arquivo");
});

// 4) Vazia conta como ausente (variavel declarada sem valor no painel do deploy).
process.env.UPLOAD_DIR = "";
setEnv("production");
check("vazia em producao tambem lanca", () => {
  let lancou = false;
  try {
    raizDeUploads();
  } catch {
    lancou = true;
  }
  if (!lancou) throw new Error("string vazia passou como caminho valido");
});

// Restaura o ambiente para nao contaminar o resto do portao.
if (dirOriginal === undefined) delete process.env.UPLOAD_DIR;
else process.env.UPLOAD_DIR = dirOriginal;
setEnv(envOriginal);

console.log(falhas === 0 ? "upload-root: OK" : `upload-root: ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
