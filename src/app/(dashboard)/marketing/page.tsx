import { redirect } from "next/navigation";

/**
 * `/marketing` sozinho nao e tela de nada: o modulo tem `href: null` no
 * `nav.ts`, logo nenhum link do sistema leva aqui. Sem este arquivo a URL dava
 * 404 — e e URL que gente digita, porque e o prefixo que aparece na barra de
 * endereco ao usar a ferramenta.
 *
 * Destino fixo, e nao lido do `nav.ts`: o modulo tem UMA ferramenta. No dia em
 * que tiver duas, isto vira uma escolha de verdade e o `nav.ts` entra aqui.
 *
 * SEM PORTA DE ACESSO PROPRIA de proposito: quem decide e o
 * `requireRole(["GESTAO"])` do destino. Repetir a checagem aqui criaria um
 * segundo lugar para ela divergir.
 */
export default function MarketingPage() {
  redirect("/marketing/relatorio-semanal");
}
