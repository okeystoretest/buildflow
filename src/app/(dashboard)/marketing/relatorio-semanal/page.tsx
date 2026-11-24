import { requireRole } from "@/lib/auth";
import { getRelatorioSemanalData, getRelatorioSemanalDetail } from "@/lib/relatorio-semanal-data";
import { Painel } from "./painel";

/**
 * RELATÓRIO SEMANAL DO MARKETING — a lista de semanas.
 *
 * SÓ GESTAO: o buildflow não tem papel de Marketing, e criar um custaria
 * migração do enum `Role` para um módulo de uma ferramenta. Quem preenche o
 * relatório é a gestão (decisão de 24/11/2026).
 *
 * O título e a descrição da tela NÃO são desenhados aqui — a barra superior os
 * lê do `NAV`, como em toda ferramenta de menu.
 *
 * A PÁGINA VIVE NA URL (`?page=`), como no resto da casa, e não em estado de
 * componente. No Build.Connect ela é estado local, e isso custou um defeito
 * lá: criar uma semana estando na página 2 deixava a pessoa na página 2
 * enquanto a semana nova entrava na 1, invisível. Com a página na URL, quem
 * decide é a navegação.
 *
 * QUAL SEMANA ESTÁ ABERTA também vem da URL (`?semana=`), e o detalhe é
 * resolvido AQUI, no servidor: a ficha abre com os dados já prontos, e o
 * cálculo da média de 4 semanas — que lê os três relatórios anteriores — nunca
 * sai do servidor.
 *
 * EM CONSTRUÇÃO: esta fatia entrega a lista e a LEITURA. O editor em seis
 * passos e o quadro Kanban entram nas próximas.
 */
export const dynamic = "force-dynamic";

/** Seis por página: duas fileiras de três na largura da leitura. */
const POR_PAGINA = 6;

export default async function RelatorioSemanalPage(props: {
  searchParams: Promise<{ page?: string; semana?: string }>;
}) {
  const searchParams = await props.searchParams;
  await requireRole(["GESTAO"]);

  const { reports, summary } = await getRelatorioSemanalData();
  // `?semana=` de uma semana que não existe devolve null e a lista abre normal,
  // em vez de uma ficha vazia ou de um erro: id colado à mão não é acidente
  // raro, é o que acontece quando alguém guarda o link e a semana é excluída.
  const detail = searchParams.semana
    ? await getRelatorioSemanalDetail(searchParams.semana)
    : null;

  const totalPaginas = Math.max(1, Math.ceil(reports.length / POR_PAGINA));
  // Grampeia a página ao intervalo que existe: `?page=99` numa lista de duas
  // páginas mostraria uma tela vazia que parece defeito.
  const page = Math.min(Math.max(1, Number(searchParams.page ?? 1) || 1), totalPaginas);
  const daPagina = reports.slice((page - 1) * POR_PAGINA, page * POR_PAGINA);

  return (
    <Painel
      reports={daPagina}
      detail={detail}
      page={page}
      porPagina={POR_PAGINA}
      total={reports.length}
      totalTarefas={summary.total}
    />
  );
}
