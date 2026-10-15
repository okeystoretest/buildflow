import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBrandContent } from "@/lib/wholesale-content";
import { ApplyForm } from "./apply-form";
import { Abertura, Motivos, Perguntas, Vantagens } from "./sections";

// robots e themeColor vêm do layout do mundo (decisões 28 e 30); aqui só o que
// varia por marca.
//
// Rota DINÂMICA de propósito: lê `?r=` para atribuir o cadastro à vendedora que
// compartilhou o link. Por isso não há `generateStaticParams` (não prerenderiza
// nada aqui; não o recoloque esperando isso). Slug inválido vira 404 por
// `getBrandContent` + `notFound()`.

export function generateMetadata({ params }: { params: { marca: string } }): Metadata {
  const marca = getBrandContent(params.marca);
  if (!marca) return {};
  return { title: `Seja revendedora | ${marca.content.brandName}` };
}

export default function MarcaPage({
  params,
  searchParams,
}: {
  params: { marca: string };
  searchParams: { r?: string | string[] };
}) {
  const marca = getBrandContent(params.marca);
  if (!marca) notFound();

  // `?r=` identifica a vendedora que indicou. Repetido na URL (`?r=a&r=b`)
  // chega como lista; pega a primeira em vez de quebrar. Sem o parâmetro, o
  // cadastro entra sem dono e fica com a Gestão.
  const r = Array.isArray(searchParams.r) ? searchParams.r[0] : searchParams.r;

  // A ordem é a da planilha, que a especificação chamou de "dispostas
  // sequencialmente conforme otimização de UX": abertura → por que revender →
  // por que escolher → cadastro → perguntas. As seções sangram de ponta a
  // ponta (`faixa`) e medem o conteúdo por dentro (`interno`), então o <main>
  // não tem largura nem respiro próprios.
  return (
    <main>
      <Abertura brandName={marca.content.brandName} />
      <Motivos reasons={marca.content.reasons} />
      <Vantagens advantages={marca.content.advantages} />
      <section id="requerimento" className="faixa faixa-alta" aria-labelledby="cadastro-titulo">
        <div className="interno">
          <h2 id="cadastro-titulo" className="cabeca-secao cabeca-placa">
            <span>Cadastro</span>
          </h2>
          {/* mt menor que nas outras seções de propósito: o honeypot do
              formulário é o primeiro filho do <form> e o `space-y` já soma um
              espaço antes da primeira placa. */}
          <div className="mt-5">
            <ApplyForm brandSlug={params.marca} referralCode={r ?? null} />
          </div>
        </div>
      </section>
      <Perguntas faq={marca.content.faq} brandName={marca.content.brandName} />
    </main>
  );
}
