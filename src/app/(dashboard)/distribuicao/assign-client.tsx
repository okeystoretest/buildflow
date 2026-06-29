"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignDriver } from "@/lib/actions/deliveries";
import { Button } from "@/components/ui/button";

export function AtribuirMotorista({
  deliveryId,
  drivers,
}: {
  deliveryId: string;
  drivers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [driverId, setDriverId] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run() {
    if (!driverId) return;
    setError(null);
    start(async () => {
      const res = await assignDriver(deliveryId, driverId);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        value={driverId}
        onChange={(e) => setDriverId(e.target.value)}
      >
        <option value="">Motorista...</option>
        {drivers.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <Button
        variant="distribuicao"
        size="sm"
        onClick={run}
        disabled={pending || !driverId}
      >
        {pending ? "..." : "Atribuir"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
