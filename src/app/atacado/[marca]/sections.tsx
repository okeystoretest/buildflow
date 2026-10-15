import type { BrandContent } from "@/lib/wholesale-content";

/**
 * Seções institucionais da LP de atacado.
 *
 * TODO o texto institucional vem de WHOLESALE_CONTENT, ITERADO — nunca
 * redigitado. É copy aprovada pela marca, transcrita da planilha, com promessas
 * comerciais (margem de até 100%, exclusividade territorial, Linha Italiana
 * Premium) numa página pública: texto redigitado aqui divergiria do módulo na
 * primeira edição, e a página passaria a prometer coisa diferente da revisada.
 * `scripts/checks/wholesale-content.ts` guarda um sha256 da copy exatamente por
 * isso. O FAQ tem SETE perguntas em quatro grupos, não oito — o grupo 4
 * ("Qualidade e Trocas") tem uma pergunta só na planilha. Nada aqui conta
 * perguntas; o laço renderiza o que o módulo tiver.
 *
 * Componentes de servidor: nenhuma destas seções tem estado. O único
 * JavaScript da página é o do formulário, e o FAQ usa <details>/<summary>
 * nativos para abrir sem script nenhum.
 */

/** Cabeça de seção: cabeça pendurada mais filete inteiro, o "posto" do mundo. */
function CabecaSecao({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="cabeca-secao cabeca-placa">
      <span>{children}</span>
    </h2>
  );
}

/**
 * Abertura: o lote concedido. Campo inundado em ultramarino com a cartela de
 * título alinhada à base.
 *
 * O nome da marca em texto É o logotipo: PRODUCT.md registra o símbolo da marca
 * como questão aberta, e nenhuma arte foi entregue. Inventar um monograma aqui
 * seria inventar identidade.
 */
export function Abertura({ brandName }: { brandName: string }) {
  return (
    <header className="campo-concedido faixa abertura">
      <div className="interno">
        <div className="filete-corrido abertura-filete" aria-hidden="true" />
        <h1 className="mt-7">
          <span className="nome-marca block">{brandName}</span>
          <span className="frase-titulo mt-6 block">Seja revendedora</span>
        </h1>
        {/* Tagline oficial da marca, usada no site da própria empresa. É a
            ÚNICA frase desta página que não vem de WHOLESALE_CONTENT; está aqui
            porque é o que dá tom e categoria ao primeiro quadro, e sai em uma
            linha se a marca não quiser. Nada além dela foi redigido. */}
        <p className="gravado mt-7 max-w-[26rem] text-lg leading-snug text-muted-foreground sm:text-xl">
          Atemporalidade e Arte em Cada Detalhe
        </p>
        <a href="#requerimento" className="botao-placa mt-10 max-w-sm">
          Preencher o cadastro
        </a>
      </div>
    </header>
  );
}

/**
 * Por que revender: os 3 motivos como divisões de UMA placa.
 *
 * Divisões separadas por filete, não por vão: é um lote dividido, e não uma
 * fileira de três cartões iguais de ícone-título-texto. Não há ícone nenhum
 * aqui — cada motivo tem duas linhas de copy e é tudo o que a planilha dá.
 */
export function Motivos({ reasons }: { reasons: BrandContent["reasons"] }) {
  return (
    <section className="faixa faixa-alta" aria-labelledby="motivos-titulo">
      <div className="interno interno-largo">
        <CabecaSecao id="motivos-titulo">Por que revender</CabecaSecao>
        <div className="placa placa-aguada lote mt-9">
          {reasons.map((motivo) => (
            <div key={motivo.title} className="divisao p-6 sm:p-7">
              <h3 className="titulo-item text-[1.3rem] text-primary sm:text-2xl">
                {motivo.title}
              </h3>
              <p className="mt-2.5 text-[0.9375rem] leading-relaxed">{motivo.subtitle}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Por que escolher: as 6 vantagens como a LEGENDA da planta.
 *
 * Toda planta carrega uma legenda, e cada entrada tem a sua marca. As marcas
 * são hachuras desenhadas por gradiente em CSS (atacado.css), uma por entrada:
 * é o sistema de marcas que este mundo já tem, e é por isso que não entra aqui
 * nenhum ícone de biblioteca nem emoji. Seis unidades idênticas, lidas varrendo
 * a coluna, sem decoração por unidade.
 */
export function Vantagens({ advantages }: { advantages: BrandContent["advantages"] }) {
  return (
    <section className="faixa faixa-alta" aria-labelledby="vantagens-titulo">
      <div className="interno">
        <CabecaSecao id="vantagens-titulo">Por que escolher</CabecaSecao>
        <ul className="mt-9">
          {advantages.map((vantagem, i) => (
            <li
              key={vantagem.title}
              className="filete-item flex items-start gap-4 py-7 first:pt-3"
            >
              {/* A marca da legenda não diz nada que o título não diga: fica
                  fora da árvore de acessibilidade. */}
              <span className="marca-legenda mt-1.5" data-marca={i} aria-hidden="true" />
              <div className="min-w-0">
                <h3 className="titulo-item text-xl sm:text-[1.375rem]">{vantagem.title}</h3>
                <p className="rotulo-pequeno mt-2 text-primary">{vantagem.subtitle}</p>
                <p className="corpo mt-3.5">{vantagem.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Perguntas frequentes: 4 grupos, 7 perguntas, em <details>/<summary> nativos.
 *
 * Acordeão nativo por três razões: funciona sem JavaScript, já vem com a
 * semântica de expandir/recolher que leitor de tela anuncia, e mantém a página
 * pública leve. A marca que vira ao abrir é um triângulo em CSS; o triângulo
 * nativo do navegador fica escondido.
 *
 * Fecha a página em campo inundado, como ela abriu.
 */
export function Perguntas({
  faq,
  brandName,
}: {
  faq: BrandContent["faq"];
  brandName: string;
}) {
  return (
    <section className="campo-concedido faixa faixa-alta" aria-labelledby="faq-titulo">
      <div className="interno">
        <CabecaSecao id="faq-titulo">Perguntas frequentes</CabecaSecao>
        {faq.map((grupo) => (
          <div key={grupo.group} className="mt-11 first:mt-9">
            <h3 className="cabeca-placa rotulo-pequeno">
              <span>{grupo.group}</span>
            </h3>
            <div className="mt-2">
              {grupo.items.map((item) => (
                <details key={item.q} className="nota filete-item">
                  <summary>
                    <span className="linha-nota">
                      <span className="marca-nota" aria-hidden="true" />
                      <span className="text-[1.0625rem] font-medium leading-snug">
                        {item.q}
                      </span>
                    </span>
                  </summary>
                  <p className="corpo pb-6 pl-[1.2rem] text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        ))}
        {/* Marca de pé da placa. O nome da marca é dado, não texto novo. */}
        <p className="cabeca-placa gravado mt-14 text-sm uppercase">
          <span>{brandName}</span>
        </p>
      </div>
    </section>
  );
}
