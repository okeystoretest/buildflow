import Link from "next/link";
import { AlertTriangle, ExternalLink, FileText, Image as ImageIcon, Store, Video } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { buscarVitrine, linkDaVitrine, type Vitrine } from "@/lib/integration/connect-vitrine";
import {
  dataCurta,
  resumoDoAcervo,
  rotuloDeTipoDeArquivo,
  rotuloDeTipoDeVideo,
  tamanhoLegivel,
} from "@/lib/vitrine";

/**
 * VITRINE — o acervo de fotos, vídeos e documentos vindo do Build.Connect.
 *
 * ESCOLHE A MARCA PRIMEIRO, como o Fluxo de Pedidos escolhe a loja (pedido do
 * dono, 06/11/2026): sem `?vitrine=`, a tela pergunta qual. Cada marca tem
 * vitrine própria no Connect (OKEY e Lov Club), e empilhar as duas numa página
 * só faria a pessoa rolar por material de uma marca para achar o da outra.
 *
 * SOMENTE LEITURA. Quem publica material é o Connect; duas telas que editam o
 * mesmo acervo discordariam na primeira edição simultânea.
 *
 * MOSTRA O QUE EXISTE, NÃO O ARQUIVO. O binário continua no Connect, atrás do
 * portão de lá (que confere papel e lotação por pedido, inclusive material
 * sensível). Reservir o arquivo daqui obrigaria esta tela a redecidir quem pode
 * baixar o quê — e uma segunda cópia dessa regra é a forma mais silenciosa de
 * furar a primeira. O link leva ao Connect, onde o portão já está.
 */
export const dynamic = "force-dynamic";

export default async function VitrinePage(props: {
  searchParams?: Promise<{ vitrine?: string }>;
}) {
  await requireRole(["VENDAS", "GESTAO", "FINANCEIRO"]);

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
      <Acervo vitrine={escolhida} outras={marcas} />
    </Moldura>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      {children}
    </div>
  );
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

function Acervo({ vitrine: v, outras }: { vitrine: Vitrine; outras: Vitrine[] }) {
  const link = linkDaVitrine(v.slug);
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Grupo titulo="Fotos" icone={<ImageIcon className="h-3.5 w-3.5" aria-hidden />} vazio={v.fotos.length === 0}>
          {v.fotos.map((f) => (
            <Item key={f.id} titulo={f.title} detalhe={dataCurta(f.createdAt)} />
          ))}
        </Grupo>

        <Grupo titulo="Vídeos" icone={<Video className="h-3.5 w-3.5" aria-hidden />} vazio={v.videos.length === 0}>
          {v.videos.map((vd) => (
            <Item
              key={vd.id}
              titulo={vd.title}
              detalhe={[rotuloDeTipoDeVideo(vd.kind), dataCurta(vd.createdAt)].filter(Boolean).join(" · ")}
              destaque={vd.isNew}
            />
          ))}
        </Grupo>

        <Grupo titulo="Documentos" icone={<FileText className="h-3.5 w-3.5" aria-hidden />} vazio={v.documentos.length === 0}>
          {v.documentos.map((d) => (
            <Item
              key={d.id}
              titulo={d.name}
              detalhe={[rotuloDeTipoDeArquivo(d.kind), tamanhoLegivel(d.sizeBytes)].filter(Boolean).join(" · ")}
            />
          ))}
        </Grupo>
      </div>
    </section>
  );
}

function Grupo({
  titulo,
  icone,
  vazio,
  children,
}: {
  titulo: string;
  icone: React.ReactNode;
  vazio: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-secondary/40 p-3">
      <h3 className="flex items-center gap-1.5 pb-2 text-[0.6875rem] font-semibold uppercase tracking-widest text-muted-foreground">
        {icone}
        {titulo}
      </h3>
      {vazio ? <p className="text-xs text-muted-foreground">Nada aqui.</p> : <ul className="space-y-1.5">{children}</ul>}
    </div>
  );
}

function Item({ titulo, detalhe, destaque }: { titulo: string; detalhe: string; destaque?: boolean }) {
  return (
    <li className="min-w-0">
      <p className="flex items-center gap-1.5 truncate text-sm" title={titulo}>
        <span className="min-w-0 truncate">{titulo}</span>
        {destaque && (
          <span className="shrink-0 rounded-full bg-vendas/15 px-1.5 py-0.5 text-[0.625rem] font-medium uppercase text-vendas-text">
            Novo
          </span>
        )}
      </p>
      {detalhe && <p className="truncate text-xs text-muted-foreground">{detalhe}</p>}
    </li>
  );
}
