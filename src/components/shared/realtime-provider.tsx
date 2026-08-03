"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

type Role = "GESTAO" | "VENDAS" | "FINANCEIRO" | "LOGISTICA" | "MOTORISTA";

interface PollEvent {
  type: "order.created" | "order.updated";
  orderId: string;
  orderNumber?: string;
  customerName?: string;
  status?: string;
  notify?: boolean;
  ts: number;
}

interface PollResponse {
  now: number;
  bootstrap: boolean;
  events: PollEvent[];
}

/** Intervalo do polling do board. */
const POLL_MS = 4000;

/**
 * Provider de tempo real (montado no layout do dashboard).
 *
 * Transporte: POLLING curto a /api/events/poll (nao SSE). O proxy do ambiente
 * corta conexoes longas, entao usamos requisicoes curtas periodicas — atravessam
 * qualquer proxy sem config. A cada mudanca recebida, chama router.refresh(),
 * re-renderizando os Server Components (board Fluxo/Financeiro) sem reload e sem
 * perder o estado local (busca, modal aberto).
 *
 * Notificacao ativa (Web Notification) para o FINANCEIRO: disparada quando o
 * evento vem com notify=true. Depende de HTTPS (requisito do navegador); em HTTP
 * o board ainda atualiza normalmente, so o pop-up nao aparece.
 *
 * HIDRATACAO: UI (botao de opt-in) so renderiza apos montar no client (`mounted`).
 * Server e 1o render do client sao ambos `null` — sem mismatch. APIs de browser
 * so sao tocadas dentro de efeitos.
 */
export function RealtimeProvider({ role }: { role: Role }) {
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Papéis que recebem alerta ativo de novos itens:
  //  - FINANCEIRO: novo pedido para análise (→ /financeiro)
  //  - MOTORISTA: entrega disponível para coleta (→ /motorista)
  const wantsNotifications = role === "FINANCEIRO" || role === "MOTORISTA";

  // Conteúdo da Web Notification em foco, por papel. O Web Push a nível de SO
  // (via Service Worker) monta o próprio payload no servidor; isto aqui é só o
  // pop-up com a aba aberta.
  const notifConfig =
    role === "MOTORISTA"
      ? { title: "Entrega disponível para coleta", url: "/motorista", verbo: "aguardando entregador" }
      : { title: "Novo pedido para análise", url: "/financeiro", verbo: "aguardando aprovação financeira" };

  // Debounce do refresh: varias mudancas numa rajada => um unico refresh.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      router.refresh();
    }, 300);
  }, [router]);

  const maybeNotify = useCallback(
    (evt: PollEvent) => {
      if (
        !evt.notify ||
        !wantsNotifications ||
        typeof Notification === "undefined" ||
        Notification.permission !== "granted"
      ) {
        return;
      }
      const numero = evt.orderNumber ? `#${evt.orderNumber}` : "novo";
      const cliente = evt.customerName ? ` — ${evt.customerName}` : "";
      const n = new Notification(notifConfig.title, {
        body: `Pedido ${numero}${cliente} ${notifConfig.verbo}.`,
        tag: `order-${evt.orderId}`,
        icon: "/icon.svg",
      });
      n.onclick = () => {
        window.focus();
        window.location.href = notifConfig.url;
      };
    },
    [wantsNotifications, notifConfig],
  );

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // `since`: ultimo ts conhecido. Comeca em 0 (bootstrap: so sincroniza relogio).
    let since = 0;

    const tick = async () => {
      if (disposed) return;
      // Nao consulta com a aba em segundo plano (economiza requisicoes). Reassume
      // no proximo tick quando voltar a ficar visivel.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        schedule();
        return;
      }
      try {
        const res = await fetch(`/api/events/poll?since=${since}`, {
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        if (res.ok) {
          const data = (await res.json()) as PollResponse;
          since = data.now; // avanca o relogio para o proximo poll
          if (!data.bootstrap && data.events.length > 0) {
            // Houve mudanca => atualiza o board.
            scheduleRefresh();
            // Dispara notificacao para os eventos marcados (dedupe por tag/orderId).
            const seen = new Set<string>();
            for (const evt of data.events) {
              if (evt.notify && !seen.has(evt.orderId)) {
                seen.add(evt.orderId);
                maybeNotify(evt);
              }
            }
          }
        }
      } catch {
        // Rede instavel: ignora e tenta no proximo tick.
      } finally {
        schedule();
      }
    };

    const schedule = () => {
      if (disposed) return;
      timer = setTimeout(tick, POLL_MS);
    };

    // Primeira consulta imediata (bootstrap) para sincronizar o relogio.
    tick();

    // Ao voltar o foco para a aba, dispara um poll imediato (responsividade).
    const onVisible = () => {
      if (document.visibilityState === "visible" && !disposed) {
        if (timer) clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [scheduleRefresh, maybeNotify]);

  if (!mounted || !wantsNotifications) return null;
  return <NotificationOptIn />;
}

/**
 * Botao flutuante de opt-in. A Web Notifications API exige gesto do usuario
 * (clique) para pedir permissao. So e montado no client (via `mounted`), entao
 * pode ler `Notification` no estado inicial sem risco de hidratacao.
 *
 * Observacao: a permissao so e concedida/efetiva em HTTPS. Em HTTP o botao pode
 * aparecer, mas o navegador nao entrega a notificacao.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Registra o Service Worker e cria (ou reaproveita) a inscrição de Web Push,
 * enviando-a ao servidor. É o que habilita a notificação a nível de SO — chega
 * mesmo com o navegador minimizado. Requer HTTPS e a chave VAPID pública.
 * Silencioso se indisponível (cai na Web Notification em foco).
 */
async function registerPush(): Promise<void> {
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !vapid
  ) {
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // cast: a tipagem de lib-dom varia entre versões (Uint8Array vs BufferSource).
        applicationServerKey: urlBase64ToUint8Array(vapid) as unknown as BufferSource,
      });
    }
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
    });
  } catch (err) {
    console.error("[push] falha ao registrar:", err);
  }
}

function NotificationOptIn() {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );

  // Permissao ja concedida antes: garante SW + inscricao (idempotente).
  useEffect(() => {
    if (perm === "granted") void registerPush();
  }, [perm]);

  if (perm === "unsupported" || perm === "granted" || perm === "denied") {
    return null;
  }

  const ask = async () => {
    try {
      const result = await Notification.requestPermission();
      setPerm(result);
      if (result === "granted") await registerPush();
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      onClick={ask}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg transition hover:opacity-90"
      aria-label="Ativar notificações de novos pedidos"
    >
      <Bell className="h-4 w-4" />
      Ativar alertas de novos pedidos
    </button>
  );
}
