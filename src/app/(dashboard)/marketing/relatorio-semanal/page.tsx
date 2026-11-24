import { NotebookPen } from "lucide-react";
import { requireRole } from "@/lib/auth";

/**
 * RELATÓRIO SEMANAL DO MARKETING — a casca.
 *
 * Esta tela é de propósito um PLACEHOLDER: a Fase 1 do porte entrega o módulo
 * (menu, cor, ícone, rota e porta de acesso) e mais nada, para que a posição no
 * menu, o índigo do setor e o ícone sejam conferidos no navegador ANTES de
 * portar as ~6.000 linhas da ferramenta do Build.Connect. Corrigir a cor aqui
 * custa um minuto; corrigi-la depois do porte custa uma repintura.
 *
 * A Fase 2 troca este corpo pela lista de semanas; o `requireRole` abaixo é
 * definitivo e não muda.
 *
 * SÓ GESTAO: o buildflow não tem papel de Marketing, e criar um custaria
 * migração do enum `Role` para um módulo de uma ferramenta. Quem preenche o
 * relatório é a gestão (decisão de 24/11/2026).
 *
 * O título e a descrição da tela NÃO são desenhados aqui — a barra superior os
 * lê do `NAV`, como em toda ferramenta de menu.
 */
export default async function RelatorioSemanalPage() {
  await requireRole(["GESTAO"]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-12 text-center">
        <div className="rounded-lg bg-marketing/15 p-3 text-marketing-text">
          <NotebookPen className="h-6 w-6" />
        </div>
        <p className="text-base font-semibold text-foreground">
          O Relatório Semanal está sendo montado
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          O módulo já existe e o acesso já está fechado para a Gestão. As telas da
          ferramenta — a lista de semanas, o preenchimento em etapas e o quadro de
          tarefas — entram nas próximas etapas.
        </p>
      </div>
    </div>
  );
}
