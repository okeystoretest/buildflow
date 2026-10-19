import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Building2,
  CreditCard,
  History,
  Landmark,
  Star,
  Tag,
  Truck,
} from "lucide-react";

/**
 * A BARRA DE FERRAMENTAS DO FINANCEIRO.
 *
 * Uma fileira de botões iguais, cada um levando a uma ROTA. É o mesmo arranjo
 * da tela de Vendas (`Button asChild` + `Link`, variante `outline`, ícone à
 * esquerda), e virou isso por dois motivos:
 *
 *  - Os quatro cadastros abriam INLINE, empurrando o Kanban de análise tela
 *    abaixo toda vez que alguém ia cadastrar um banco — e fechando sozinhos ao
 *    trocar de ferramenta, sem jeito de manter dois abertos nem de voltar.
 *  - Sem rota, não havia link para mandar a ninguém: "cadastra o CNPJ" não
 *    tinha endereço.
 *
 * Com isso o componente deixou de ter estado e deixou de ser `"use client"`:
 * são sete links. O título "Ferramentas do Financeiro" saiu junto — a fileira
 * de botões já se explica, e o rótulo só ocupava a primeira linha.
 */

const FERRAMENTAS = [
  { href: "/financeiro/ferramentas/pagamento", label: "Formas de Pagamento", icon: CreditCard },
  { href: "/financeiro/ferramentas/bancos", label: "Bancos", icon: Landmark },
  { href: "/financeiro/ferramentas/status", label: "Status de Pagamento", icon: Tag },
  { href: "/financeiro/ferramentas/cnpj", label: "CNPJ", icon: Building2 },
  { href: "/financeiro/historico", label: "Histórico de Pedidos", icon: History },
  { href: "/financeiro/entregas", label: "Pagamentos de Motoristas", icon: Truck },
  { href: "/financeiro/select", label: "Select", icon: Star },
] as const;

export function FinanceiroFerramentas() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {FERRAMENTAS.map((f) => (
        <Button key={f.href} asChild variant="outline">
          <Link href={f.href}>
            <f.icon className="h-4 w-4" /> {f.label}
          </Link>
        </Button>
      ))}
    </div>
  );
}
