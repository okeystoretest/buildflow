"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Navigation, Loader2, AlertTriangle, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { startTransportRoute } from "@/lib/transport/actions";
import { usePositionBroadcast } from "@/lib/transport/use-position-broadcast";

/**
 * Antes de iniciar: botao "Iniciar rota" -> startTransportRoute. Depois, e
 * enquanto nao concluir: liga o emissor de GPS e mostra o estado da transmissao.
 */
export function RouteController({
  requestId,
  started,
  finished = false,
  className,
}: {
  requestId: string;
  started: boolean;
  finished?: boolean;
  /** Aplicado ao invólucro do botão "Iniciar rota" (ex.: `flex-1` na linha de pílulas do card). */
  className?: string;
}) {
  const router = useRouter();
  const [isStarted, setIsStarted] = useState(started);
  const [startError, setStartError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const broadcasting = isStarted && !finished;
  const { state, lastSentLabel, error } = usePositionBroadcast(requestId, broadcasting);

  function iniciar() {
    setStartError(null);
    start(async () => {
      const res = await startTransportRoute({ requestId });
      if (res.ok) {
        setIsStarted(true);
        router.refresh();
      } else {
        setStartError(res.error);
      }
    });
  }

  if (finished) {
    return <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">Corrida encerrada.</p>;
  }

  if (!isStarted) {
    return (
      <div className={cn("space-y-1.5", className)}>
        <Button variant="motorista" className="h-11 w-full px-2" onClick={iniciar} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
          <span className="truncate">Iniciar rota</span>
        </Button>
        {startError && <p className="text-xs text-destructive">{startError}</p>}
      </div>
    );
  }

  const label =
    state === "sending"
      ? "Enviando posição…"
      : state === "acquiring"
        ? lastSentLabel
          ? `GPS ativo · último envio ${lastSentLabel}`
          : "GPS ativo · aguardando primeira leitura"
        : state === "denied"
          ? "Permissão de localização negada"
          : state === "error"
            ? (error ?? "Falha no GPS")
            : "GPS desligado";
  const problema = state === "denied" || state === "error";

  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
        problema ? "bg-destructive/10 text-destructive" : "bg-motorista/10 text-motorista"
      }`}
    >
      {problema ? <AlertTriangle className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
      {label}
    </div>
  );
}
