"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * BAIXAR RELATÓRIO — o PDF gerencial do recorte que está na tela.
 *
 * SEM MODAL DE PERÍODO, ao contrário do relatório do Histórico de Vendas. Lá o
 * relatório é um documento com um recorte declarado, e a tela é só navegação;
 * aqui foi pedido "o PDF do que a tela já mostra", então a barra de filtros É a
 * escolha do recorte. Um segundo lugar para escolher período deixaria a pessoa
 * com dois recortes abertos ao mesmo tempo e um arquivo que não bate com os
 * números que ela está olhando.
 *
 * OS PARÂMETROS SÃO REENVIADOS UM A UM, e não `searchParams` inteiro: status,
 * busca, motivo e compra ficam de fora de propósito — são os filtros que
 * distorcem o painel (a taxa de aprovação de um recorte "só aprovadas" é 100%),
 * e a rota os ignora pelo mesmo motivo. Mandá-los daria a impressão de que
 * valem.
 *
 * `fetch` + Blob em vez de <a download> para poder mostrar "Gerando..." e a
 * mensagem de erro do servidor; com o link direto uma falha viraria uma aba em
 * branco com JSON.
 */
const PARAMS_DO_RECORTE = ["de", "ate", "vendedora", "brand", "estado", "cidade"] as const;

export function RelatorioDaAnalise() {
  const params = useSearchParams();
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function baixar() {
    if (gerando) return;
    setGerando(true);
    setErro(null);
    try {
      const query = new URLSearchParams();
      for (const chave of PARAMS_DO_RECORTE) {
        const valor = params.get(chave);
        if (valor) query.set(chave, valor);
      }
      const res = await fetch(`/api/vendas/analise-clientes/pdf?${query.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const detalhe = await res.json().catch(() => null);
        throw new Error(detalhe?.error ?? "Falha ao gerar o relatório.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analise-clientes-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gerar o relatório.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="vendas" onClick={baixar} disabled={gerando}>
        {gerando ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <FileDown className="h-4 w-4" aria-hidden />
        )}
        {gerando ? "Gerando..." : "Relatório em PDF"}
      </Button>
      {/* O erro fica NO BOTÃO, não num toast: quem clicou está olhando para
          aqui, e um aviso que some sozinho faz a pessoa clicar de novo. */}
      {erro && (
        <span role="alert" className="text-xs text-destructive">
          {erro}
        </span>
      )}
    </div>
  );
}
