import type { BrandContent } from "@/lib/wholesale-content";
import { urlPublicaDaImagem, type LugarDeImagem, type ManifestoDaLp } from "@/lib/lp-assets";
import { EditorDeImagem, GatilhoOculto } from "./modo-edicao";

/* ============================================================================
   Seções institucionais da LP de atacado
   ============================================================================

   REGRA QUE GOVERNA ESTE ARQUIVO: nenhuma afirmação comercial é escrita aqui.
   Toda frase que afirma algo sobre o negócio — margem, tecido, atendimento,
   exclusividade — vem de `WHOLESALE_CONTENT`, que é transcrição literal da
   planilha e está travada por digest sha256 numa checagem. O que existe neste
   arquivo em texto fixo são rótulos de estrutura ("Por que revender") e de
   controle ("Preencher o cadastro"), mais a tagline oficial da marca.
   Prazo, telefone, endereço, ano de fundação e promessa de contato NÃO entram:
   o dono mandou ignorar os da referência e enviar os dele.

   A ORDEM diverge da decisão original da spec (que punha o cadastro antes do
   FAQ): a referência do dono responde as objeções ANTES de pedir 18 campos, e
   é a ordem que converte melhor. Registrado para a spec ser emendada.
   ========================================================================= */

/** A única seta do sistema de ícones. Traço de 1,25 e nada mais — uma fonte de
 *  ícone inteira para um símbolo é peso que a lojista paga em dados móveis. */
function Seta({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="square"
      aria-hidden="true"
    >
      <path d="M1 7h11M8 3.5 11.5 7 8 10.5" />
    </svg>
  );
}

/** Lugar reservado de imagem. Vazio por enquanto, de propósito: as fotografias
 *  da marca ainda não existem no repositório e inventar imagem seria pior que
 *  não ter. O vazio carrega a inicial da marca em Playfair e uma legenda
 *  discreta, então parece reservado e não quebrado — e quando a foto entrar,
 *  o mesmo contêiner a recebe sem mexer no layout. */
function LugarImagem({
  marca,
  className,
  legenda,
  lugar,
  assets,
}: {
  marca: string;
  className?: string;
  legenda?: string;
  lugar: LugarDeImagem;
  assets: ManifestoDaLp;
}) {
  const imagem = assets[lugar];
  return (
    <div className={`lugar-imagem ${className ?? ""}`}>
      {imagem ? (
        // Sem next/image: `images.unoptimized` esta ligado no projeto, entao o
        // componente nao otimizaria nada e so acrescentaria JS. A imagem ja sai
        // do servidor como webp de 1600 px.
        // O MESMO componente serve o herói e os três motivos, e o herói é a
        // imagem de LCP: `lazy` nele atrasava a descoberta da imagem mais
        // importante na conexão móvel que é o cenário declarado. Derivado do
        // lugar, não passado por prop, para não haver chamada que erre.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={urlPublicaDaImagem(imagem.arquivo)}
          alt={imagem.alt}
          loading={lugar === "hero" ? "eager" : "lazy"}
          fetchPriority={lugar === "hero" ? "high" : undefined}
        />
      ) : (
        <>
          <span className="monograma" aria-hidden="true">
            {marca.charAt(0)}
          </span>
          {legenda ? (
            <span className="legenda-vazio rotulo-micro" aria-hidden="true">
              {legenda}
            </span>
          ) : null}
        </>
      )}
      <EditorDeImagem lugar={lugar} altAtual={imagem?.alt ?? ""} />
    </div>
  );
}

export function Cabecalho({ brandName }: { brandName: string }) {
  return (
    <header className="cabecalho">
      <div className="interno flex items-center justify-between gap-6 py-4">
        <a href="#abertura" className="flex flex-col">
          <span className="marca-nome">{brandName}</span>
          <span className="rotulo-micro mt-0.5" style={{ fontSize: "0.5625rem" }}>
            Atacado
          </span>
        </a>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Seções desta página">
          <a className="nav-ancora" href="#motivos">
            Por que revender
          </a>
          <a className="nav-ancora" href="#vantagens">
            Vantagens
          </a>
          <a className="nav-ancora" href="#perguntas">
            Perguntas
          </a>
        </nav>

        <a href="#requerimento" className="acao-vazia hidden sm:inline-flex" style={{ padding: "0.7rem 1.25rem" }}>
          Quero ser revendedora
        </a>
      </div>
    </header>
  );
}

