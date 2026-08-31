"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck, ShieldCheck } from "lucide-react";
import { verifyTrackingCode } from "@/lib/actions/tracking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Tela de verificação do cliente final.
 *
 * Única barreira do módulo: o link identifica o PEDIDO e o Código de Cliente
 * prova quem é o dono dele. Sem os dois, nada é exibido.
 */
export function TrackingGate({ token }: { token: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await verifyTrackingCode(token, code);
      // O acesso é liberado por cookie no servidor; o refresh faz a mesma
      // página voltar já com os dados do pedido.
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-vendas/10 blur-3xl" />

      <div className="w-full max-w-sm animate-fade-in-up">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <PackageCheck className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Build<span className="text-primary">.Flow</span>
          </h1>
          <p className="text-sm text-muted-foreground">Acompanhe o seu pedido</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-xl">
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
            <span>Informe o seu código de cliente para continuar.</span>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Código de cliente</Label>
              <Input
                id="code"
                name="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
                autoComplete="off"
                placeholder="Digite o seu código"
              />
            </div>
            {error && (
              <div className="animate-slide-down rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {error}
              </div>
            )}
            <Button type="submit" variant="brand" size="lg" className="w-full" disabled={pending}>
              {pending ? "Verificando..." : "Acessar"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Não sabe o seu código? Fale com a sua vendedora.
        </p>
      </div>
    </main>
  );
}
