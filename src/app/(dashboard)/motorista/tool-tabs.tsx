"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Truck, ClipboardList, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToolTab {
  href: string;
  label: string;
  icon: "entregas" | "chamados" | "dashboard";
}

const ICON = {
  entregas: <Truck className="h-4 w-4" />,
  chamados: <ClipboardList className="h-4 w-4" />,
  dashboard: <BarChart3 className="h-4 w-4" />,
};

// Ferramentas do modulo Motorista. Aba ativa = prefixo mais longo do pathname
// (assim /motorista/chamados/historico acende "Chamados", e /motorista/historico
// acende "Entregas").
export function ToolTabs({ tabs }: { tabs: ToolTab[] }) {
  const pathname = usePathname();
  let active: string | null = null;
  for (const t of tabs) {
    const hit = pathname === t.href || pathname.startsWith(t.href + "/");
    if (hit && (!active || t.href.length > active.length)) active = t.href;
  }

  return (
    <nav aria-label="Ferramentas do módulo Motorista" className="mb-6 flex flex-wrap gap-2">
      {tabs.map((t) => {
        const isActive = t.href === active;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-motorista bg-motorista/15 text-motorista"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {ICON[t.icon]}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
