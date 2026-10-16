"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ensureMyReferralLink } from "@/lib/actions/wholesale-referral";

/**
 * Botão "Copiar link de indicação" da vendedora de Atacado.
 *
 * A marca é fixa em OKEY: a LP de atacado desta entrega é a da OKEY. Quando a
 * Lov Club tiver a sua, o ponto de troca é este (a action já aceita as duas).
 *
 * `navigator.clipboard` pode REJEITAR (contexto não seguro, permissão negada,
 * documento sem foco). Aparentar sucesso nesse caso seria o pior resultado: a
 * vendedora colaria no WhatsApp o que quer que já estivesse na área de
 * transferência. Então a rejeição vira mensagem na tela.
 */
export function CopiarLinkAtacado() {
  const [pending, startTransition] = useTransition();
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Não deixa o timer disparar setState depois de a página desmontar.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function copiar() {
    setErro(null);
    startTransition(async () => {
      // Dois try/catch separados de propósito: se a chamada à action falhar
      // (sessão expirada, banco fora), mandar a vendedora "verificar a área de
      // transferência" seria um diagnóstico errado apontando para o lugar errado.
      let link: string;
      try {
        const res = await ensureMyReferralLink("OKEY");
        if (!res.ok) {
          setErro(res.error);
          return;
        }
        link = res.data.link;
      } catch {
        setErro("Não foi possível obter o link agora. Recarregue a página e tente novamente.");
        return;
      }
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        setCopiado(false);
        setErro("Não foi possível copiar o link. Verifique a permissão da área de transferência.");
        return;
      }
      setCopiado(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopiado(false), 2000);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={copiar} disabled={pending}>
        {copiado ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
        {copiado ? "Link copiado" : "Copiar link de indicação"}
      </Button>
      {erro && (
        <span role="alert" className="self-center text-sm text-destructive">
          {erro}
        </span>
      )}
    </>
  );
}
