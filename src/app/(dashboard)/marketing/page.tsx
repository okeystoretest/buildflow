import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { navParaSessao } from "../nav";

/**
 * `/marketing` sozinho nao e tela de nada: o modulo tem `href: null` no
 * `nav.ts`, logo nenhum link do sistema leva aqui. Sem este arquivo a URL dava
 * 404 — e e URL que gente digita, porque e o prefixo que aparece na barra de
 * endereco ao usar a ferramenta.
 *
 * MANDA PARA A PRIMEIRA FERRAMENTA QUE ESTA PESSOA VE, lida do `nav.ts`, e nao
 * para um destino fixo. O modulo tem duas ferramentas com portas DIFERENTES
 * (Relatorio Semanal e so da GESTAO; o Cronograma e de GESTAO e VENDAS), e um
 * destino fixo mandaria VENDAS para a tela que o `requireRole` de la recusa —
 * um clique que termina na raiz do sistema sem dizer por que.
 */
export default async function MarketingPage() {
  const sessao = await requireRole(["GESTAO", "VENDAS"]);
  const modulo = navParaSessao(sessao.role).find((m) => m.base === "/marketing");
  // Sem ferramenta nenhuma nao deveria acontecer (o papel que ve o modulo ve ao
  // menos uma), mas aqui `redirect(undefined)` seria uma tela branca.
  redirect(modulo?.tools[0]?.href ?? "/");
}
