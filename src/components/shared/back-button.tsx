"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// Botao de voltar para a tela anterior.
export function BackButton({ href, label = "Voltar" }: { href?: string; label?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => (href ? router.push(href) : router.back())}
      className="mb-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