export function Abertura({
  brandName,
  assets,
  highlights,
}: {
  brandName: string;
  assets: ManifestoDaLp;
  highlights: BrandContent["highlights"];
}) {
  return (
    <section id="abertura" className="faixa" aria-labelledby="abertura-titulo">
      <div className="interno grid items-center gap-10 pb-16 pt-10 lg:grid-cols-2 lg:gap-14 lg:pb-24 lg:pt-16">
        <div>
          {/* A régua é a marca desenhada pela própria página: não há logotipo,
              e ela corre uma vez na entrada — o único momento animado. */}
          <div className="regua-heroi mb-8 max-w-[7rem]" aria-hidden="true" />

          <p className="marca-nome assenta-1" style={{ fontSize: "0.95rem" }}>
            {brandName}
          </p>

          <h1 id="abertura-titulo" className="display-heroi assenta-1 mt-3">
            Seja revendedora
          </h1>

          {/* Tagline oficial da marca, usada no site da própria empresa. É a
              única frase desta página que não vem de WHOLESALE_CONTENT nem é
              rótulo de estrutura; sai em uma linha se a marca não quiser. */}
          <p className="corpo-grande assenta-2 mt-5 text-[hsl(var(--muted-foreground))]">
            Atemporalidade e Arte em Cada Detalhe
          </p>

          <div className="assenta-2 mt-9 flex flex-col gap-3 sm:flex-row">
            <a href="#requerimento" className="acao">
              Preencher o cadastro
            </a>
            <a href="#vantagens" className="acao-vazia">
              Conhecer as vantagens
            </a>
          </div>

          {/* Credencial: as duas promessas mais fortes que a planilha já faz,
              trazidas da margem (FAQ 3) e da exclusividade (FAQ 3) para perto
              da ação, em vez de ficarem enterradas no fim da página. */}
          <dl className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-[hsl(var(--border))] pt-7">
            {highlights.map((h) => (
              <div key={h.termo}>
                <dt className="rotulo-micro">{h.termo}</dt>
                <dd className="corpo-pequeno mt-1">{h.valor}</dd>
              </div>
            ))}
          </dl>
        </div>

        <LugarImagem
          marca={brandName}
          className="h-[22rem] w-full sm:h-[30rem] lg:h-[40rem]"
          legenda="Imagem da coleção"
          lugar="hero"
          assets={assets}
        />
      </div>
    </section>
  );
}

/** Faixa de métricas. Cada célula afirma algo que a planilha já afirma, com a
 *  condição dela embaixo — é a parte mais comercial do layout e não depende de
 *  nenhum dado novo. */
