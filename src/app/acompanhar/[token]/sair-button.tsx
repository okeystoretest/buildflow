"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { leaveTracking } from "@/lib/actions/tracking";
import { Button } from "@/components/ui/button";

/** Encerra a consulta e devolve a tela de verificação (útil em aparelho compartilhado). */
export function SairButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => start(async () => { await leaveTracking(); router.refresh(); })}
    >
      <LogOut className="h-4 w-4" /> Sair
    </Button>
  );
}
