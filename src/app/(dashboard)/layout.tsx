import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  LayoutDashboard, ShoppingCart, Wallet, PackageCheck, Truck, Settings2, LogOut, KanbanSquare,
} from "lucide-react";
import type { Role } from "@prisma/client";

interface NavItem { href: string; label: string; icon: React.ReactNode; roles: Role[]; }

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Rank de Vendas", icon: <LayoutDashboard className="h-4 w-4" />, roles: ["GESTAO", "VENDAS"] },
  { href: "/fluxo", label: "Fluxo de Pedidos", icon: <KanbanSquare className="h-4 w-4" />, roles: ["GESTAO", "VENDAS", "FINANCEIRO"] },
  { href: "/vendas", label: "Vendas", icon: <ShoppingCart className="h-4 w-4" />, roles: ["GESTAO", "VENDAS"] },
  { href: "/financeiro", label: "Financeiro", icon: <Wallet className="h-4 w-4" />, roles: ["GESTAO", "FINANCEIRO"] },
  { href: "/logistica", label: "Logística", icon: <PackageCheck className="h-4 w-4" />, roles: ["GESTAO", "LOGISTICA"] },
  { href: "/motorista", label: "Motorista", icon: <Truck className="h-4 w-4" />, roles: ["GESTAO", "MOTORISTA"] },
  { href: "/gestao", label: "Gestão", icon: <Settings2 className="h-4 w-4" />, roles: ["GESTAO"] },
];

const ROLE_LABEL: Record<Role, string> = {
  GESTAO: "Gestão", VENDAS: "Vendas", FINANCEIRO: "Financeiro",
  LOGISTICA: "Logística", MOTORISTA: "Motorista",
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const items = NAV.filter((n) => n.roles.includes(session.role));
  const initials = session.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 lg:px-8">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <PackageCheck className="h-5 w-5" />
              </div>
              <span className="text-lg font-bold tracking-tight">
                Build<span className="text-primary">.Flow</span>
              </span>
            </Link>
            <nav className="hidden items-center gap-1 lg:flex">
              {items.map((item) => (
                <Link key={item.href} href={item.href}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                  {item.icon}{item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="hidden items-center gap-2 sm:flex">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                {initials}
              </div>
              <div className="text-left">
                <p className="text-sm font-medium leading-tight">{session.name}</p>
                <p className="text-xs leading-tight text-muted-foreground">{ROLE_LABEL[session.role]}</p>
              </div>
            </div>
            <form action={logout}>
              <Button variant="ghost" size="icon" type="submit" aria-label="Sair">
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
        {/* nav mobile */}
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-border px-3 py-2 lg:hidden">
          {items.map((item) => (
            <Link key={item.href} href={item.href}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">
              {item.icon}{item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 lg:px-8 animate-fade-in">
        {children}
      </main>
    </div>
  );
}
