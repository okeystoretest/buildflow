"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

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
  const delay = opts?.delay ?? 400;

  const [text, setTextState] = useState<T>(textDefaults);
  const [instant, setInstantState] = useState<I>((opts?.instant ?? {}) as I);

  // Snapshot do estado ja refletido na URL — para nao renavegar a toa.
  const applied = useRef<Record<string, string>>({ ...textDefaults, ...(opts?.instant ?? {}) });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = useCallback(
    (merged: Record<string, string>) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(merged)) {
        if (v && v.trim()) params.set(k, v.trim());
      }
      // Nova busca/filtro sempre volta para a primeira pagina.
      params.delete("page");
      const qs = params.toString();
      applied.current = merged;
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router],
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

  // Campos INSTANTANEOS aplicam na hora (sem esperar debounce).
  const setInstant = useCallback(
    (key: keyof I, value: string) => {
      setInstantState((prev) => {
        const nextInstant = { ...prev, [key]: value } as I;
        if (timer.current) clearTimeout(timer.current);
        navigate({ ...text, ...nextInstant });
        return nextInstant;
      });
    },
    [navigate, text],
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

  return { text, instant, setText, setInstant, clear };
}
