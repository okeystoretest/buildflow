import "./atacado.css";

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
 * os demais tokens (ver atacado.css), então para ele e tudo dentro dele valem
 * as declarações dele, não as herdadas de `html.dark`. Especificidade e ordem
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
