import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Busca de clientes para o combobox do formulario de pedidos.
//
// MOTIVO: a base tem dezenas de milhares de clientes. Renderizar todos em um
// <select> geraria um HTML gigantesco e travaria o celular da vendedora.
// Aqui a busca acontece no BANCO e devolve no maximo 20 resultados.
//
// ACESSO: VENDAS, GESTAO e FINANCEIRO. O Financeiro passou a poder criar
// pedidos (paridade com Vendas), entao precisa selecionar clientes no combobox.
//
// Uso: /api/customers/search?q=merc&limit=5
//
// LIMIT: opcional, e o chamador pede no maximo MAX_LIMIT. Cada tela escolhe
// quantas sugestoes quer (a adesao do Select mostra 5; o Novo Pedido, 20), mas
// o numero chega pelo NAVEGADOR — por isso e um teto que se aperta, nunca uma
// ordem: `?limit=100000` continua devolvendo 20.
const MAX_LIMIT = 20;
const DEFAULT_LIMIT = 20;

function parseLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !["VENDAS", "GESTAO", "FINANCEIRO"].includes(session.role)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = parseLimit(searchParams.get("limit"));

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
    take: limit, // ja limitado a MAX_LIMIT: protege o servidor e o cliente
    select: {
      id: true, code: true, name: true,
      cep: true, street: true, district: true, city: true, state: true, contact: true,
    },
  });

  return NextResponse.json({ customers });
}
