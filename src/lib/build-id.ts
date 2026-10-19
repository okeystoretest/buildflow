import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * IDENTIFICA O BUILD QUE ESTÁ NO AR.
 *
 * Serve para o cliente descobrir que foi publicada uma versão nova enquanto ele
 * estava com a tela aberta. É o que resolve, do lado de quem usa, o
 * "Failed to find Server Action": os ids das Server Actions são regerados a
 * cada build e ficam embutidos no HTML que o navegador baixou, então toda aba
 * aberta desde antes do deploy passa a mandar um id que o servidor não conhece
 * — e a ação falha em silêncio, o botão não faz nada.
 *
 * LÊ O `BUILD_ID` DO PRÓPRIO NEXT, e não um número de processo: só o build id
 * muda exatamente quando os ids das actions mudam. Um identificador por
 * processo pediria reload a cada reinício do contêiner, inclusive quando o
 * código é o mesmo e nada quebrou.
 *
 * Lido UMA vez, na carga do módulo: o arquivo não muda enquanto o processo
 * vive, e ler a cada poll seria um acesso a disco a cada 4 segundos por
 * usuário conectado.
 *
 * `output: 'standalone'` coloca o arquivo em `.next/BUILD_ID` ao lado do
 * servidor. Em `next dev` ele não existe — daí o valor aleatório: em
 * desenvolvimento cada reinício é uma versão nova mesmo, e o aviso aparecendo
 * ali é verdade.
 */
export const BUILD_ID: string = (() => {
  try {
    return readFileSync(join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim() || randomUUID();
  } catch {
    return randomUUID();
  }
})();
