import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/app/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ["IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      colors: {
        // ---- Paleta Build.Flow: cor por setor (DEFAULT) + tom claro (soft) ----
        //
        // DEFAULT e FUNDO (botao, borda, acento), com `fg` por cima. NAO use
        // como cor de texto sobre a pagina: para isso existe `text`, que e
        // token por tema em globals.css — ver o comentario de --vendas-text.
        //
        // A luminosidade de financeiro, brand, motorista e servico foi
        // ESCURECIDA em 16/10/2026 porque o texto branco por cima reprovava em
        // WCAG AA (2,87:1 no verde, 3,15:1 no azul, 3,62:1 no rosa, onde 14px
        // pede 4,5:1). Hue e saturacao intactas: a marca e a mesma, o botao e
        // legivel. Os quatro agora dao ~4,7:1, e distribuicao (que usa texto
        // escuro) seguia passando com 6,34:1.
        //
        // scripts/checks/cor-de-setor.ts recalcula os dois pares a cada rodada.
        vendas: {
          DEFAULT: "#9b59b6", soft: "#f3eafa", text: "hsl(var(--vendas-text))", fg: "#ffffff",
        },
        financeiro: {
          DEFAULT: "#dc1e6b", soft: "#fceaf2", text: "hsl(var(--financeiro-text))", fg: "#ffffff",
        },
        distribuicao: {
          DEFAULT: "#f39c12", soft: "#fdf2e0", text: "hsl(var(--distribuicao-text))", fg: "#3a2a00",
        },
        motorista: {
          DEFAULT: "#1e8449", soft: "#e6f6ed", text: "hsl(var(--motorista-text))", fg: "#ffffff",
        },
        brand: {
          DEFAULT: "#2079b4", soft: "#e8f3fb", text: "hsl(var(--brand-text))", fg: "#ffffff",
        },
        // Select (venda de SERVICO). Nao e um setor: e uma natureza de venda
        // que aparece dentro de Vendas e do Financeiro. Token proprio, e nao
        // reuso do verde de "motorista", porque a paleta e lida por setor —
        // um botao "motorista" no meio de Vendas leria como engano.
        servico: {
          DEFAULT: "#1e8449", soft: "#e6f6ed", text: "hsl(var(--servico-text))", fg: "#ffffff",
        },
        // ---- Cor de MARCA (nao e setor) ----
        //
        // O creme da OKEY, escolhido pelo dono em 17/10/2026 para o botao do
        // formulario dela em /vendas. Nao entra na paleta de setor: setor diz
        // em que MODULO a pessoa esta, marca diz de qual LP e o link.
        //
        // `fg` e escuro e FIXO nos dois temas, e nao o --foreground: sobre este
        // creme, o texto branco da 1,27:1 e o --foreground do tema escuro da
        // 1,03:1 — ilegivel nos dois casos. Com o escuro fixo sao 10,98:1. E o
        // mesmo arranjo que `distribuicao` ja usa com o ambar.
        okey: {
          DEFAULT: "#f0e6a8", hover: "#e8dc92", fg: "#3a2a00",
        },

        // ---- Tokens shadcn/ui ----
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
