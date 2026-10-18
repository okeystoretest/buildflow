"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Cherry, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ensureMyReferralLink } from "@/lib/actions/wholesale-referral";

/**
 * Botões de link de indicação da vendedora de Atacado — um por marca.
 *
 * Era UM botão com a marca fixa em OKEY, porque só a LP da OKEY existia. As
 * duas existem agora (`/atacado/okey` e `/atacado/lov-club`), e a action já
 * aceitava as duas desde o início: o que faltava era a tela deixar escolher.
 *
 * CADA BOTÃO TEM O SEU ESTADO. São duas instâncias do mesmo componente, não um
 * componente com dois botões: copiar o link da OKEY não pode acender o "Link
 * copiado" da Lov nem apagar o erro dela. Um estado compartilhado faria a
 * vendedora achar que copiou o que não copiou — e o erro só apareceria no
 * celular da lojista, no link errado.
 *
 * `navigator.clipboard` pode REJEITAR (contexto não seguro, permissão negada,
 * documento sem foco). Aparentar sucesso nesse caso seria o pior resultado: a
 * vendedora colaria no WhatsApp o que quer que já estivesse na área de
 * transferência. Então a rejeição vira mensagem na tela.
 */

/** As marcas na ordem em que aparecem na tela, com o rótulo e o ícone de cada. */
const MARCAS = [
  { brand: "OKEY", rotulo: "OKEY - Form", Icone: Cherry },
  { brand: "LOV_CLUB", rotulo: "Lov - Form", Icone: Heart },
] as const;

export function CopiarLinkAtacado() {
  return (
    <>
      {MARCAS.map((m) => (
        <BotaoDaMarca key={m.brand} brand={m.brand} rotulo={m.rotulo} Icone={m.Icone} />
      ))}
    </>
  );
}

function BotaoDaMarca({
  brand,
  rotulo,
  Icone,
}: {
  brand: (typeof MARCAS)[number]["brand"];
  rotulo: string;
  Icone: typeof Cherry;
}) {
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
        const res = await ensureMyReferralLink(brand);
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
      {/* O rótulo nomeia a MARCA, e não a ação ("Copiar link"), porque com dois
          botões lado a lado o que a vendedora precisa distinguir é para qual
          marca o link vai. `aria-label` carrega a ação para quem usa leitor de
          tela, que não tem o contexto visual dos dois juntos. */}
      <Button
        type="button"
        variant="outline"
        onClick={copiar}
        disabled={pending}
        aria-label={`Copiar link de indicação da ${rotulo}`}
      >
        {copiado ? <Check className="h-4 w-4" /> : <Icone className="h-4 w-4" />}
        {copiado ? "Link copiado" : rotulo}
      </Button>
      {erro && (
        <span role="alert" className="self-center text-sm text-destructive">
          {erro}
        </span>
      )}
    </>
  );
}
