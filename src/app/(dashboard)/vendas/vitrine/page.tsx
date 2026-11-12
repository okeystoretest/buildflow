import Link from "next/link";
import { AlertTriangle, Download, ExternalLink, FileText, Store } from "lucide-react";
import { requireRole } from "@/lib/auth";
import {
  buscarVitrine,
  linkDaVitrine,
  type DocumentoDaVitrine,
  type FotoDaVitrine,
  type VideoDaVitrine,
  type Vitrine,
} from "@/lib/integration/connect-vitrine";
import {
  ABAS_DA_VITRINE,
  PAPEIS_DA_VITRINE,
  abaValida,
  dataCurta,
  filtrarAcervo,
  nomeParaBaixar,
  opcoesDaColecao,
  resumoDoAcervo,
  rotuloDeTipoDeArquivo,
  rotuloDeTipoDeVideo,
  tamanhoLegivel,
  urlDoArquivo,
  videosDaAba,
  type AbaDaVitrine,
  type FiltroDaColecao,
} from "@/lib/vitrine";
import { VitrineFiltros } from "./filtros-client";

/**
 * VITRINE — o acervo de fotos, vídeos e material de apoio vindo do
 * Build.Connect.
 *
 * ESCOLHE A MARCA PRIMEIRO, como o Fluxo de Pedidos escolhe a loja (pedido do
 * dono, 06/11/2026): sem `?vitrine=`, a tela pergunta qual. Cada marca tem
 * vitrine própria no Connect (OKEY e Lov Club), e empilhar as duas numa página
 * só faria a pessoa rolar por material de uma marca para achar o da outra.
 *
 * AS QUATRO ABAS SÃO AS DO CONNECT (pedido de 09/11/2026), com os rótulos de
 * lá: Fotos da Coleção, Vídeos da Coleção, Workshop e Material de Apoio. A
 * aparência é a desta aplicação — quem abre está no Flow, e a tela não deve
 * parecer outro sistema embutido.
 *
 * TOCA E BAIXA AQUI, que era o ponto do pedido. Os bytes vêm pela rota
 * `api/vendas/vitrine/arquivo` (sessão e papel deste lado) e, dela,
 * do Connect POR ID DE ITEM — nunca por caminho, e só de subsetor VITRINE.
 * Antes a tela só listava e mandava a pessoa fazer um segundo login no Connect
 * para abrir o PDF que ela já estava vendo listado.
 *
 * SOMENTE LEITURA. Quem publica material é o Connect; duas telas que editam o
 * mesmo acervo discordariam na primeira edição simultânea.
 *
 * O ESTADO MORA NA URL (`?aba=`, `?q=`, `?temporada=`, `?colecao=`, `?ano=`):
 * o recorte fica compartilhável, o botão Voltar funciona, e o filtro roda no
 * servidor sobre uma lista que já está lá.
 */
export const dynamic = "force-dynamic";

type Query = {
  vitrine?: string;
  aba?: string;
  q?: string;
  temporada?: string;
  colecao?: string;
  ano?: string;
};

