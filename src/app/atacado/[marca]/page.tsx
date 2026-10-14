import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBrandContent } from "@/lib/wholesale-content";
import { ApplyForm } from "./apply-form";

// robots e themeColor vêm do layout do mundo (decisões 28 e 30); aqui só o que
// varia por marca.
export function generateStaticParams() {
  return [{ marca: "okey" }, { marca: "lov-club" }];
}

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

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <h1 className="text-3xl font-bold text-primary">
        Seja revendedora {marca.content.brandName}
      </h1>
      <ApplyForm brandSlug={params.marca} referralCode={r ?? null} />
    </main>
  );
}
