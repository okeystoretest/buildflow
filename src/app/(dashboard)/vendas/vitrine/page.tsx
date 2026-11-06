import { AlertTriangle, ExternalLink, FileText, Image as ImageIcon, Store, Video } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { BackButton } from "@/components/shared/back-button";
import { buscarVitrine, linkDaVitrine } from "@/lib/integration/connect-vitrine";
import {
  dataCurta,
  resumoDoAcervo,
  rotuloDeTipoDeArquivo,
  rotuloDeTipoDeVideo,
  tamanhoLegivel,
  vitrinesComAcervo,
} from "@/lib/vitrine";

/**
 * VITRINE — o acervo de fotos, vídeos e documentos vindo do Build.Connect.
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

export default async function VitrinePage() {
  await requireRole(["VENDAS", "GESTAO", "FINANCEIRO"]);

  const resposta = await buscarVitrine();

  return (
    <div className="space-y-4">
      <div>
        <BackButton href="/vendas" />
        <PageHeader
          titulo="Vitrine"
          descricao="Fotos, vídeos e documentos publicados no Build.Connect."
          corTitulo="text-vendas-text"
        />
      </div>

      {!resposta.ok ? (
        /* O MOTIVO APARECE NA TELA, não só no log: sem ele a pessoa não sabe
           se esperar, se avisar alguém, ou se o problema é ela. */
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
      ) : vitrinesComAcervo(resposta.vitrines).length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <Store className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm text-muted-foreground">
            Nenhum material publicado nas vitrines do Build.Connect.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {vitrinesComAcervo(resposta.vitrines).map((v) => {
            const link = linkDaVitrine(v.slug);
            return (
              <section key={v.slug} className="rounded-xl border border-border bg-card p-4">
                <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pb-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">{v.label}</h2>
                    <p className="text-xs text-muted-foreground">
                      {v.setor} · {resumoDoAcervo(v)}
                    </p>
                  </div>
                  {link && (
                    /* `rel="noreferrer"` junto do `noopener`: o Referer
                       entregaria a rota interna do Flow ao outro serviço. */
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-vendas-text transition-colors hover:bg-secondary"
                    >
                      Abrir no Build.Connect
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  )}
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
          })}
        </div>
      )}
    </div>
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
      {vazio ? (
        <p className="text-xs text-muted-foreground">Nada aqui.</p>
      ) : (
        <ul className="space-y-1.5">{children}</ul>
      )}
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
