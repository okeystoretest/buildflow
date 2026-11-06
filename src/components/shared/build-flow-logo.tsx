import { cn } from "@/lib/utils";

/**
 * A MARCA Build.Flow: a logo e, ao lado, o nome com a assinatura embaixo.
 *
 * Existe como componente, e nao como par de tags copiado, porque os tamanhos
 * sao uma ESPECIFICACAO (06/11/2026) e nao uma escolha de cada tela: a logo
 * estava a 36px na barra lateral e a tela de login nem usava a logo — tinha um
 * icone de pacote generico no lugar. Com as medidas soltas, a proxima tela
 * nasce com um terceiro tamanho e ninguem nota.
 *
 * Os numeros, como especificados:
 *
 *   padrao     40x40  barra lateral aberta
 *   compacto   36x36  barra lateral recolhida e cabecalhos
 *   login      56x56  tela de entrada
 *
 *   titulo     17px, bold 700, tracking-tight, leading-none
 *              "Build." na cor do texto, "Flow" na cor primaria
 *   assinatura 11px, medium 500, cor muted, 4px acima
 *   espaco     10px entre a imagem e o texto, centrados na vertical
 *
 * A fonte e a Outfit, que ja e a `font-sans` do app — nao ha classe aqui.
 */

const TAMANHO = {
  padrao: "h-10 w-10",
  compacto: "h-9 w-9",
  login: "h-14 w-14",
} as const;

const PIXELS = { padrao: 40, compacto: 36, login: 56 } as const;

export function MarcaBuildFlow({
  tamanho = "padrao",
  /** Só a imagem, sem o nome — a barra lateral recolhida e os cabeçalhos. */
  semTexto = false,
  className,
}: {
  tamanho?: keyof typeof TAMANHO;
  semTexto?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt=""
        width={PIXELS[tamanho]}
        height={PIXELS[tamanho]}
        className={cn("shrink-0 object-contain", TAMANHO[tamanho])}
      />
      {!semTexto && (
        <span className="min-w-0">
          <span className="block text-[17px] font-bold leading-none tracking-tight">
            Build.<span className="text-primary">Flow</span>
          </span>
          <span className="mt-1 block truncate text-[11px] font-medium text-muted-foreground">
            Logística e controle de vendas
          </span>
        </span>
      )}
    </span>
  );
}