export default async function VitrinePage(props: { searchParams?: Promise<Query> }) {
  await requireRole(PAPEIS_DA_VITRINE);

  const searchParams = await props.searchParams;
  const resposta = await buscarVitrine();

  if (!resposta.ok) {
    return (
      <Moldura>
        {/* O MOTIVO APARECE NA TELA, não só no log: sem ele a pessoa não sabe
            se esperar, se avisar alguém, ou se o problema é ela. */}
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium">A vitrine não pôde ser carregada.</p>
            <p className="text-sm text-muted-foreground">{resposta.motivo}</p>
            <p className="text-xs text-muted-foreground">
              O acervo é mantido no Build.Connect — esta tela só o exibe.
            </p>
          </div>
        </div>
      </Moldura>
    );
  }

  /*
   * A MARCA VAZIA CONTINUA NA LISTA. Ela existe no Connect tenha material ou
   * nao, e some-la enquanto ninguem publicou faria o seletor aparecer com uma
   * marca so, ou nenhuma — a pessoa clica em "Vitrine" e conclui que quebrou.
   * O vazio e dito dentro da marca escolhida, que e onde a pergunta nasce.
   */
  const marcas = resposta.vitrines;

  if (marcas.length === 0) {
    return (
      <Moldura>
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <Store className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm text-muted-foreground">
            Nenhuma vitrine configurada no Build.Connect.
          </p>
        </div>
      </Moldura>
    );
  }

  /*
   * Marca inválida na URL cai no seletor, não em erro: o `?vitrine=` vem da
   * barra de endereço e um slug velho (vitrine renomeada no Connect) não deve
   * dar tela de erro — deve perguntar de novo. Mesma postura do Fluxo, que
   * devolve ao picker quando a loja não está na lista permitida.
   */
  const escolhida = marcas.find((v) => v.slug === searchParams?.vitrine);

  if (!escolhida) {
    return (
      <Moldura>
        <Seletor vitrines={marcas} />
      </Moldura>
    );
  }

  return (
    <Moldura>
      <Acervo
        vitrine={escolhida}
        outras={marcas}
        aba={abaValida(searchParams?.aba)}
        busca={searchParams?.q ?? ""}
        filtro={{
          temporada: searchParams?.temporada ?? "",
          colecao: searchParams?.colecao ?? "",
          ano: searchParams?.ano ?? "",
        }}
      />
    </Moldura>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}

/**
 * De qual marca ver a vitrine.
 *
 * `<Link>` e não botão com `router.push`: a escolha é uma navegação, então o
 * link já faz tudo — e sem `"use client"` a tela não manda JavaScript nenhum
 * para o navegador só para trocar de URL. Também ganha abrir em nova aba, que
 * um `onClick` não dá.
 */
function Seletor({ vitrines }: { vitrines: Vitrine[] }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <p className="text-center text-sm text-muted-foreground">
        De qual marca você deseja ver a vitrine?
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {vitrines.map((v) => (
          <Link
            key={v.slug}
            href={`/vendas/vitrine?vitrine=${encodeURIComponent(v.slug)}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-vendas hover:bg-vendas/5"
          >
            <Store className="h-5 w-5 shrink-0 text-vendas-text" aria-hidden />
            <span className="min-w-0">
              <span className="block truncate font-medium">{v.label}</span>
              <span className="text-xs text-muted-foreground">{resumoDoAcervo(v)}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Texto do campo de busca por aba — o mesmo do Connect. */
const BUSCA_POR_ABA: Record<AbaDaVitrine, string> = {
  fotos: "Buscar foto",
  videos: "Buscar vídeo",
  workshop: "Buscar workshop",
  material: "Buscar material",
};

function Acervo({
  vitrine: v,
  outras,
  aba,
  busca,
  filtro,
}: {
  vitrine: Vitrine;
  outras: Vitrine[];
  aba: AbaDaVitrine;
  busca: string;
  filtro: FiltroDaColecao;
}) {
  const link = linkDaVitrine(v.slug);

  /*
   * As opções dos seletores saem do conteúdo da ABA ATUAL e ANTES da busca — é
   * o que o Connect faz, e pelos dois motivos: oferecer uma temporada que só
   * existe nos vídeos enquanto se olham as fotos é prometer resultado vazio, e
   * derivá-las do que já está filtrado apagaria do seletor justamente a opção
   * que a pessoa precisa clicar para TROCAR de recorte.
   */
  const daAba =
    aba === "fotos" ? v.fotos : aba === "material" ? v.documentos : videosDaAba(v.videos, aba);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pb-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{v.label}</h2>
          <p className="text-xs text-muted-foreground">
            {v.setor} · {resumoDoAcervo(v)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* Trocar de marca sem voltar: com duas vitrines, obrigar a passar
              pelo seletor é um clique a mais para a comparação mais comum. */}
          {outras
            .filter((o) => o.slug !== v.slug)
            .map((o) => (
              <Link
                key={o.slug}
                href={`/vendas/vitrine?vitrine=${encodeURIComponent(o.slug)}`}
                className="rounded-lg border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Ver {o.label}
              </Link>
            ))}
          {link && (
            /* `rel="noreferrer"` junto do `noopener`: o Referer entregaria a
               rota interna do Flow ao outro serviço. */
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-vendas-text transition-colors hover:bg-secondary"
            >
              Abrir no Build.Connect
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
        </div>
      </header>

      {v.truncado && (
        <p className="pb-2 text-xs text-muted-foreground">
          Mostrando os primeiros itens — há mais no Build.Connect.
        </p>
      )}

      <Abas slug={v.slug} atual={aba} />

      <div className="space-y-4 pt-4">
        {/*
          `key={aba}` remonta os controles ao trocar de aba. Sem isso o campo
          continuaria exibindo o texto digitado na aba anterior enquanto a URL
          (que o link da aba limpou) já não tem busca nenhuma — a lista viria
          inteira e o campo diria que ela está filtrada.
        */}
        <VitrineFiltros
          key={aba}
          placeholder={BUSCA_POR_ABA[aba]}
          opcoes={opcoesDaColecao(daAba)}
          atual={{ q: busca, ...filtro }}
        />

        {aba === "fotos" && <Fotos itens={filtrarAcervo(v.fotos, busca, filtro)} />}
        {(aba === "videos" || aba === "workshop") && (
          <Videos itens={filtrarAcervo(videosDaAba(v.videos, aba), busca, filtro)} aba={aba} />
        )}
        {aba === "material" && <Materiais itens={filtrarAcervo(v.documentos, busca, filtro)} />}
      </div>
    </section>
  );
}

/**
 * As quatro abas.
 *
 * São LINKS, e não um widget com `role="tab"`: a troca é navegação de verdade
 * (a URL muda e o servidor refaz o recorte), e anunciar `tablist` ao leitor de
 * tela prometeria navegação por setas que estes links não têm. `aria-current`
 * diz onde a pessoa está sem mentir sobre o que o controle é.
 *
 * O LINK NÃO LEVA BUSCA NEM FILTRO: trocar de aba começa um recorte novo, como
 * no Connect. Carregar a busca da aba anterior faria a aba nova abrir vazia, e
 * a pessoa concluiria que não há material nela.
 */
function Abas({ slug, atual }: { slug: string; atual: AbaDaVitrine }) {
  return (
    <nav
      aria-label="Seções da vitrine"
      className="-mb-px flex flex-wrap gap-1 border-b border-border"
    >
      {ABAS_DA_VITRINE.map((a) => {
        const ativa = a.id === atual;
        return (
          <Link
            key={a.id}
            href={`/vendas/vitrine?vitrine=${encodeURIComponent(slug)}&aba=${a.id}`}
            aria-current={ativa ? "page" : undefined}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              ativa
                ? "border-vendas text-vendas-text"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {a.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center">
      <p className="text-sm text-muted-foreground">{texto}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Ajuste a busca ou os filtros de temporada, coleção e ano.
      </p>
    </div>
  );
}

/**
 * Baixar.
 *
 * `download` com o nome montado aqui, e não um link simples: a entrega do
 * Connect não manda nome de arquivo, então sem isto o arquivo chegaria ao
 * computador como "arquivo", sem extensão. Funciona porque a rota é da MESMA
 * origem — o atributo é ignorado em link cruzado.
 */
function Baixar({ href, nome }: { href: string; nome: string }) {
  return (
    <a
      href={href}
      download={nome}
      className="inline-flex items-center gap-1 text-xs font-medium text-vendas-text transition-colors hover:underline"
    >
      <Download className="h-3 w-3" aria-hidden />
      Baixar
    </a>
  );
}

function Fotos({ itens }: { itens: FotoDaVitrine[] }) {
  if (itens.length === 0) return <Vazio texto="Nenhuma foto encontrada." />;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {itens.map((f) => {
        const url = urlDoArquivo("foto", f.id);
        return (
          <figure key={f.id} className="overflow-hidden rounded-lg border border-border">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block aspect-square bg-secondary/40"
            >
              {/* next/image exigiria um loader para servir uma rota dinâmica
                  autenticada; a <img> simples entrega o mesmo com menos peça. */}
              <img
                src={url}
                alt={f.title}
                loading="lazy"
                className="h-full w-full object-cover transition-opacity hover:opacity-90"
              />
            </a>
            <figcaption className="space-y-1 p-2">
              <p className="truncate text-sm" title={f.title}>
                {f.title}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {[f.temporada, f.colecao, dataCurta(f.createdAt)].filter(Boolean).join(" · ")}
              </p>
              <Baixar href={url} nome={nomeParaBaixar(f.title, f.extensao)} />
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

function Videos({ itens, aba }: { itens: VideoDaVitrine[]; aba: AbaDaVitrine }) {
  if (itens.length === 0) {
    return <Vazio texto={`Nenhum ${aba === "workshop" ? "workshop" : "vídeo"} encontrado.`} />;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {itens.map((v) => {
        const url = urlDoArquivo("video", v.id);
        return (
          <article key={v.id} className="overflow-hidden rounded-lg border border-border">
            {v.temArquivo ? (
              /*
               * `preload="metadata"`: com vários cartões na tela, "auto"
               * começaria a baixar todos os vídeos de uma vez. O seek funciona
               * porque a rota repassa o Range do navegador.
               */
              <video
                controls
                preload="metadata"
                poster={v.temMiniatura ? urlDoArquivo("miniatura", v.id) : undefined}
                src={url}
                className="aspect-video w-full bg-black"
              />
            ) : (
              /* O item EXISTE no Connect, sem mídia anexada. Mostrar um player
                 que não toca faria a pessoa culpar a conexão dela. */
              <div className="flex aspect-video items-center justify-center bg-secondary/40 px-3 text-center text-xs text-muted-foreground">
                Sem mídia anexada no Build.Connect.
              </div>
            )}
            {/* Corpo na proporcao do cartao do Connect (`video-card.tsx`):
                titulo em UMA linha truncada, e nao quebrado em tres. A caixa do
                video ja era identica (`aspect-video` em `sm:grid-cols-2
                lg:grid-cols-3`); o que fazia o cartao do Flow crescer era o
                texto embaixo. */}
            <div className="space-y-0.5 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <span className="truncate" title={v.title}>{v.title}</span>
                {v.isNew && (
                  <span className="shrink-0 rounded-full bg-vendas/15 px-1.5 py-0.5 text-[0.625rem] font-medium uppercase text-vendas-text">
                    Novo
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {[rotuloDeTipoDeVideo(v.kind), v.temporada, v.colecao, dataCurta(v.createdAt)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {v.tags.length > 0 && (
                <p className="flex flex-wrap gap-1 pt-0.5">
                  {v.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-secondary px-1.5 py-0.5 text-[0.625rem] text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </p>
              )}
              {v.temArquivo && <Baixar href={url} nome={nomeParaBaixar(v.title, v.extensao)} />}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Materiais({ itens }: { itens: DocumentoDaVitrine[] }) {
  if (itens.length === 0) return <Vazio texto="Nenhum material encontrado." />;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {itens.map((d) => {
        const url = urlDoArquivo("documento", d.id);
        return (
          <li key={d.id} className="flex items-center gap-3 p-3">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              {/* Abre na aba o que o navegador renderiza (PDF, imagem) e baixa
                  o que ele não renderiza — o `Content-Disposition` vem do
                  Connect, que já decide isso para o acervo dele. */}
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title={d.name}
                className="block truncate text-sm font-medium transition-colors hover:text-vendas-text hover:underline"
              >
                {d.name}
              </a>
              <p className="truncate text-xs text-muted-foreground">
                {[
                  rotuloDeTipoDeArquivo(d.kind),
                  tamanhoLegivel(d.sizeBytes),
                  d.temporada,
                  d.colecao,
                  dataCurta(d.createdAt),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Baixar href={url} nome={nomeParaBaixar(d.name, d.extensao)} />
          </li>
        );
      })}
    </ul>
  );
}
