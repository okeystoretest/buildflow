/**
 * Checagem das CAMADAS dos modais.
 *
 * O defeito que isto existe para impedir (relatado em 12/11/2026, no Histórico
 * de Entregas): a ficha do pedido abre em `z-[100]`, e o modal que o rodapé
 * dela abre — "Editar Entrega" — estava em `z-50`. O sintoma não parece um
 * erro de camada: o fundo escurece (o véu do segundo modal aparece), a ficha
 * continua por cima, e o painel de edição não está em lugar nenhum. "Fazer
 * devolução", no botão ao lado, estava em `z-[60]` e tinha o mesmo defeito
 * sem nunca ter sido reportado.
 *
 * Nenhum tipo pega isso: são duas strings em arquivos diferentes, e ninguém
 * compara um `z-50` daqui com um `z-[100]` três pastas adiante. Por isso a
 * checagem lê os arquivos como texto, que é o mesmo recurso que a checagem dos
 * rótulos do formulário de atacado usa, pelo mesmo motivo.
 *
 * Rode com: npx tsx scripts/checks/modal-camadas.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

let falhas = 0;
function check(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHOU ${nome}\n  esperado=${JSON.stringify(esperado)}\n  obtido  =${JSON.stringify(obtido)}`);
  } else {
    console.log(`ok ${nome}`);
  }
}

const DIR = path.resolve(__dirname, "../../src/components/shared");
const modal = readFileSync(path.join(DIR, "modal.tsx"), "utf8");

/** O número dentro de `z-[NNN]`, como a constante o declara. */
function camada(nome: string): number | null {
  const m = new RegExp(`export const ${nome} = "z-\\[(\\d+)\\]"`).exec(modal);
  return m ? Number(m[1]) : null;
}

const base = camada("CAMADA_MODAL");
const sobre = camada("CAMADA_SOBRE_MODAL");

check("CAMADA_MODAL existe e e um z-[n]", typeof base === "number", true);
check("CAMADA_SOBRE_MODAL existe e e um z-[n]", typeof sobre === "number", true);

// A INVARIANTE INTEIRA, numa linha. Trocar os dois valores de lugar devolve o
// defeito de 12/11 para todos os modais de uma vez.
check("o modal sobre modal fica ACIMA do modal", (sobre ?? 0) > (base ?? 0), true);

// Nenhum modal compartilhado pode cravar a camada no próprio arquivo: é assim
// que um deles fica para trás quando a escala muda.
const arquivos = readdirSync(DIR).filter((f) => f.endsWith("modal.tsx"));
check("ha modais compartilhados para conferir", arquivos.length > 1, true);

for (const arquivo of arquivos) {
  const texto = readFileSync(path.join(DIR, arquivo), "utf8");
  // Modal que usa a moldura compartilhada NAO tem veu proprio — e esse e o
  // jeito CERTO: a camada dele e a do `Modal`. So quem desenha o proprio veu
  // precisa escolher uma camada, e e so esse que esta checagem cobra.
  if (texto.includes("shared/modal") && texto.includes("<Modal")) {
    check(`${arquivo}: usa a moldura compartilhada`, true, true);
    continue;
  }
  // Só as linhas do véu — é nelas que a camada vive. O conteúdo interno pode
  // ter `z-10` para empilhar coisa dentro do próprio modal, e isso não é
  // assunto desta checagem.
  const veus = texto.split("\n").filter((l) => l.includes("fixed inset-0"));
  check(`${arquivo}: desenha o proprio veu`, veus.length > 0, true);
  for (const linha of veus) {
    check(
      `${arquivo}: o veu nao crava a camada`,
      /\bz-(\[|\d)/.test(linha),
      false,
    );
  }
}

if (falhas > 0) {
  console.log(`\n${falhas} checagem(ns) falharam.`);
  process.exit(1);
}
console.log("modal-camadas: todas as checagens passaram.");
