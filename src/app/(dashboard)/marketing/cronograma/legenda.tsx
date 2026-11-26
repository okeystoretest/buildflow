import Link from "next/link";
import { CORES_DE_FUNIL, FUNIL_LEGENDA, estiloDeSelo, tintaDeTexto } from "@/lib/cronograma";
import { cn } from "@/lib/utils";

/**
 * A BARRA DO FUNIL: os filtros por etapa e a legenda que traduz as siglas.
 *
 * É a barra do Build.Connect (pedido do dono, 26/11/2026), e ela resolve um
 * problema que o calendário sozinho não resolvia: o selo do card mostra "TOFU",
 * "MOFU" e "BOFU" porque é só o que cabe numa célula de sete colunas, e até
 * aqui a ferramenta inteira não traduzia essas três siglas em lugar nenhum.
 * Quem chega novo no Marketing lia três palavras de três letras.
 *
 * O FILTRO É `<Link>`, não botão: recortar por etapa é navegação, igual ao
 * período, à marca e à vista. A tela inteira continua sendo servida pronta, e o
 * recorte sobrevive ao F5 e pode ser mandado por link.
 *
 * ACUMULA EM VEZ DE TROCAR: clicar em MOFU com TOFU já marcado dá "TOFU e
 * MOFU", e clicar de novo tira. Quem pergunta "quanto do meu mês é topo e
 * meio?" precisa das duas juntas, e um filtro de escolha única obrigaria a
 * olhar duas vezes e somar de cabeça.
 *
 * SEM AS MARCAS, ao contrário da barra de lá: o filtro de marca já está no
 * cabeçalho desta tela. Repeti-lo aqui daria dois controles para a mesma
 * pergunta, e o segundo sempre parece discordar do primeiro.
 */
export function LegendaDoFunil({
  selecionados,
  href,
}: {
  selecionados: string[];
  /** Monta o endereço da tela com estas etapas marcadas, preservando o resto. */
  href: (funis: string[]) => string;
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-10 gap-y-4 rounded-xl border border-border bg-secondary/30 px-4 py-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Filtros estratégicos
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {FUNIL_LEGENDA.map((f) => {
            const ativo = selecionados.includes(f.chave);
            const alternado = ativo
              ? selecionados.filter((c) => c !== f.chave)
              : [...selecionados, f.chave];
            return (
              <Link
                key={f.chave}
                href={href(alternado)}
                // O ESTADO VAI NO NOME, não só na cor: um link que às vezes
                // filtra e às vezes desfiltra precisa dizer qual dos dois faz
                // agora, e "TOFU · Atração" sozinho não diz.
                aria-label={`${f.curto} — ${ativo ? "remover do filtro" : "filtrar"}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  ativo ? "" : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
                style={ativo ? estiloDeSelo(CORES_DE_FUNIL, f.chave) : undefined}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: CORES_DE_FUNIL[f.chave] }}
                  aria-hidden
                />
                {f.curto}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="min-w-[16rem] flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Legenda do funil
        </p>
        {/* Lista de definição de verdade: são termos e suas definições, e é
            assim que um leitor de tela anuncia o par. */}
        <dl className="mt-2 grid gap-3 sm:grid-cols-3">
          {FUNIL_LEGENDA.map((f) => (
            <div key={f.chave} className="flex items-start gap-1.5">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: CORES_DE_FUNIL[f.chave] }}
                aria-hidden
              />
              <div className="min-w-0">
                <dt className="text-xs font-semibold">{f.titulo}</dt>
                {/* A DESCRIÇÃO VAI NA TINTA DA ETAPA, puxada para o tema pela
                    mesma mistura do selo: é o que amarra a frase à cor que o
                    calendário usa, sem virar texto ilegível no tema claro. */}
                <dd className="text-[11px] leading-snug" style={{ color: tintaDeTexto(CORES_DE_FUNIL[f.chave]) }}>
                  {f.descricao}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
