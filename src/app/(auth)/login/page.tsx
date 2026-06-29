"use client";

import { useFormState, useFormStatus } from "react-dom";
import { PackageCheck } from "lucide-react";
import { login } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="brand" size="lg" className="w-full" disabled={pending}>
      {pending ? "Entrando..." : "Entrar"}
    </Button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(login, null);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* atmosfera: brilhos suaves */}
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
          <p className="text-sm text-muted-foreground">Logística e controle de vendas</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-xl">
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Usuário</Label>
              <Input id="email" name="email" type="text" required autoComplete="username" placeholder="Digite seu usuário" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" name="password" type="password" required autoComplete="current-password" placeholder="Digite sua senha" />
            </div>
            {state && !state.ok && (
              <div className="animate-slide-down rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {state.error}
              </div>
            )}
            <SubmitButton />
          </form>
        </div>
      </div>
    </main>
  );
}
