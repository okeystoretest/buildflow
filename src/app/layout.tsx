import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "Build.Flow",
  description: "Logística e controle de vendas",
  applicationName: "Build.Flow",
  // Icone da ABA do navegador (favicon) e do APP instalado.
  // E o mesmo simbolo exibido ao lado do nome no cabecalho (PackageCheck).
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
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
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
