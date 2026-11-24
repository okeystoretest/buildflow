"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * O "Salvar" que grava a semana inteira.
 *
 * Os blocos do relatório guardam o que foi digitado em estado local e gravam
 * cada um por conta própria — é o que impede uma sexta interrompida no meio
 * das métricas de perder as entregas já respondidas. Só que o cabeçalho (e,
 * depois, o "Próximo" do fluxo em etapas) precisa de um salvamento de fora:
 * concluir não pode deixar texto para trás.
 *
 * Em vez de subir o estado dos blocos para o pai, CADA BLOCO REGISTRA AQUI o
 * que tem pendente. Este arquivo não importa nada do relatório de propósito:
 * o registro mora junto das seções, e um ciclo de imports deixaria o contexto
 * indefinido na montagem.
 */
interface Pendencia {
  sujo: boolean;
  salvar: () => Promise<boolean>;
}

type Caixa = { current: Pendencia };

const Registrar = createContext<((caixa: Caixa) => () => void) | null>(null);

/**
 * Grava todo bloco com algo pendente, EM SÉRIE e na ordem dos blocos.
 *
 * Devolve `false` quando um bloco recusou — ele mesmo mostra o erro ao lado do
 * campo, e quem chamou não deve seguir adiante.
 *
 * O valor padrão serve ao caso de alguém montar os blocos sem o provider: aí
 * nada está registrado, e navegar perderia o que foi digitado em silêncio.
 * `PendenciasProvider` é obrigatório em volta dos blocos.
 */
const Salvar = createContext<() => Promise<boolean>>(async () => true);

export function useSalvarPendencias() {
  return useContext(Salvar);
}

/** Cada bloco entrega aqui o que tem para gravar. */
export function useRegistrarPendencia(sujo: boolean, salvar: () => Promise<boolean>) {
  const registrar = useContext(Registrar);
  // A caixa é lida na HORA DE SALVAR, não na de renderizar: o registro
  // acontece uma vez, e o conteúdo dela acompanha cada tecla.
  const caixa = useRef<Pendencia>({ sujo, salvar });
  caixa.current = { sujo, salvar };
  useEffect(() => registrar?.(caixa), [registrar]);
}

export function PendenciasProvider({ children }: { children: React.ReactNode }) {
  const [caixas] = useState(() => new Set<Caixa>());

  const registrar = useCallback(
    (caixa: Caixa) => {
      caixas.add(caixa);
      return () => {
        caixas.delete(caixa);
      };
    },
    [caixas],
  );

  const salvar = useCallback(async () => {
    // EM SÉRIE: as actions das seções apagam e recriam as linhas, e duas
    // gravações em paralelo disputariam as mesmas tabelas da mesma semana.
    for (const caixa of caixas) {
      if (!caixa.current.sujo) continue;
      if (!(await caixa.current.salvar())) return false;
    }
    return true;
  }, [caixas]);

  return (
    <Registrar.Provider value={registrar}>
      <Salvar.Provider value={salvar}>{children}</Salvar.Provider>
    </Registrar.Provider>
  );
}
