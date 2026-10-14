import type { Metadata, Viewport } from "next";
import "./atacado.css";

// O que pertence ao MUNDO mora aqui, não na página da marca: uma página nova
// deste mundo não consegue esquecer de se manter fora do Google nem de trocar a
// cor da barra do celular. A página da marca declara só o `title`, e o
// `metadata` dela se funde com este.
//
// noindex na Fase 1 (decisão 28): o funil é por indicação, e tráfego orgânico
// só produziria leads sem dono.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// themeColor próprio sobrescreve o azul do Build.Flow declarado no root layout
// (decisão 30). No Next 14 ele pertence ao `viewport`, não ao `metadata`.
export const viewport: Viewport = {
  themeColor: "#ffffff",
};

/**
 * Layout das LPs públicas de atacado.
 *
 * O root layout é compartilhado e não dá para substituí-lo: ele define <html> e
 * <body>, importa globals.css, declara themeColor azul e roda um script que
 * adiciona `.dark` ao <html> ANTES da hidratação (padrão: escuro). Esta página
 * já nasce, portanto, dentro do mundo escuro do dashboard. O isolamento é por
 * escopo, não por substituição (decisão 30).
 *
 * Por que funciona: uma custom property CSS resolve a partir do ancestral MAIS
 * PRÓXIMO que a declara. Este wrapper redeclara --background, --foreground e
 * os tokens que a página de prova usa (8 deles; a lista está em atacado.css),
 * então para ele e tudo dentro dele valem as declarações dele, não as herdadas
 * de `html.dark`. ATENÇÃO: isso NÃO é o conjunto completo. Os outros 12 tokens
 * seguem herdando o valor escuro do dashboard; a tarefa que construir o mundo
 * visual de verdade precisa redeclará-los todos antes de qualquer conteúdo
 * real entrar (lista e demais pendências em atacado.css). Especificidade e ordem
 * das folhas de estilo não entram na conta: elas só arbitram regras no MESMO
 * elemento, e aqui as declarações estão em elementos diferentes — o filho
 * sempre vence o ancestral. É por isso que globals.css não precisa mudar, e
 * que alternar o tema do dashboard não atinge a LP.
 *
 * Os utilitários do Tailwind (bg-card, border-border, text-primary...) apenas
 * leem `hsl(var(--token))`; resolvem contra o token já redeclarado aqui, então
 * também não precisam de override. A classe `.dark` do <html> continua
 * intocada: ela pertence ao dashboard.
 */
export default function AtacadoLayout({ children }: { children: React.ReactNode }) {
  return <div data-world="atacado">{children}</div>;
}
