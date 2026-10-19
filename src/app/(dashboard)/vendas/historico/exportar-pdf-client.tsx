"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { FileDown, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * RELATÓRIO DE VENDAS — botão no topo da tela, período escolhido num modal.
 *
 * O PERÍODO DO RELATÓRIO É O DO MODAL, não o dos filtros da tela. São duas
 * perguntas diferentes: a tela é navegação (a pessoa vai mexendo), o relatório
 * é um documento com um recorte declarado. Os dois campos nascem preenchidos
 * com o período que estiver na URL — quem já filtrou não digita de novo.
 *
 * O filtro de COMANDA continua indo junto, lido da URL: ele restringe o que a
 * pessoa está vendo, e um PDF que ignorasse a comanda traria pedidos que a tela
 * não mostra.
 *
 * `Baixar` só habilita com as duas pontas preenchidas e na ordem certa. Período
 * pela metade é o que a tela já faz; aqui foi pedido um período, e `de` depois
 * de `ate` gera silenciosamente um relatório vazio.
 *
 * Radix Dialog como em `assign-modal.tsx`: traz foco preso, ESC e overlay sem
 * código próprio.
 *
 * O download passa por `fetch` + Blob em vez de link direto porque assim dá
 * para exibir "Gerando..." e mostrar a mensagem de erro do servidor; com
 * <a download> uma falha viraria uma aba em branco com JSON.
 */
export function RelatorioDeVendas({
  defaultDe,
  defaultAte,
}: {
  defaultDe: string;
  defaultAte: string;
}) {
  const params = useSearchParams();
  const [aberto, setAberto] = useState(false);
  const [de, setDe] = useState(defaultDe);
  const [ate, setAte] = useState(defaultAte);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const invertido = de !== "" && ate !== "" && de > ate;
  const podeBaixar = de !== "" && ate !== "" && !invertido;

  async function baixar() {
    if (gerando || !podeBaixar) return;
    setGerando(true);
    setErro(null);

    try {
      const query = new URLSearchParams();
      // Só a comanda vem da tela; o período é o que a pessoa acabou de
      // escolher, e `page` nunca entra: o PDF é do recorte inteiro.
      const comanda = params.get("comanda");
      if (comanda) query.set("comanda", comanda);
      query.set("de", de);
      query.set("ate", ate);

      const res = await fetch(`/api/vendas/historico/pdf?${query.toString()}`, {
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
      a.download = `relatorio-vendas-${de}-a-${ate}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Libera a memória do Blob assim que o navegador inicia o download.
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setAberto(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gerar o relatório.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <Dialog.Root
      open={aberto}
      onOpenChange={(o) => {
        // Fechar no meio da geração deixaria o download órfão sem aviso.
        if (gerando) return;
        setAberto(o);
        if (o) setErro(null);
      }}
    >
      <Dialog.Trigger asChild>
        <Button type="button" variant="vendas">
          <FileDown className="h-4 w-4" /> Relatório de Vendas
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-lg font-semibold">Relatório de Vendas</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                Escolha o período. O PDF traz vendedora, número do pedido e valor.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="rounded-md p-1 text-muted-foreground hover:text-foreground"
              aria-label="Fechar"
              disabled={gerando}
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="mt-4 flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="relatorio-de">De</Label>
              <Input
                id="relatorio-de"
                type="date"
                value={de}
                disabled={gerando}
                onChange={(e) => setDe(e.target.value)}
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="relatorio-ate">Até</Label>
              <Input
                id="relatorio-ate"
                type="date"
                value={ate}
                disabled={gerando}
                onChange={(e) => setAte(e.target.value)}
              />
            </div>
          </div>

          {/* Diz POR QUE o botão está travado: botão desabilitado sem motivo
              visível manda a pessoa procurar o campo que falta. */}
          {invertido ? (
            <p className="mt-2 text-xs text-destructive">
              A data inicial é posterior à final.
            </p>
          ) : (
            !podeBaixar && (
              <p className="mt-2 text-xs text-muted-foreground">
                Preencha as duas datas para habilitar o download.
              </p>
            )
          )}

          {erro && <p className="mt-2 text-sm text-destructive">{erro}</p>}

          <div className="mt-5 flex gap-2">
            <Button variant="vendas" onClick={baixar} disabled={!podeBaixar || gerando}>
              {gerando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Gerando PDF...
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4" /> Baixar
                </>
              )}
            </Button>
            <Dialog.Close asChild>
              <Button variant="outline" disabled={gerando}>
                Cancelar
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
