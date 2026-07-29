"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

type Role = "GESTAO" | "VENDAS" | "FINANCEIRO" | "LOGISTICA" | "MOTORISTA";

interface RealtimePayload {
  type: "order.created" | "order.updated";
  orderId: string;
  orderNumber?: string;
  customerName?: string;
  status?: string;
  notify?: boolean;
  ts: number;
}

/**
 * Provider de tempo real (montado no layout do dashboard).
 *
 * Responsabilidades:
 * 1) Manter uma conexao SSE com /api/events (reconexao automatica nativa do
 *    EventSource; alem disso, um watchdog reabre se cair de vez).
 * 2) A cada evento de pedido, chamar router.refresh() com DEBOUNCE — isso
 *    re-renderiza os Server Components (board, listas) sem reload e sem perder
 *    estado local (busca, modal aberto). Substitui o polling de 2 min do Kanban
 *    por push instantaneo.
 * 3) Se o evento vier com notify=true (papel-alvo, ex.: FINANCEIRO em pedido
 *    novo nao-Troca), emitir uma Web Notification nativa — funciona mesmo com a
 *    aba em segundo plano.
 *
 * Fallback: se o navegador nao suportar EventSource, cai para polling de 30s.
 */
export function RealtimeProvider({ role }: { role: Role }) {
  const router = useRouter();

  // Debounce do refresh: varios eventos em rajada => um unico refresh.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      router.refresh();
    }, 400);
  }, [router]);

  // Só o Financeiro precisa do opt-in de notificacao ativa.
  const wantsNotifications = role === "FINANCEIRO";

  useEffect(() => {
    // Fallback: sem EventSource, mantem a tela atualizada por polling lento.
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      const id = setInterval(() => {
        if (document.visibilityState === "visible") router.refresh();
      }, 30_000);
      return () => clearInterval(id);
    }

    let es: EventSource | null = null;
    let watchdog: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    const handle = (raw: MessageEvent) => {
      let data: RealtimePayload | null = null;
      try {
        data = JSON.parse(raw.data) as RealtimePayload;
      } catch {
        return;
      }
      if (!data) return;

      // Reatividade para todos.
      scheduleRefresh();

      // Alerta ativo apenas quando o servidor marcou notify=true para este papel.
      if (
        data.notify &&
        wantsNotifications &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        const numero = data.orderNumber ? `#${data.orderNumber}` : "novo";
        const cliente = data.customerName ? ` — ${data.customerName}` : "";
        const n = new Notification("Novo pedido para análise", {
          body: `Pedido ${numero}${cliente} aguardando aprovação financeira.`,
          tag: `order-${data.orderId}`, // colapsa duplicatas do mesmo pedido
          icon: "/icon.svg",
        });
        n.onclick = () => {
          window.focus();
          window.location.href = "/financeiro";
        };
      }
    };

    const connect = () => {
      if (disposed) return;
      es = new EventSource("/api/events");
      es.addEventListener("order.created", handle);
      es.addEventListener("order.updated", handle);
      es.onerror = () => {
        // EventSource ja tenta reconectar sozinho; se fechar de vez, o watchdog
        // recria a conexao.
        if (es && es.readyState === EventSource.CLOSED) {
          es.close();
          es = null;
        }
      };
    };

    connect();

    // Watchdog: se a conexao morreu (es == null), reabre a cada 10s.
    watchdog = setInterval(() => {
      if (!disposed && es === null) connect();
    }, 10_000);

    return () => {
      disposed = true;
      if (watchdog) clearInterval(watchdog);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (es) es.close();
    };
  }, [router, scheduleRefresh, wantsNotifications]);

  // O Financeiro ve um botao discreto para conceder permissao de notificacao.
  if (!wantsNotifications) return null;
  return <NotificationOptIn />;
}

/**
 * Botao flutuante de opt-in. A Web Notifications API exige que o pedido de
 * permissao parta de um gesto do usuario (clique) — nao da para pedir sozinho no
 * load. Some quando a permissao ja foi concedida ou negada.
 */
function NotificationOptIn() {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    if (typeof Notification === "undefined") {
      setPerm("unsupported");
      return;
    }
    setPerm(Notification.permission);
  }, []);

  if (perm === "unsupported" || perm === "granted" || perm === "denied") {
    return null;
  }

  const ask = async () => {
    try {
      const result = await Notification.requestPermission();
      setPerm(result);
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

