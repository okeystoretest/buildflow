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
        sans: ["var(--font-outfit)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
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
        // legivel.
        //
        // 05/11/2026: os quatro setores TROCARAM de cor entre si, a pedido do
        // dono — rosa para o Comercial, ambar para o Financeiro, verde para a
        // Logistica, azul para o Motorista. Cada setor levou o TRIO INTEIRO
        // (cor, tom claro e texto por cima), entao o ajuste de contraste de
        // 16/10 viajou junto e nada foi recalculado. O `fg` escuro acompanha o
        // ambar, nao o setor: e a cor clara que exige texto escuro.
        //
        // COR REPETIDA E PERMITIDA (decisao do dono, 06/11/2026). O azul serve
        // Motorista e `brand`, o verde serve Logistica e `servico`, e isso nao
        // e defeito: a leitura vem do CONTEXTO (um botao de Select aparece
        // dentro de Vendas, nunca ao lado de um de Logistica). A regra anterior
        // — "nenhuma cor em dois lugares" — custava repintar 91 usos nas telas
        // de Select para resolver uma ambiguidade que ninguem relatou.
        //
        // scripts/checks/cor-de-setor.ts recalcula os dois pares a cada rodada.
        vendas: {
          DEFAULT: "#dc1e6b", soft: "#fceaf2", text: "hsl(var(--vendas-text))", fg: "#ffffff",
        },
        financeiro: {
          DEFAULT: "#f39c12", soft: "#fdf2e0", text: "hsl(var(--financeiro-text))", fg: "#3a2a00",
        },
        distribuicao: {
          DEFAULT: "#1e8449", soft: "#e6f6ed", text: "hsl(var(--distribuicao-text))", fg: "#ffffff",
        },
        motorista: {
          DEFAULT: "#2079b4", soft: "#e8f3fb", text: "hsl(var(--motorista-text))", fg: "#ffffff",
        },
        brand: {
          DEFAULT: "#2079b4", soft: "#e8f3fb", text: "hsl(var(--brand-text))", fg: "#ffffff",
        },
        // Select (venda de SERVICO). Nao e um setor: e uma natureza de venda
        // que aparece dentro de Vendas e do Financeiro. Token PROPRIO mesmo
        // tendo o mesmo verde da Logistica: o nome e que diz a quem a cor
        // pertence, e separar o token agora deixa a porta aberta para repintar
        // um sem mexer no outro.
        servico: {
          DEFAULT: "#1e8449", soft: "#e6f6ed", text: "hsl(var(--servico-text))", fg: "#ffffff",
        },
        // Rank de Vendas. Tela unica, nao setor: fica fora da paleta dos quatro
        // para o roxo nao parecer um setor que ninguem encontra no menu. E o
        // mesmo roxo que era do Comercial antes do remanejo de 05/11 — o Rank
        // sempre foi roxo, e so virou rosa porque herdava `vendas`.
        rank: {
          DEFAULT: "#9b59b6", soft: "#f3eafa", text: "hsl(var(--rank-text))", fg: "#ffffff",
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

        // A irma mais nova. `DEFAULT` e o rosa da marca (#f8b4c4), o mesmo que
        // a LP usa — e aqui ele e FUNDO, nunca letra, pelo mesmo motivo de la:
        // como cor de texto da 1,5:1 e reprova em todo criterio.
        //
        // `fg` escuro e fixo nos dois temas, como no okey: branco sobre este
        // rosa da 2,0:1. Com a ameixa escura sao 9,5:1.
        lov: {
          // #ffb7c5 e o tom mais forte da rampa da marca (a mesma do
          // atacado.css): a marca nao pode ter dois rosas. O `hover` e o
          // seguinte da rampa, #ffc8d4 — mais CLARO que o parado, ao contrario
          // do okey. Clarear tambem e resposta ao mouse, e escurecer sairia da
          // rampa que o dono deu.
          DEFAULT: "#ffb7c5", hover: "#ffc8d4", fg: "#3a1420",
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
    },
  },
  // Sem plugins: as animacoes do app sao escritas a mao em globals.css.
  plugins: [],
};

export default config;
