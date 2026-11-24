"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRegistrarPendencia } from "./pendencias";

/**
 * Estado de uma seção de linhas com UM salvamento só.
 *
 * As quatro seções (entregas, métricas, OKRs e pauta) fazem a mesma coisa:
 * editam linhas em memória e gravam a seção inteira. O gancho existe para que
 * esse comportamento — inclusive o "Salvar" só acender quando algo mudou —
 * seja um, e não quatro parecidos.
 *
 * `sujo` sai de COMPARAR O JSON com o estado inicial, e não de um sinalizador
 * por campo: digitar e desfazer volta a seção a limpo, como qualquer editor
 * decente faz, e isso não se consegue com uma flag que só sabe ligar.
 */
export function useSecao<T extends { id: string }>(
  iniciais: readonly T[],
  enviar: (rows: readonly T[]) => Promise<{ ok: boolean; error?: string }>,
) {
  const router = useRouter();
  const [rows, setRows] = useState<readonly T[]>(iniciais);
  const [base, setBase] = useState(() => JSON.stringify(iniciais));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const sujo = useMemo(() => JSON.stringify(rows) !== base, [rows, base]);

  const alterar = useCallback((id: string, patch: Partial<T>) => {
    setSalvo(false);
    setRows((atuais) => atuais.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  /**
   * Acrescenta uma linha no fim.
   *
   * O `id` é DE MENTIRA e serve só de chave do React enquanto a linha não foi
   * gravada. Nas seções livres a action APAGA e RECRIA tudo, identificando a
   * linha pela posição — então o id que vai daqui é ignorado de propósito (o
   * schema o descarta), e não há como colidir com um id de verdade.
   */
  const adicionar = useCallback((row: Omit<T, "id">) => {
    setSalvo(false);
    setRows((atuais) => [...atuais, { ...row, id: `nova-${Date.now()}-${atuais.length}` } as T]);
  }, []);

  const remover = useCallback((id: string) => {
    setSalvo(false);
    setRows((atuais) => atuais.filter((r) => r.id !== id));
  }, []);

  const salvar = useCallback(async () => {
    if (salvando) return false;
    setSalvando(true);
    setErro(null);
    const r = await enviar(rows);
    setSalvando(false);
    if (!r.ok) {
      setErro(r.error ?? "Não foi possível salvar.");
      return false;
    }
    // A nova base é o que ACABOU de ser gravado: sem isto, o "Salvar"
    // continuaria aceso depois de um salvamento bem-sucedido.
    setBase(JSON.stringify(rows));
    setSalvo(true);
    // O refresh atualiza o que o SERVIDOR calcula (contadores do card, média
    // de 4 semanas) — a tela não recalcula esses números sozinha.
    router.refresh();
    return true;
  }, [enviar, rows, salvando, router]);

  // O "Salvar" do cabeçalho grava por aqui.
  useRegistrarPendencia(sujo, salvar);

  return { rows, alterar, adicionar, remover, sujo, salvar, salvando, erro, salvo };
}

/**
 * Texto do campo → número, aceitando a VÍRGULA brasileira.
 *
 * Vazio devolve `undefined`, que é um estado de verdade: a planilha trazia
 * "—" em toda linha não apurada, e zero diria que a medição foi feita e deu
 * zero.
 */
export function lerNumero(texto: string): number | undefined {
  const limpo = texto.trim().replace(",", ".");
  if (limpo === "") return undefined;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : undefined;
}

/** Número → texto do campo, com vírgula. */
export function escreverNumero(valor?: number): string {
  if (valor === undefined) return "";
  return String(valor).replace(".", ",");
}
