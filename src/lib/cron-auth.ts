import { timingSafeEqual } from "node:crypto";

/**
 * Bearer das rotas de /api/cron, em tempo constante.
 *
 * Existe como módulo porque agora há mais de uma rotina agendada (o Select e o
 * expurgo de candidaturas) e esta checagem é a única coisa que separa um
 * endpoint público de um gatilho de escrita em massa. Duas cópias dela
 * divergem na primeira correção — e a cópia que não receber a correção é a que
 * fica aberta.
 *
 * UM segredo para todas as rotas de cron: `SELECT_CRON_SECRET`. O nome é
 * histórico (nasceu com a rotina do Select) e fica como está de propósito —
 * renomear exigiria mexer no runtime do EasyPanel, e um segundo nome exigiria
 * configurar duas variáveis para um agendador só. Se um dia uma rotina precisar
 * de autoridade própria, ela ganha o seu segredo e esta função ganha um
 * parâmetro.
 *
 * FALHA FECHADA: sem o segredo configurado, nada é autorizado. O contrário
 * transformaria um esquecimento de deploy em endpoint público.
 */
export function autorizadoPorSegredoDeCron(req: Request): boolean {
  const esperado = process.env.SELECT_CRON_SECRET;
  if (!esperado) return false;

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(esperado);
  // Comprimento diferente já não casa, e comparar buffers de tamanhos
  // diferentes faz timingSafeEqual lançar. O tamanho do segredo não é o segredo.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
