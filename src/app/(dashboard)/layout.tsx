import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logout } from "@/lib/actions/auth";
import { RealtimeProvider } from "@/components/shared/realtime-provider";
import { navParaSessao, CONFIG, type NavFlags } from "./nav";
import { Sidebar } from "./sidebar";
import { BarraSuperior } from "./barra-superior";
import type { Role } from "@prisma/client";

const ROLE_LABEL: Record<Role, string> = {
  GESTAO: "Gestão", VENDAS: "Vendas", FINANCEIRO: "Financeiro",
  LOGISTICA: "Logística", MOTORISTA: "Motorista",
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Acesso ao menu Logistica para VENDAS: SOMENTE se vinculado a loja(s) de
  // FLUXO SIMPLIFICADO. Vendas de loja de fluxo padrao nao veem o modulo.
  // (LOGISTICA/GESTAO ja entram pelos papeis do mapa.)
  const simplifiedLinked =
    session.role === "VENDAS"
      ? await prisma.user.count({
          where: {
            id: session.userId,
            originStores: { some: { active: true, simplifiedFlow: true } },
          },
        })
      : 0;

  // Quem abre a Analise de Clientes: a mesma regra da tela — Gestao, ou a
  // vendedora que opera atacado.
  const ator = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true, salesModel: true },
  });
  const podeAnalisar =
    ator?.role === "GESTAO" || (ator?.role === "VENDAS" && ator.salesModel === "ATACADO");

  const flags: NavFlags = {
    lojaSimplificada: simplifiedLinked > 0,
    podeAnalisar,
  };

  const modulos = navParaSessao(session.role, flags);
  const iniciais = session.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar
        modulos={modulos}
        user={{ nome: session.name, papel: ROLE_LABEL[session.role], iniciais }}
        podeConfigurar={CONFIG.roles.includes(session.role)}
        logoutAction={logout}
      />
      <div className="flex w-full min-w-0 flex-1 flex-col">
        <BarraSuperior modulos={modulos} podeConfigurar={CONFIG.roles.includes(session.role)} />
        <main className="min-w-0 flex-1 px-4 pb-6 pt-4 lg:px-8 animate-fade-in">
          {children}
        </main>
      </div>
      {/* Tempo real: conexao SSE (reatividade do board) + alerta de novos
          pedidos para o Financeiro. Renderiza no client, sem UI para os demais. */}
      <RealtimeProvider role={session.role} />
    </div>
  );
}
