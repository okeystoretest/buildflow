import { redirect } from "next/navigation";
import { getSession, destroySession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  switch (session.role) {
    case "VENDAS":
      redirect("/vendas");
    case "FINANCEIRO":
      redirect("/financeiro");
    case "LOGISTICA":
      redirect("/logistica");
    case "MOTORISTA":
      redirect("/motorista");
    case "GESTAO":
      redirect("/dashboard");
    default:
      // Sessao com papel desconhecido (ex: cookie antigo). Limpa e manda ao login.
      await destroySession();
      redirect("/login");
  }
}
