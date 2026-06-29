import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "Build.Flow",
  description: "Logística e controle de vendas",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
