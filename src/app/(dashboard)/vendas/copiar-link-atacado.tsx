"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Cherry, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ensureMyReferralLink, linkGeralDoAtacado } from "@/lib/actions/wholesale-referral";
import type { ActionResult } from "@/types/action";

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

/**
 * As marcas na ordem em que aparecem na tela, com o rótulo e o ícone de cada.
 *
 * A LOV_CLUB saiu daqui em 17/10/2026 porque a LP dela ainda vestia o estilo da
 * OKEY e ia ser redesenhada. VOLTOU em 27/10/2026, com o redesenho feito: a
 * página tem identidade própria (ver `[data-brand="lov-club"]` no atacado.css)
 * e o botão ganhou a cor da marca.
 *
 * Nada além desta lista precisou mudar: `ensureMyReferralLink` sempre aceitou
 * as duas marcas, e a action nunca foi tocada — tirar o BOTÃO e não a ROTA foi
 * o que manteve, durante a pausa, o link já enviado a alguma lojista
 * funcionando.
 */
const MARCAS = [
  { brand: "OKEY", rotulo: "OKEY - Form", Icone: Cherry, variante: "okey" },
  { brand: "LOV_CLUB", rotulo: "Lov - Form", Icone: Heart, variante: "lov" },
] as const;

export function CopiarLinkAtacado() {
  return (
    <>
      {MARCAS.map((m) => (
        <BotaoDaMarca
          key={m.brand}
          rotulo={m.rotulo}
          Icone={m.Icone}
          variante={m.variante}
          aria={`Copiar link de indicação da ${m.rotulo}`}
          obterLink={() => ensureMyReferralLink(m.brand)}
        />
      ))}
    </>
  );
}

/**
 * Os links GERAIS, para a Gestão — um por marca.
 *
 * É a mesma página, SEM código de indicação: quem chega por aqui não tem
 * vendedora de origem e entra no rodízio — a candidatura ganha dona sozinha e
 * passa adiante a cada dia sem avaliação (ver `src/lib/wholesale-rodizio.ts`).
 *
 * A Gestão NÃO aparece nos botões por vendedora: ela usa a ferramenta
 * (decisões 15 e 16) mas não é destino de indicação, porque uma candidatura
 * precisa de uma vendedora como dona. Era por isso que, antes de 27/10/2026,
 * não existia caminho nenhum para a Gestão compartilhar a LP da Lov Club: o
 * botão por marca não é dela, e o link geral estava fixo em OKEY.
 *
 * Por que uma action própria e não montar a URL no navegador: a base vem de
 * `APP_BASE_URL`, variável de SERVIDOR lida em tempo de execução. Montar aqui
 * exigiria um `NEXT_PUBLIC_`, que o Next embute no BUILD — e este projeto
 * compila dentro da imagem Docker, então um valor definido só no runtime do
 * EasyPanel nunca chegaria. Mesma decisão 35 do link por vendedora.
 */
export function CopiarLinkGeral() {
  return (
    <>
      {MARCAS.map((m) => (
        <BotaoDaMarca
          key={m.brand}
          rotulo={m.rotulo}
          Icone={m.Icone}
          variante={m.variante}
          aria={`Copiar o link geral do formulário da ${m.rotulo}, que distribui as candidaturas entre as vendedoras`}
          obterLink={() => linkGeralDoAtacado(m.brand)}
        />
      ))}
    </>
  );
}

/**
 * Um botão de copiar link. A MARCA não entra aqui: o que muda entre os quatro
 * botões da tela é de onde o link vem, e isso chega como `obterLink`.
 *
 * Antes havia duas cópias desta lógica — uma por vendedora, outra para a
 * Gestão — e a segunda ficou para trás quando a primeira ganhou a Lov. Uma
 * cópia só é o que impede a próxima marca de nascer pela metade de novo.
 */
function BotaoDaMarca({
  rotulo,
  Icone,
  variante,
  aria,
  obterLink,
}: {
  rotulo: string;
  Icone: typeof Cherry;
  variante: (typeof MARCAS)[number]["variante"];
  aria: string;
  obterLink: () => Promise<ActionResult<{ link: string }>>;
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
        const res = await obterLink();
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
        variant={variante}
        onClick={copiar}
        disabled={pending}
        aria-label={aria}
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
