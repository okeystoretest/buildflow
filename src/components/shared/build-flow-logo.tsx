import type { SVGProps } from "react";

/**
 * Logotipo do Build.Flow: uma caixa (pacote) atravessada por uma seta
 * ascendente — logistica + crescimento. Monocromatico via currentColor: herda
 * a cor do contexto (ex.: text-primary-foreground sobre o quadrado primario do
 * cabecalho, ou text-primary numa tela clara), integrando-se a paleta oficial e
 * acompanhando o tema (claro/escuro). A caixa fica com opacidade menor para
 * destacar a seta.
 *
 * Uso: <BuildFlowLogo className="h-5 w-5 text-primary-foreground" />
 */
export function BuildFlowLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Build.Flow"
      {...props}
    >
      {/* Caixa isometrica (contorno) — currentColor esmaecido */}
      <g stroke="currentColor" strokeLinejoin="round" strokeWidth="2.4" opacity="0.5">
        <path d="M24 7 L39 15.5 V32.5 L24 41 L9 32.5 V15.5 Z" />
        <path d="M9 15.5 L24 24 L39 15.5 M24 24 V41" />
      </g>
      {/* Seta ascendente (crescimento) — currentColor cheio */}
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" fill="none">
        <path d="M11 32 C 16 22, 26 16.5, 37 12.5" />
        <path d="M29.5 11.5 L38 11 L37.5 19.5" />
      </g>
    </svg>
  );
}
