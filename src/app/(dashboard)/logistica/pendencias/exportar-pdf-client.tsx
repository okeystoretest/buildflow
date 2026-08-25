"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Botão "Gerar Relatório PDF".
 *
 * Reenvia à rota de exportação os MESMOS filtros que estão na URL (busca,
 * situação e período), tirando apenas `page`: o PDF é do recorte inteiro, não
 * da página que está na tela.
 *
 * O download passa por `fetch` + Blob em vez de um link direto porque assim dá
 * para exibir o estado "Gerando..." e mostrar a mensagem de erro do servidor;
 * com <a download> uma falha viraria uma aba em branco com JSON.
 */
export function ExportarPendenciasPdf({ total }: { total: number }) {
  const params = useSearchParams();
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function baixar() {
    if (gerando) return;
    setGerando(true);
    setErro(null);

    try {
      const query = new URLSearchParams(params.toString());
      query.delete("page");

      const res = await fetch(`/api/logistica/pendencias/pdf?${query.toString()}`, {
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
      a.download = `relatorio-pendencias-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Libera a memória do Blob assim que o navegador inicia o download.
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gerar o relatório.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        type="button"
        variant="distribuicao"
        onClick={baixar}
        disabled={gerando || total === 0}
        title={total === 0 ? "Nenhuma pendência para exportar" : "Exporta os pedidos do filtro atual"}
      >
        {gerando ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Gerando PDF...
          </>
        ) : (
          <>
            <FileDown className="h-4 w-4" /> Gerar Relatório PDF
          </>
        )}
      </Button>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}
