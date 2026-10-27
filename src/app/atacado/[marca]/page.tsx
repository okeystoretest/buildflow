import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBrandContent } from "@/lib/wholesale-content";
import { getSession } from "@/lib/auth";
import { lerManifesto } from "@/lib/lp-assets-server";
import { ModoEdicaoProvider } from "./modo-edicao";
import { ApplyForm } from "./apply-form";
import { Abertura, Cabecalho, Metricas, Motivos, Perguntas, Rodape, Vantagens } from "./sections";

// robots, themeColor e a identidade da página vêm do layout do mundo (decisões
// 28 e 30); aqui só o que varia por marca.
//
// Rota DINÂMICA de propósito: lê `?r=` para atribuir o cadastro à vendedora que
// compartilhou o link. Por isso não há `generateStaticParams` (não prerenderiza
// nada aqui; não o recoloque esperando isso). Slug inválido vira 404 por
// `getBrandContent` + `notFound()`.

export async function generateMetadata(props: { params: Promise<{ marca: string }> }): Promise<Metadata> {
  const params = await props.params;
  const marca = getBrandContent(params.marca);
  if (!marca) return {};
  const nome = marca.content.brandName;
  return {
    title: `Seja revendedora | ${nome}`,
    // Descrição por marca: o preview do WhatsApp — único canal por onde este
    // link circula — herdava a do dashboard e anunciava a marca da lojista como
    // "Logística e controle de vendas".
    // Do módulo travado pelo digest, não escrita aqui: é a afirmação comercial
    // MAIS exposta da página (o preview do WhatsApp é a primeira coisa que a
    // lojista lê) e era a única que omitia a condição da margem.
    description: marca.content.metaDescription,
    openGraph: {
      title: `Seja revendedora | ${nome}`,
      description: `Cadastro de lojista para revender ${nome}.`,
      type: "website",
    },
  };
}

export default async function MarcaPage(
  props: {
    params: Promise<{ marca: string }>;
    searchParams: Promise<{ r?: string | string[] }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const marca = getBrandContent(params.marca);
  if (!marca) notFound();

  const nome = marca.content.brandName;

  // `?r=` identifica a vendedora que indicou. Repetido na URL (`?r=a&r=b`)
  // chega como lista; pega a primeira em vez de quebrar. Sem o parâmetro, o
  // cadastro entra sem dono e fica com a Gestão.
  const r = Array.isArray(searchParams.r) ? searchParams.r[0] : searchParams.r;

  // As imagens trocáveis pelo dono (spec de 16/10). Lugar sem entrada cai no
  // espaço reservado — é o que mantém a página correta antes de qualquer upload
  // e se o manifesto for apagado.
  const assets = await lerManifesto(params.marca);

  // Quem pode editar. A LP é pública: sem cookie de sessão isto é null sem
  // tocar o banco, então o visitante comum não paga consulta nenhuma. E este
  // booleano não autoriza nada — a Server Action reconfere o papel no servidor.
  const session = await getSession();
  const podeEditar = session?.role === "GESTAO";

  // Ordem: abertura → condições → por que revender → por que escolher →
  // perguntas → cadastro. As perguntas vêm ANTES do cadastro de propósito,
  // seguindo a referência do dono: responder a objeção antes de pedir 18 campos
  // converte melhor que pedir primeiro e explicar depois. É divergência da
  // ordem original da spec, registrada para emenda.
  // `data-brand`: o gancho da identidade por marca. Vai AQUI e não no layout
  // porque o layout está acima de `[marca]` e não recebe o parâmetro. O slug
  // já passou por `getBrandContent`, então só "okey" ou "lov-club" chegam —
  // slug inválido virou 404 lá em cima.
  return (
    <div data-brand={params.marca}>
    <ModoEdicaoProvider podeEditar={podeEditar} marcaSlug={params.marca}>
      <Cabecalho brandName={nome} />
      <main>
        <Abertura brandName={nome} assets={assets} highlights={marca.content.highlights} />
        <Metricas celulas={marca.content.metrics} />
        <Motivos reasons={marca.content.reasons} brandName={nome} assets={assets} />
        <Vantagens advantages={marca.content.advantages} />
        <Perguntas faq={marca.content.faq} />

        <section
          id="requerimento"
          className="faixa bg-[hsl(var(--secondary))]"
          aria-labelledby="cadastro-titulo"
        >
          <div className="interno py-20 lg:py-28">
            <div className="mx-auto max-w-[56rem]">
              <h2 id="cadastro-titulo" className="titulo-secao">
                Faça parte da {nome}
              </h2>
              <div className="mt-4 h-px w-12 bg-[hsl(var(--primary))]" aria-hidden="true" />
              {/* Sem prometer contato, prazo ou acesso a catálogo: não existe
                  canal de saída nesta feature (decisão 7). */}
              <p className="corpo mt-6 text-[hsl(var(--muted-foreground))]">
                Preencha o cadastro para a nossa equipe analisar a sua candidatura.
              </p>
              <div className="mt-10">
                <ApplyForm brandSlug={params.marca} referralCode={r ?? null} />
              </div>
            </div>
          </div>
        </section>
      </main>
      <Rodape
        brandName={nome}
        privacidade={marca.content.privacidade}
        contato={marca.content.contato}
      />
    </ModoEdicaoProvider>
    </div>
  );
}
