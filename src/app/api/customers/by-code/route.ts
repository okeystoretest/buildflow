import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * O CADASTRO DE UM CLIENTE, pelo código.
 *
 * Serve ao modal que abre ao clicar no nome de uma cliente (ver
 * `src/components/shared/customer-card-modal.tsx`). Uma consulta por abertura,
 * e só quando alguém clica: embutir o cadastro em cada linha de cada lista
 * mandaria endereço e contato de dezenas de clientes no HTML de telas que não
 * mostram nada disso.
 *
 * PELO CÓDIGO, e não pelo id, porque é o código que as telas JÁ carregam —
 * `customerCode` está nos cards do Fluxo, nos históricos, nas entregas e nas
 * listas do Select. Buscar por id obrigaria a acrescentar o id a uma dúzia de
 * consultas para não ganhar nada: `Customer.code` é `@unique`, então identifica
 * exatamente um cadastro.
 *
 * POR QUE NÃO REUSAR `/api/customers/search`: aquela rota faz `contains` em
 * nome e código e devolve no máximo 20 linhas. Procurar o código "1" ali traria
 * "10", "100", "1234" — e o cadastro certo poderia ficar FORA das 20, fazendo o
 * modal dizer "não encontrado" sobre um cliente que existe. Busca parcial e
 * identificação exata são perguntas diferentes.
 *
 * ACESSO: VENDAS, GESTAO e FINANCEIRO — exatamente os três papéis que já abrem
 * a tela de cadastro de clientes (`/vendas/clientes`) e a rota de busca. A
 * LOGISTICA e o MOTORISTA ficam de fora de propósito: o motorista vê o endereço
 * das entregas DELE, e isso não é o mesmo que poder abrir o cadastro de
 * qualquer cliente da base digitando um código.
 */
const PAPEIS = ["VENDAS", "GESTAO", "FINANCEIRO"];

/** Teto do código aceito. `Customer.code` é curto; o resto é entrada abusiva. */
const MAX_CODE = 64;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !PAPEIS.includes(session.role)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const code = (new URL(req.url).searchParams.get("code") ?? "").trim().slice(0, MAX_CODE);
  if (!code) return NextResponse.json({ error: "Codigo ausente" }, { status: 400 });

  const customer = await prisma.customer.findUnique({
    where: { code },
    // Só o cadastro. Pedidos e Selects da cliente NÃO entram: o modal responde
    // "quem é e onde está", e somar duas agregações a cada clique pagaria por
    // uma informação que ninguém pediu.
    select: {
      code: true,
      name: true,
      cep: true,
      street: true,
      district: true,
      city: true,
      state: true,
      contact: true,
    },
  });

  // 404 e não um objeto vazio: o código vem de uma linha que a tela acabou de
  // desenhar, então "não encontrado" aqui significa que o cadastro foi apagado
  // no meio do caminho — e o modal precisa poder dizer isso.
  if (!customer) return NextResponse.json({ error: "Cadastro nao encontrado" }, { status: 404 });

  return NextResponse.json({ customer });
}
