"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, ShoppingCart, Wallet, PackageCheck, Truck, Settings2, KanbanSquare,
} from "lucide-react";

export interface NavLink {
  href: string;
  label: string;
}

// Ícone por href (mantido no client para não cruzar a fronteira RSC).
const ICON: Record<string, React.ReactNode> = {
  "/dashboard": <LayoutDashboard className="h-4 w-4" />,
  "/fluxo": <KanbanSquare className="h-4 w-4" />,
  "/vendas": <ShoppingCart className="h-4 w-4" />,
  "/financeiro": <Wallet className="h-4 w-4" />,
  "/logistica": <PackageCheck className="h-4 w-4" />,
  "/motorista": <Truck className="h-4 w-4" />,
  "/gestao": <Settings2 className="h-4 w-4" />,
};

// Cor de destaque (pílula + faixa superior) por seção. A chave é o href base.
const ACCENT: Record<string, { bar: string; pill: string; text: string }> = {
  "/dashboard":  { bar: "border-t-vendas",       pill: "bg-vendas text-vendas-fg",             text: "text-vendas" },
  "/fluxo":      { bar: "border-t-white",         pill: "bg-white text-slate-900",             text: "text-white" },
  "/vendas":     { bar: "border-t-vendas",        pill: "bg-vendas text-vendas-fg",             text: "text-vendas" },
  "/financeiro": { bar: "border-t-financeiro",    pill: "bg-financeiro text-financeiro-fg",     text: "text-financeiro" },
  "/logistica":  { bar: "border-t-distribuicao",  pill: "bg-distribuicao text-distribuicao-fg", text: "text-distribuicao" },
  "/motorista":  { bar: "border-t-motorista",     pill: "bg-motorista text-motorista-fg",       text: "text-motorista" },
  "/gestao":     { bar: "border-t-brand",         pill: "bg-brand text-brand-fg",               text: "text-brand" },
};

const DEFAULT_ACCENT = { bar: "border-t-transparent", pill: "bg-primary text-primary-foreground", text: "text-primary" };

// Retorna o href da seção ativa a partir do pathname (prefixo mais específico).
function activeHref(pathname: string, links: NavLink[]): string | null {
  let best: string | null = null;
  for (const l of links) {
    if (pathname === l.href || pathname.startsWith(l.href + "/")) {
      if (!best || l.href.length > best.length) best = l.href;
    }
  }
  return best;
}

export function TopBarAccent({ links, children }: { links: NavLink[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = activeHref(pathname, links);
  const accent = (active && ACCENT[active]) || DEFAULT_ACCENT;
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-t-4 border-border bg-card/80 backdrop-blur-xl transition-colors",
        accent.bar,
      )}
    >
      {children}
    </header>
  );
}

export function NavLinks({ links, mobile = false }: { links: NavLink[]; mobile?: boolean }) {
  const pathname = usePathname();
  const active = activeHref(pathname, links);

  return (
    <>
      {links.map((item) => {
        const isActive = item.href === active;
        const accent = ACCENT[item.href] || DEFAULT_ACCENT;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 font-medium transition-colors",
              mobile ? "py-1.5 text-sm" : "py-2 text-sm",
              isActive
                ? accent.pill + " shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {ICON[item.href]}
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
