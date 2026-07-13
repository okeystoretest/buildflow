import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Busca de clientes para o combobox do formulario de pedidos.
//
// MOTIVO: a base tem dezenas de milhares de clientes. Renderizar todos em um
// <select> geraria um HTML gigantesco e travaria o celular da vendedora.
// Aqui a busca acontece no BANCO e devolve no maximo 20 resultados.
//
// Uso: /api/customers/search?q=merc
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !["VENDAS", "GESTAO"].includes(session.role)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();

  // Sem termo: devolve os primeiros (por nome) apenas para popular a lista
  // inicial. Nunca a base inteira.
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { code: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { name: "asc" },
    take: 20, // teto rigido: protege o servidor e o cliente
    select: { id: true, code: true, name: true },
  });

  return NextResponse.json({ customers });
}
