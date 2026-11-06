import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

// TIPOGRAFIA AUTO-HOSPEDADA, alinhada ao Build.Connect (Outfit + JetBrains
// Mono). Os dois .woff2 sao os MESMOS arquivos do Connect, copiados byte a
// byte — mesma fonte dos dois lados nao e coincidencia a manter na mao.
//
// `next/font/local`, e nao `next/font/google` nem o `@import` que havia em
// globals.css: o import em runtime entrega o IP e o User-Agent de cada pessoa
// a um terceiro e custa idas e voltas em serie antes de o texto pintar. E a
// mesma razao ja documentada na LP do atacado, que ja servia as fontes dela
// de /public.
//
// PARA ATUALIZAR: baixe o .woff2 latin novo em fonts.googleapis.com/css2 e
// troque o arquivo — o nome e a faixa de peso ficam.
import localFont from "next/font/local";

const outfit = localFont({
  src: "./fonts/outfit-latin-variable.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-outfit",
  display: "swap",
});

// Faixa 400-500 de proposito, e nao a do arquivo: e a faixa que o Connect usa,
// e abrir aqui faria `font-mono font-bold` desenhar diferente nas duas telas.
const jetbrains = localFont({
  src: "./fonts/jetbrains-mono-latin-variable.woff2",
  weight: "400 500",
  style: "normal",
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Build.Flow",
  description: "Logística e controle de vendas",
  applicationName: "Build.Flow",
  // Icone da ABA do navegador (favicon) e do APP instalado: a marca em F.
  // Sem versao SVG — a logo e um desenho com degrade, nao um vetor simples.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
    shortcut: ["/favicon.ico"],
  },
  // Manifest: faz o app instalado (atalho na area de trabalho / celular)
  // usar o icone e as cores da marca.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Build.Flow",
    statusBarStyle: "black-translucent",
  },
  // Equivalente moderno de "apple-mobile-web-app-capable" (que o Next emite a
  // partir de appleWebApp.capable). O Chrome recomenda incluir os dois; sem
  // isto, o console mostra um aviso de depreciacao em todas as rotas.
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#29A0D9",
};

// Define o tema antes da hidratacao para evitar flash (FOUC).
const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('bf-theme') || 'dark';
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${outfit.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
