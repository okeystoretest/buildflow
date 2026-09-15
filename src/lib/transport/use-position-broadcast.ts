"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pushTransportPosition } from "@/lib/transport/actions";

/**
 * Emissor de posicao do app do motorista (porta do Build.Connect).
 *
 * Liga navigator.geolocation.watchPosition() e envia pontos via
 * pushTransportPosition, com throttle DUPLO no cliente para nao inundar o
 * Postgres: tempo minimo entre envios e deslocamento minimo. O envio e o unico
 * efeito colateral — nada e renderizado por este hook.
 */

const MIN_INTERVAL_MS = 12_000;
const MIN_DISTANCE_M = 25;

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type BroadcastState = "idle" | "acquiring" | "sending" | "error" | "denied";

export function usePositionBroadcast(
  requestId: string | null,
  active: boolean,
): { state: BroadcastState; lastSentLabel: string | null; error: string | null } {
  const [state, setState] = useState<BroadcastState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const lastSentAt = useRef(0);
  const lastPoint = useRef<{ lat: number; lng: number } | null>(null);
  const sending = useRef(false);

  const send = useCallback(
    async (coords: GeolocationCoordinates) => {
      if (!requestId || sending.current) return;
      const now = Date.now();
      if (now - lastSentAt.current < MIN_INTERVAL_MS) return;
      if (lastPoint.current) {
        const moved = distanceMeters(lastPoint.current.lat, lastPoint.current.lng, coords.latitude, coords.longitude);
        if (moved < MIN_DISTANCE_M) return;
      }
      sending.current = true;
      setState("sending");
      try {
        const result = await pushTransportPosition({
          requestId,
          lat: coords.latitude,
          lng: coords.longitude,
          heading: typeof coords.heading === "number" && !Number.isNaN(coords.heading) ? coords.heading : undefined,
          speed: typeof coords.speed === "number" && !Number.isNaN(coords.speed) ? coords.speed * 3.6 : undefined,
        });
        if (result.ok) {
          lastSentAt.current = now;
          lastPoint.current = { lat: coords.latitude, lng: coords.longitude };
          setLastSent(new Date());
          setError(null);
          setState("acquiring");
        } else {
          setError(result.error);
          setState("error");
        }
      } catch {
        setError("Falha ao enviar posição.");
        setState("error");
      } finally {
        sending.current = false;
      }
    },
    [requestId],
  );

  useEffect(() => {
    if (!requestId || !active) {
      setState("idle");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("error");
      setError("Geolocalização indisponível neste dispositivo.");
      return;
    }
    setState("acquiring");
    const watchId = navigator.geolocation.watchPosition(
      (pos) => void send(pos.coords),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setState("denied");
          setError("Permissão de localização negada.");
        } else {
          setState("error");
          setError("Não foi possível obter a localização.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [requestId, active, send]);

  const lastSentLabel = lastSent
    ? lastSent.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return { state, lastSentLabel, error };
}
