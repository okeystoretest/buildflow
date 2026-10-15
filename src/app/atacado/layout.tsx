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
//
// O valor é o ULTRAMARINO da abertura (hsl(243 54% 40%)), não branco: a barra
// de status tem de casar com a cor do TOPO da página, e o topo desta página é o
// campo inundado. É o mesmo valor com que atacado.css repinta o <body>, pela
// mesma razão. Um só valor, sem variante por esquema de cor, porque esta página
// tem um esquema só (color-scheme: light em atacado.css).
//
// `width`/`initialScale` repetem o root porque sobrescrever o `viewport` de um
// layout aninhado substitui o objeto, não mescla campo por campo.
// `viewportFit: "cover"` é o que faz a página passar por baixo do recorte da
// tela do celular — e sem ele os `env(safe-area-inset-*)` de atacado.css valem
// 0 e o respiro do notch não existe.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#342F9D",
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
 * PRÓXIMO que a declara. Este wrapper redeclara os 20 tokens shadcn — todos
 * eles, com os MESMOS nomes do dashboard e valores da marca (atacado.css) —,
 * então para ele e tudo dentro dele valem as declarações dele, não as herdadas
 * de `html.dark`. Especificidade e ordem das folhas de estilo não entram na
 * conta: elas só arbitram regras no MESMO elemento, e aqui as declarações estão
 * em elementos diferentes — o filho sempre vence o ancestral. É por isso que
 * globals.css não precisa mudar, e que alternar o tema do dashboard não atinge
 * a LP. O mesmo mecanismo é usado uma segunda vez, aninhado, em
 * `.campo-concedido`: dentro das faixas inundadas os tokens valem outros
 * valores e os utilitários acompanham sem exceção.
 *
 * O que NÃO é token e por isso é aplicado por CSS: a família tipográfica. O
 * utilitário font-sans do Tailwind escreve "IBM Plex Sans" literal (não lê a
 * variável) e tailwind.config.ts não muda (decisão 30), então atacado.css
 * aplica `font-family` no próprio wrapper e a marcação desta página nunca usa
 * font-sans/font-serif.
 *
 * Os utilitários do Tailwind (bg-card, border-border, text-primary...) apenas
 * leem `hsl(var(--token))`; resolvem contra o token já redeclarado aqui, então
 * também não precisam de override. A classe `.dark` do <html> continua
 * intocada: ela pertence ao dashboard.
 */
export default function AtacadoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-world="atacado">
      {/* A tipografia da marca entra por @import no topo de atacado.css (é onde
          um @import vale; depois de uma regra ele é descartado em silêncio), e
          isso custa três idas e voltas em série antes de o nome da marca
          pintar: a folha desta rota, o CSS do Google, e só então os arquivos de
          fonte. O preconnect abre o aperto de mão com fonts.gstatic.com em
          paralelo, em vez de esperar o CSS do Google revelar o endereço. Vale
          uma linha no celular da lojista, em dados móveis.
          `crossOrigin` vazio é obrigatório: arquivo de fonte é requisição CORS,
          e sem isso o navegador abre uma SEGUNDA conexão e o preconnect é
          desperdiçado. Nada aqui toca globals.css (decisão 30). */}
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {children}
    </div>
  );
}
