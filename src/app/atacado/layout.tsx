import type { Metadata, Viewport } from "next";
import "./atacado.css";

// O que pertence ao MUNDO mora aqui, não na página da marca: uma página nova
// deste mundo não consegue esquecer de se manter fora do Google, de trocar a cor
// da barra do celular nem de parar de se apresentar como o sistema interno. A
// página da marca declara título, descrição e open graph, e o `metadata` dela se
// funde com este.
//
// noindex na Fase 1 (decisão 28): o funil é por indicação, e tráfego orgânico
// só produziria leads sem dono.
//
// O resto deste objeto existe porque o layout raiz é compartilhado e declara a
// identidade do Build.Flow: sem sobrescrever aqui, o link que a vendedora cola
// no WhatsApp — o único canal por onde este funil circula — mostrava à lojista o
// nome, o ícone e a descrição do sistema interno no lugar da marca.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  applicationName: "Atacado",
  appleWebApp: {
    title: "Atacado",
    statusBarStyle: "default",
  },
  // A LP não é o app instalável do dashboard: sem isto, salvar na tela inicial
  // instalaria o Build.Flow a partir da página pública da marca.
  manifest: null,
  icons: { icon: [], apple: [] },
};

// themeColor próprio sobrescreve o azul do Build.Flow declarado no root layout
// (decisão 30). No Next 14 ele pertence ao `viewport`, não ao `metadata`.
//
// O valor é o OSSO do mundo (#fbf9f6), porque a barra do navegador tem de casar
// com a cor do topo da página — e o topo desta página é o cabeçalho claro. É o
// mesmo valor com que atacado.css repinta o <body>, pela mesma razão. Um só
// valor, sem variante por esquema de cor, porque esta página tem um esquema só
// (color-scheme: light em atacado.css).
//
// `width`/`initialScale` repetem o root porque sobrescrever o `viewport` de um
// layout aninhado substitui o objeto, não mescla campo por campo.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fbf9f6",
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
 * PRÓXIMO que a declara. Este wrapper redeclara os tokens shadcn — todos eles,
 * com os MESMOS nomes do dashboard e valores da marca (atacado.css) —, então
 * para ele e tudo dentro dele valem as declarações dele, não as herdadas de
 * `html.dark`. Especificidade e ordem das folhas não entram na conta: elas só
 * arbitram regras no MESMO elemento, e aqui as declarações estão em elementos
 * diferentes — o filho sempre vence o ancestral. É por isso que globals.css não
 * precisa mudar, e que alternar o tema do dashboard não atinge a LP.
 *
 * O que NÃO é token e por isso é aplicado por CSS: a família tipográfica. O
 * utilitário font-sans do Tailwind escreve "IBM Plex Sans" literal (não lê a
 * variável) e tailwind.config.ts não muda (decisão 30), então atacado.css
 * aplica `font-family` no próprio wrapper e a marcação desta página nunca usa
 * font-sans/font-serif.
 *
 * TIPOGRAFIA AUTO-HOSPEDADA: as duas famílias da marca (Playfair Display e
 * Manrope, 63 KB somadas, eixo de peso 400–700) são servidas de
 * /public/fonts/atacado por @font-face no topo de atacado.css. Não vêm do CDN
 * do Google de propósito: a auditoria de 15/10 mostrou que o import em runtime
 * entrega o IP e o User-Agent de cada lojista a um terceiro — transferência
 * internacional que nenhum aviso desta página menciona — e custa três idas e
 * voltas em série antes de o nome da marca pintar, na conexão móvel que ela
 * está usando. Por isso também não há `preconnect` aqui: não há para onde.
 */
export default function AtacadoLayout({ children }: { children: React.ReactNode }) {
  return <div data-world="atacado">{children}</div>;
}
