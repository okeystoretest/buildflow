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
        vendas: {
          DEFAULT: "#9b59b6", soft: "#f3eafa", text: "hsl(var(--vendas-text))", fg: "#ffffff",
        },
        financeiro: {
          DEFAULT: "#e74c8b", soft: "#fceaf2", text: "hsl(var(--financeiro-text))", fg: "#ffffff",
        },
        distribuicao: {
          DEFAULT: "#f39c12", soft: "#fdf2e0", text: "hsl(var(--distribuicao-text))", fg: "#3a2a00",
        },
        motorista: {
          DEFAULT: "#27ae60", soft: "#e6f6ed", text: "hsl(var(--motorista-text))", fg: "#ffffff",
        },
        brand: {
          DEFAULT: "#3498db", soft: "#e8f3fb", text: "hsl(var(--brand-text))", fg: "#ffffff",
        },
        // Select (venda de SERVICO). Nao e um setor: e uma natureza de venda
        // que aparece dentro de Vendas e do Financeiro. Token proprio, e nao
        // reuso do verde de "motorista", porque a paleta e lida por setor —
        // um botao "motorista" no meio de Vendas leria como engano.
        servico: {
          DEFAULT: "#27ae60", soft: "#e6f6ed", text: "hsl(var(--servico-text))", fg: "#ffffff",
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
