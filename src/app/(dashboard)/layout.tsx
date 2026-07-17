import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { TopBarAccent, NavLinks, type NavLink as NavLinkT } from "./nav-client";
import { PackageCheck, LogOut } from "lucide-react";
import type { Role } from "@prisma/client";

interface NavItem { href: string; label: string; roles: Role[]; }

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Rank de Vendas", roles: ["GESTAO", "VENDAS"] },
  { href: "/fluxo", label: "Fluxo de Pedidos", roles: ["GESTAO", "VENDAS", "FINANCEIRO"] },
  { href: "/vendas", label: "Vendas", roles: ["GESTAO", "VENDAS"] },
  { href: "/financeiro", label: "Financeiro", roles: ["GESTAO", "FINANCEIRO"] },
  { href: "/logistica", label: "Logística", roles: ["GESTAO", "LOGISTICA"] },
  { href: "/motorista", label: "Motorista", roles: ["GESTAO", "MOTORISTA"] },
  { href: "/gestao", label: "Gestão", roles: ["GESTAO"] },
];

const ROLE_LABEL: Record<Role, string> = {
  GESTAO: "Gestão", VENDAS: "Vendas", FINANCEIRO: "Financeiro",
  LOGISTICA: "Logística", MOTORISTA: "Motorista",
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const items = NAV.filter((n) => n.roles.includes(session.role));
  const navLinks: NavLinkT[] = items.map((n) => ({ href: n.href, label: n.label }));
  const initials = session.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="flex min-h-screen flex-col">
      <TopBarAccent links={navLinks}>
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
              <NavLinks links={navLinks} />
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
          <NavLinks links={navLinks} mobile />
        </nav>
      </TopBarAccent>
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 lg:px-8 animate-fade-in">
        {children}
      </main>
    </div>
  );
}
