import type { Metadata, Viewport } from "next";

// noindex na Fase 1 (decisão 28): o funil é por indicação, e tráfego orgânico
// só produziria leads sem dono.
export const metadata: Metadata = {
  title: "Seja revendedora | OKEY",
  robots: { index: false, follow: false },
};

// themeColor próprio sobrescreve o azul do Build.Flow declarado no root layout
// (decisão 30). No Next 14 ele pertence ao `viewport`, não ao `metadata`.
export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function ProvaDeEscopo() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-3xl font-bold text-primary">Prova de escopo de tokens</h1>
      <p>
        Se esta página estiver bege com título rosa, o escopo funciona. Se
        estiver azul-escuro como o dashboard, não funciona.
      </p>
      <div className="rounded-md border bg-card p-4 text-card-foreground">
        Card usando os tokens escopados.
      </div>
      <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground">
        Botão primário
      </button>
    </main>
  );
}
