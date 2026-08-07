"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, Trash2, X } from "lucide-react";
import { markAllNotificationsRead, clearNotifications } from "@/lib/actions/notifications";

interface NotificationItem {
  id: string;
  message: string;
  orderId: string | null;
  read: boolean;
  createdAt: string;
}

// Intervalo de atualização do sino (mais lento que o board — não é crítico).
const POLL_MS = 20000;

function fmt(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * Central de Notificações no cabeçalho. Consulta /api/notifications
 * periodicamente e ao abrir; mostra a contagem de não lidas num badge. Ao
 * abrir, marca tudo como lido. Cada item leva ao pedido (Vendas), onde a
 * pendência aparece destacada.
 *
 * Só renderiza no client (evita mismatch de hidratação com o horário relativo).
 */
export function NotificationBell() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [pending, start] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store", headers: { accept: "application/json" } });
      if (!res.ok) return;
      const data = (await res.json()) as { unread: number; items: NotificationItem[] };
      setItems(data.items ?? []);
      setUnread(data.unread ?? 0);
    } catch {
      /* rede instável: mantém o estado atual */
    }
  }, []);

  // Polling + primeira carga. Pausa com a aba em segundo plano.
  useEffect(() => {
    if (!mounted) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (disposed) return;
      if (typeof document === "undefined" || document.visibilityState !== "hidden") {
        await load();
      }
      timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => { disposed = true; if (timer) clearTimeout(timer); };
  }, [mounted, load]);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function toggle() {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && unread > 0) {
      // Otimista: zera o badge e persiste no servidor.
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      start(async () => { await markAllNotificationsRead(); });
    }
  }

  function goTo(n: NotificationItem) {
    setOpen(false);
    // As pendências aparecem destacadas na listagem de Vendas.
    router.push("/vendas");
    router.refresh();
  }

  function clearAll() {
    start(async () => {
      const res = await clearNotifications();
      if (res.ok) { setItems([]); setUnread(0); }
    });
  }

  if (!mounted) {
    // Placeholder estável no SSR/1º render (sem badge, sem horário relativo).
    return (
      <button className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground" aria-label="Notificações">
        <Bell className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={toggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Notificações"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-border bg-card shadow-2xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-sm font-semibold">Notificações</p>
            <div className="flex items-center gap-1">
              {items.length > 0 && (
                <button
                  onClick={clearAll}
                  disabled={pending}
                  className="flex items-center gap-1 rounded p-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label="Limpar todas"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Limpar
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
                <Check className="h-6 w-6 opacity-40" />
                Nenhuma notificação.
              </div>
            ) : (
              <ul>
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => goTo(n)}
                      className={`flex w-full flex-col items-start gap-0.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-secondary/60 ${
                        n.read ? "" : "bg-primary/5"
                      }`}
                    >
                      <span className="text-sm leading-snug">{n.message}</span>
                      <span className="text-[11px] text-muted-foreground">{fmt(n.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