export function Metricas({ celulas }: { celulas: BrandContent["metrics"] }) {

  return (
    <section className="faixa bg-[hsl(var(--secondary))]" aria-label="Condições para lojistas">
      <div className="interno py-10">
        <div className="grade-metricas">
          {celulas.map((c) => (
            <div key={c.rotulo}>
              <p className="numeral">{c.valor}</p>
              <p className="rotulo-micro mt-2">{c.rotulo}</p>
              <p className="corpo-pequeno mt-3 text-[hsl(var(--muted-foreground))]">{c.nota}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Os lugares de imagem dos motivos, na ordem.
 *
 * Tupla explícita em vez de `` `motivo-${i + 1}` as LugarDeImagem ``: o cast
 * escondia o acoplamento de que `reasons` tem exatamente três itens. Um quarto
 * motivo produzia "motivo-4" — a página caía no espaço reservado e a action
 * respondia "Lugar de imagem desconhecido", sem nada reclamar antes. Assim o
 * limite é visível ao compilador, e um quarto motivo reusa o último lugar em
 * vez de inventar um que não existe.
 */
const LUGARES_DOS_MOTIVOS = ["motivo-1", "motivo-2", "motivo-3"] as const;

export function Motivos({
  reasons,
  brandName,
  assets,
}: {
  reasons: BrandContent["reasons"];
  brandName: string;
  assets: ManifestoDaLp;
}) {
  return (
    <section id="motivos" className="faixa" aria-labelledby="motivos-titulo">
      <div className="interno py-20 lg:py-28">
        <h2 id="motivos-titulo" className="titulo-secao max-w-xl">
          Por que revender
        </h2>
        <div className="mt-4 h-px w-12 bg-[hsl(var(--primary))]" aria-hidden="true" />

        <div className="mt-16 space-y-16 lg:mt-20 lg:space-y-24">
          {reasons.map((r, i) => (
            <div key={r.title} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
              <LugarImagem
                marca={brandName}
                className={`h-[18rem] w-full sm:h-[26rem] ${i % 2 === 1 ? "lg:order-2" : ""}`}
                lugar={LUGARES_DOS_MOTIVOS[i] ?? "motivo-3"}
                assets={assets}
              />
              <div className={i % 2 === 1 ? "lg:order-1" : ""}>
                {/* O número carrega informação: a planilha ordena os três
                    motivos, e a ordem é a dela. */}
                <p className="rotulo-micro">
                  {String(i + 1).padStart(2, "0")} — {r.title}
                </p>
                <h3 className="titulo-bloco mt-4">{r.subtitle}</h3>
                <a href="#requerimento" className="acao-linha mt-8">
                  Quero me cadastrar
                  <Seta />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Vantagens({ advantages }: { advantages: BrandContent["advantages"] }) {
  return (
    <section id="vantagens" className="faixa bg-[hsl(var(--secondary))]" aria-labelledby="vantagens-titulo">
      <div className="interno py-20 lg:py-28">
        <h2 id="vantagens-titulo" className="titulo-secao max-w-xl">
          Por que escolher
        </h2>
        <div className="mt-4 h-px w-12 bg-[hsl(var(--primary))]" aria-hidden="true" />

        <div className="grade-vantagens mt-14">
          {advantages.map((a, i) => (
            <article key={a.title} className="vantagem">
              <p className="numeral text-[hsl(var(--accent))]" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </p>
              <p className="rotulo-micro mt-4">{a.title}</p>
              <h3 className="titulo-item mt-2">{a.subtitle}</h3>
              <p className="corpo mt-4 text-[hsl(var(--muted-foreground))]">{a.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-12 flex justify-center">
          <a href="#requerimento" className="acao">
            Quero ser revendedora
          </a>
        </div>
      </div>
    </section>
  );
}

export function Perguntas({ faq }: { faq: BrandContent["faq"] }) {
  return (
    <section id="perguntas" className="faixa" aria-labelledby="perguntas-titulo">
      <div className="interno grid gap-12 py-20 lg:grid-cols-12 lg:gap-14 lg:py-28">
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <h2 id="perguntas-titulo" className="titulo-secao">
              Perguntas frequentes
            </h2>
            <div className="mt-4 h-px w-12 bg-[hsl(var(--primary))]" aria-hidden="true" />
            <p className="corpo mt-6 text-[hsl(var(--muted-foreground))]">
              Pedido mínimo, entrega, margem e exclusividade territorial, do jeito que a nossa equipe
              responde.
            </p>
            {/* Sem telefone e sem WhatsApp: não existe canal de saída nesta
                feature (decisão 7) e a vendedora é quem liga. Prometer canal
                aqui seria promessa que o sistema não cumpre. */}
            <div className="mt-8 border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-6">
              <p className="titulo-item">Ficou alguma dúvida?</p>
              <p className="corpo-pequeno mt-2 text-[hsl(var(--muted-foreground))]">
                Preencha o cadastro e fale com a vendedora que compartilhou este link com você.
              </p>
              <a href="#requerimento" className="acao-linha mt-5">
                Ir para o cadastro
                <Seta />
              </a>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7">
          {faq.map((grupo) => (
            <div key={grupo.group} className="mb-10 last:mb-0">
              <p className="rotulo-micro border-b border-[hsl(var(--border))] pb-2">{grupo.group}</p>
              {grupo.items.map((item) => (
                <details key={item.q} className="pergunta">
                  <summary>
                    {item.q}
                    <span className="sinal" aria-hidden="true" />
                  </summary>
                  <div className="resposta">
                    <p className="corpo text-[hsl(var(--muted-foreground))]">{item.a}</p>
                  </div>
                </details>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Rodape({ brandName }: { brandName: string }) {
  return (
    <footer className="rodape" aria-label="Rodapé">
      <div className="interno flex flex-col gap-8 py-12 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {/* O nome da marca aqui e o gatilho oculto do modo de edicao:
              pressionar e segurar 800 ms. Nao desenha nada, e nao faz nada para
              quem nao tem sessao de GESTAO. */}
          <GatilhoOculto>
            <p className="marca-nome">{brandName}</p>
          </GatilhoOculto>
          <p className="rotulo-micro mt-1">Atacado</p>
          {/* Finalidade declarada do tratamento, em uma linha. Não é a política
              de privacidade: o aviso completo precisa de controlador, prazo de
              retenção e contato para os direitos do titular, que são do dono. */}
          <p className="corpo-pequeno mt-5 max-w-sm text-[hsl(var(--muted-foreground))]">
            Os dados deste cadastro são usados para analisar a sua candidatura a revenda.
          </p>
        </div>
        <p className="corpo-pequeno text-[hsl(var(--muted-foreground))]">
          © {new Date().getFullYear()} {brandName}
        </p>
      </div>
    </footer>
  );
}
