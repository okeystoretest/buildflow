"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

/**
 * Sincroniza filtros de uma listagem com a URL (query string), aplicando de
 * forma AUTOMATICA — sem botoes "Filtrar"/"Limpar".
 *
 * Comportamento (Requisito transversal de busca em tempo real):
 *  - Campos de TEXTO (debounced): a navegacao so dispara apos `delay` ms sem
 *    digitar, evitando uma requisicao a cada tecla.
 *  - Campos INSTANTANEOS (datas, selects): aplicam imediatamente ao mudar.
 *  - Toda mudanca zera a paginacao (?page) para nao "sumir" resultados.
 *  - Chaves com valor vazio sao removidas da URL (limpeza simplificada).
 *
 * Uso:
 *   const f = useFilterQuery({ busca: defaultBusca }, { instant: { de, ate } });
 *   <input value={f.text.busca} onChange={e => f.setText("busca", e.target.value)} />
 *   <input type="date" value={f.instant.de} onChange={e => f.setInstant("de", e.target.value)} />
 *   <button onClick={() => f.clear("busca")} />   // limpa so o texto
 *
 * O hook nao conhece as rotas: ele usa o pathname atual e reescreve os params.
 */
export function useFilterQuery<
  T extends Record<string, string>,
  I extends Record<string, string> = Record<string, never>,
>(
  textDefaults: T,
  opts?: { instant?: I; delay?: number },
) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const delay = opts?.delay ?? 400;

  const [text, setTextState] = useState<T>(textDefaults);
  const [instant, setInstantState] = useState<I>((opts?.instant ?? {}) as I);

  // Snapshot do estado ja refletido na URL — para nao renavegar a toa.
  const applied = useRef<Record<string, string>>({ ...textDefaults, ...(opts?.instant ?? {}) });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Reescreve a URL com os campos deste hook, PRESERVANDO os params que ele nao
   * gerencia.
   *
   * Antes a URL era montada do zero, e so as chaves daqui sobreviviam. Isso
   * fazia com que DOIS controles na mesma tela fossem impossiveis: cada
   * navegacao apagava o que o outro tinha escrito. E uma tela so passou a ter
   * dois (Analise de Clientes, 30/10/2026: a busca saiu da barra de filtros e
   * foi para o bloco de Candidaturas).
   *
   * Preservar tambem e o comportamento certo sozinho: um hook que gerencia
   * `busca` nao tem por que apagar `status`.
   *
   * `limparOutros` existe para o `clearAll`, que significa "nenhum filtro nesta
   * tela" e nao "nenhum dos meus": com ele a URL volta a ser montada do zero.
   */
  const navigate = useCallback(
    (merged: Record<string, string>, limparOutros = false) => {
      const params = new URLSearchParams(limparOutros ? "" : (search?.toString() ?? ""));
      for (const [k, v] of Object.entries(merged)) {
        const limpo = (v ?? "").trim();
        // O `delete` do vazio e obrigatorio agora: partindo da URL atual, nao
        // escrever a chave deixaria o valor ANTIGO dela em pe.
        if (limpo) params.set(k, limpo);
        else params.delete(k);
      }
      // Nova busca/filtro sempre volta para a primeira pagina.
      params.delete("page");
      const qs = params.toString();
      applied.current = merged;
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, search],
  );

  // Aplica campos de TEXTO com debounce.
  useEffect(() => {
    const merged = { ...text, ...instant };
    // Nada mudou frente ao que ja esta na URL: nao navega.
    const changed = Object.keys(merged).some((k) => (merged[k] ?? "") !== (applied.current[k] ?? ""));
    if (!changed) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate(merged), delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const setText = useCallback((key: keyof T, value: string) => {
    setTextState((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Varios campos INSTANTANEOS de uma vez, numa navegacao so.
  //
  // Existe porque chamar setInstant duas vezes seguidas (limpar "de" e "ate",
  // por exemplo) navega DUAS vezes: a URL final fica certa, mas empilha duas
  // entradas no historico e o botao Voltar precisa de dois cliques para
  // desfazer uma acao.
  const setInstantMany = useCallback(
    (patch: Partial<I>) => {
      setInstantState((prev) => {
        const nextInstant = { ...prev, ...patch } as I;
        if (timer.current) clearTimeout(timer.current);
        navigate({ ...text, ...nextInstant });
        return nextInstant;
      });
    },
    [navigate, text],
  );

  // Campos INSTANTANEOS aplicam na hora (sem esperar debounce).
  const setInstant = useCallback(
    (key: keyof I, value: string) => {
      setInstantMany({ [key]: value } as Partial<I>);
    },
    [setInstantMany],
  );

  // Limpa um campo de texto (usado pelo "X"): aplica imediatamente.
  const clear = useCallback(
    (key: keyof T) => {
      setTextState((prev) => {
        const next = { ...prev, [key]: "" } as T;
        if (timer.current) clearTimeout(timer.current);
        navigate({ ...next, ...instant });
        return next;
      });
    },
    [navigate, instant],
  );

  /**
   * Zera TODOS os campos numa navegacao so.
   *
   * Existe porque `clear` + `setInstantMany` em sequencia NAO resolve: cada um
   * navega com a sua metade lida do closure do render atual, entao o segundo
   * reescreve na URL o valor que o primeiro acabou de apagar. E mesmo sem isso
   * seriam duas entradas no historico, e o Voltar precisaria de dois cliques
   * para desfazer um clique.
   *
   * `patch` existe para o campo que tem um estado de REPOUSO diferente de
   * vazio: na Analise de Clientes, limpar os filtros devolve o periodo ao mes
   * vigente, nao ao nada. Sem isso o controle ficaria dizendo "sem periodo"
   * enquanto o servidor aplica o mes.
   */
  const clearAll = useCallback(
    (patch?: Partial<I>) => {
      const textZerado = Object.fromEntries(
        Object.keys(text).map((k) => [k, ""]),
      ) as T;
      const instantZerado = {
        ...(Object.fromEntries(Object.keys(instant).map((k) => [k, ""])) as I),
        ...(patch ?? {}),
      } as I;
      if (timer.current) clearTimeout(timer.current);
      setTextState(textZerado);
      setInstantState(instantZerado);
      // `true`: limpar os filtros limpa os da TELA, inclusive os de um controle
      // que viva fora deste hook (a busca da Analise de Clientes).
      navigate({ ...textZerado, ...instantZerado }, true);
    },
    [navigate, text, instant],
  );

  return { text, instant, setText, setInstant, setInstantMany, clear, clearAll };
}
