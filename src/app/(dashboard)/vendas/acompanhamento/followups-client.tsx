"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination } from "@/components/shared/pagination";
import { useFilterQuery } from "@/hooks/use-filter-query";
import type {
  ColaboradorOpt,
  FollowUpRow,
  FollowUpSummary,
  TarefaAtiva,
} from "@/lib/followup-kanban";
import type { FollowUpKindValue } from "@/lib/validations/followup";
import { KanbanFollowUps } from "./kanban-followups";
import { FollowUpFormModal } from "./followup-form-modal";
import { FollowUpFichaModal } from "./followup-ficha-modal";

/**
 * A ABA DE ACOMPANHAMENTO: os filtros, o quadro, a paginação e os dois modais.
 *
 * Era um arquivo de 983 linhas com o formulário, a tabela e a ficha dentro. Em
 * 27/11/2026 a tela virou quadro e os três saíram para arquivos próprios
 * (`kanban-followups`, `followup-form-modal`, `followup-ficha-modal`); o que
 * sobrou aqui é a montagem, que é o que o nome do arquivo promete.
 *
 * Este componente não grava nada: as actions moram em quem as dispara.
 */
export function FollowUpsClient({
  kind,
  rows,
  colaboradores,
  hoje,
  gestorNome,
  colabFiltro,
  anoFiltro,
  situacaoFiltro,
  pagina,
  porPagina,
  total,
  resumo,
  tarefasAtivas,
}: {
  kind: FollowUpKindValue;
  rows: FollowUpRow[];
  colaboradores: ColaboradorOpt[];
  /** "YYYY-MM-DD" de hoje no fuso do negócio, calculado no servidor. */
  hoje: string;
  gestorNome: string;
  /** Filtros da LISTA, aplicados no servidor (?colab, ?ano, ?situacao). */
  colabFiltro: string;
  anoFiltro: string;
  /** "" = todas, "abertos", "concluidos". O histórico é o terceiro valor. */
  situacaoFiltro: string;
  /** Paginação resolvida no servidor: a lista já vem só com esta página. */
  pagina: number;
  porPagina: number;
  total: number;
  /** Os números do topo do quadro, contados no filtro inteiro. */
  resumo: FollowUpSummary;
  /** Tarefas do gestor em andamento hoje — o cronômetro retoma delas. */
  tarefasAtivas: TarefaAtiva[];
}) {
  // Os filtros da lista moram neste componente (que já é de cliente) em vez de
  // num arquivo próprio: são dois selects, e um componente a mais só para eles
  // seria um arquivo a abrir para entender duas linhas.
  const filtro = useFilterQuery(
    {},
    { instant: { colab: colabFiltro, ano: anoFiltro, situacao: situacaoFiltro } },
  );
  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 5 }, (_, i) => anoAtual - i);
  /**
   * O formulário: `"novo"` ou o id do registro em edição. `null` = fechado.
   *
   * Ele ficava fixo no topo da aba e virou modal em 27/11/2026 — por isso o
   * estado é só "qual modal está aberto", e não os onze campos: eles moraram
   * aqui enquanto o formulário era parte da tela, e agora vivem dentro de
   * `FollowUpFormModal`, que nasce e morre com ele.
   */
  const [formulario, setFormulario] = useState<"novo" | string | null>(null);
  /** Registro aberto por inteiro na lista. `null` = todos fechados. */
  const [abertoId, setAbertoId] = useState<string | null>(null);
  /**
   * O registro da ficha aberta, procurado em `rows` em vez de guardado no
   * estado: assim ele acompanha o que o servidor acabou de gravar. Com uma
   * cópia no estado, editar pelo modal deixava a ficha mostrando o texto antigo
   * até fechar e abrir de novo. Se a linha sair da página (filtro, exclusão,
   * paginação), o `find` devolve `undefined` e a ficha simplesmente fecha.
   */
  const aberto = rows.find((r) => r.id === abertoId);

  return (
    // O QUADRO OCUPA A TELA. O formulário saiu daqui para um modal
    // (especificação de 27/11/2026): dez campos de texto longo empurravam as
    // colunas para baixo da dobra, e quem abre um Kanban vem mexer em cartão.
    <div className="w-full space-y-6">

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
          <CardTitle>Registros</CardTitle>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="filtro-colab">Colaborador</Label>
              <select
                id="filtro-colab"
                className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                value={filtro.instant.colab}
                onChange={(e) => filtro.setInstant("colab", e.target.value)}
              >
                <option value="">Todos</option>
                {colaboradores.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {/* O HISTÓRICO É ESTE FILTRO, e não uma tela à parte: os registros
                concluídos são os mesmos registros, e uma segunda lista com os
                mesmos seis campos seria a mesma tabela duas vezes.

                Padrão "Todas" de propósito: um padrão "Em aberto" faria os
                registros já entregues desaparecerem da tela sem ninguém pedir. */}
            <div className="space-y-1.5">
              <Label htmlFor="filtro-situacao">Situação</Label>
              <select
                id="filtro-situacao"
                className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                value={filtro.instant.situacao}
                onChange={(e) => filtro.setInstant("situacao", e.target.value)}
              >
                <option value="">Todas</option>
                <option value="abertos">Em aberto</option>
                <option value="concluidos">Concluídos (histórico)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filtro-ano">Ano</Label>
              <select
                id="filtro-ano"
                className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                value={filtro.instant.ano}
                onChange={(e) => filtro.setInstant("ano", e.target.value)}
              >
                {anos.map((a) => (
                  <option key={a} value={String(a)}>{a}</option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* O QUADRO no lugar da tabela (especificação de 27/11/2026). A
              tabela de seis colunas saiu inteira: as mesmas seis informações
              estão no cartão e na ficha, e manter as duas leituras seria a
              mesma lista duas vezes.
              A PAGINAÇÃO continua embaixo, por decisão do dono — e é por isso
              que o topo de cada coluna diz "3 de 11": sem esse rótulo, o
              quadro mentiria sobre o que existe fora da página. */}
          <KanbanFollowUps
            rows={rows}
            resumo={resumo}
            kind={kind}
            hoje={hoje}
            onAbrir={setAbertoId}
            onNovo={() => setFormulario("novo")}
          />
          <div className="mt-3">
            <Pagination page={pagina} perPage={porPagina} total={total} label="registros" />
          </div>
        </CardContent>
      </Card>

      {/* A FICHA DO REGISTRO — ela traz o histórico de movimentação, o
          tempo por status e a lista "Mover para", que é o caminho do toque. */}
      {aberto && (
        <FollowUpFichaModal
          key={aberto.id}
          registro={aberto}
          tarefasAtivas={tarefasAtivas}
          onEditar={() => setFormulario(aberto.id)}
          onClose={() => setAbertoId(null)}
        />
      )}

      {/* O FORMULÁRIO, em modal (especificação de 27/11/2026).
          A `key` o remonta a cada registro: o estado dele vive em
          inicializadores de `useState`, e sem ela abrir o segundo registro
          mostraria os dados do primeiro. Mesma armadilha documentada no quadro
          do Relatório Semanal. */}
      {formulario && (
        <FollowUpFormModal
          key={formulario}
          kind={kind}
          registro={formulario === "novo" ? undefined : rows.find((r) => r.id === formulario)}
          colaboradores={colaboradores}
          hoje={hoje}
          gestorNome={gestorNome}
          onClose={() => setFormulario(null)}
        />
      )}
    </div>
  );
}
