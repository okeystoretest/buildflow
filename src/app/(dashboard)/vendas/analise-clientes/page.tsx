import Link from "next/link";
import { Inbox } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Prisma } from "@prisma/client";
import { formatCnpj, normalizeCnpj, phoneMatchKeys } from "@/lib/wholesale-identity";
import { canUseWholesaleTool, type WholesaleActor } from "@/lib/wholesale-permissions";
import { classifyDuplicateMatch, listLeadsFor } from "@/lib/wholesale-queries";
import { LeadStatusChip } from "./lead-status-chip";
import { LeadRowActions } from "./lead-row-actions";
import type { DuplicateAlertView, LeadAnswers } from "./decision-modal";

/**
 * ANÁLISE DE CLIENTES — a fila de candidaturas a revenda de atacado.
 *
 * Uma lojista preenche o formulário da LP pública e cai aqui. Esta tela é onde
 * a candidatura é julgada: aprovada, reprovada com um dos 34 códigos, ou
 * marcada como risco (CUIDADO). O julgamento acontece no modal
 * (`decision-modal.tsx`); a lista existe para encontrar a candidatura e para
 * dar à Gestão a visão do conjunto.
 *
 * ESCOPO — e por que `requireRole` não basta:
 * `requireRole(["VENDAS","GESTAO"])` libera o PAPEL, não o ESCOPO de venda. Uma
 * vendedora de VAREJO tem papel VENDAS e passaria por ele digitando a URL à
 * mão, e esta ferramenta é da equipe de Atacado (decisão 15). Então o ator é
 * relido do banco (papel e `salesModel` podem ter mudado desde que o cookie
 * foi emitido) e passa por `canUseWholesaleTool`.
 *
 * A restrição de QUAIS candidaturas aparecem não é feita aqui: ela vive no
 * WHERE de `listLeadsFor`, que já aplica o escopo do ator e falha fechada.
 * Filtrar depois de buscar vazaria os dados pelo HTML.
 *
 * Datas são formatadas NO SERVIDOR e descem como texto. `toLocaleString` no
 * navegador usaria o fuso e o locale de quem está olhando, e a divergência com
 * o servidor apareceria como erro de hidratação — não como "a data está
 * errada".
 */

/** Teto da fila da Gestão. Fila maior que isso é problema de operação, não de
 *  tela — e uma página que renderiza centenas de seletores fica inutilizável
 *  antes de ficar informativa. */
const TETO_FILA = 50;

const dataCurta = (d: Date) =>
  d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

const dataHora = (d: Date) =>
  d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default async function AnaliseClientesPage(
  props: {
    searchParams?: Promise<{ status?: string; brand?: string; page?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const session = await requireRole(["VENDAS", "GESTAO"]);

  // Sem `!`: se o usuário da sessão não existe mais (desativado, removido), o
  // caminho é negar, não estourar um 500 por acesso a `undefined`.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, salesModel: true },
  });

  const actor: WholesaleActor | null = user
    ? { userId: user.id, role: user.role, salesModel: user.salesModel }
    : null;

  if (!actor || !canUseWholesaleTool(actor)) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-vendas-text">Análise de Clientes</h1>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            A Análise de Clientes é da equipe de Atacado.
          </CardContent>
        </Card>
      </div>
    );
  }

  const ehGestao = actor.role === "GESTAO";

  // `status` e `brand` chegam da query string e são repassados a
  // `listLeadsFor`, que ignora valor fora do enum em vez de derrubar a página.
  // Esta versão não tem controles de filtro na tela — o que ela garante é que
  // uma URL filtrada funciona e que a paginação a preserva, em vez de jogar a
  // pessoa de volta para a lista inteira na segunda página.
  const status = searchParams?.status?.trim() || "";
  const brand = searchParams?.brand?.trim() || "";
  const page = Math.max(1, Number(searchParams?.page) || 1);

  const { leads, total, totalPages } = await listLeadsFor(actor, { status, brand, page });
  const pageSafe = Math.min(page, totalPages);

  // As 18 respostas não vêm na listagem (`LeadRow` é o que a TABELA mostra), e
  // o modal precisa delas. Buscamos as linhas completas apenas dos ids desta
  // página — ids que saíram da consulta já restrita pelo escopo, então este
  // `in` não alarga o que a pessoa pode ver.
  const ids = leads.map((l) => l.id);
  const completos = ids.length
    ? await prisma.wholesaleLead.findMany({
        where: { id: { in: ids } },
        include: { decidedBy: { select: { name: true } } },
      })
    : [];

  // Aviso de cadastro repetido: UMA consulta para a página inteira, não uma por
  // candidatura. Há dois motivos, e o segundo pesa mais que o primeiro:
  //  1. Contagem de consultas: uma por linha eram até 20 idas ao banco (PAGE_SIZE)
  //     só para isto; agora é no máximo 1, constante, qualquer que seja o número
  //     de linhas.
  //  2. Tamanho do payload: cada linha carregava até 10 alertas de OUTRAS
  //     vendedoras (nome da candidata e texto de cautela) para dentro do payload
  //     do Server Component de TODA carga da página, abrindo modal ou não —
  //     até 200 registros para desenhar 20 linhas. Agora o candidato só entra no
  //     payload da linha que ele de fato casa, e continua limitado a 10 por
  //     linha.
  // O aviso segue PRONTO quando o modal abre (é a primeira coisa que a analista
  // lê), só que sai de uma consulta só. `findDuplicateAlerts` continua sendo a
  // entrada correta para UM lead e não foi alterada; aqui reaproveitamos os
  // mesmos helpers puros (`normalizeCnpj`, `phoneMatchKeys`,
  // `classifyDuplicateMatch`) para que a regra de casamento seja a mesma.
  const chaves = completos.map((l) => ({
    id: l.id,
    cnpjDigits: normalizeCnpj(l.cnpj),
    phoneKeys: phoneMatchKeys(l.phone),
  }));
  const cnpjs = chaves.map((c) => c.cnpjDigits).filter((c) => c.length === 14);
  const phones = chaves.flatMap((c) => c.phoneKeys);

  // Sem nenhuma chave utilizável NÃO consultamos: esta feature recusa depender
  // do que `OR: []` significa no Prisma (ver `buildDuplicateWhere`). Também só
  // montamos as alternativas que têm valor, pelo mesmo motivo.
  const alternativas: Prisma.WholesaleLeadWhereInput[] = [];
  if (cnpjs.length > 0) alternativas.push({ cnpj: { in: cnpjs } });
  if (phones.length > 0) alternativas.push({ phone: { in: phones } });

  // Só CUIDADO e REPROVADO alertam (aprovado repetido é cliente voltando). O
  // filtro atravessa o escopo de propósito: alerta que só o dono vê não protege
  // ninguém.
  const candidatos =
    alternativas.length > 0
      ? await prisma.wholesaleLead.findMany({
          where: { status: { in: ["CUIDADO", "REPROVADO"] }, OR: alternativas },
          select: {
            id: true,
            status: true,
            cnpj: true,
            phone: true,
            contactName: true,
            rejectionCode: true,
            cautionReason: true,
            decidedAt: true,
          },
        })
      : [];

  // Mais recente primeiro, SEM data por último. O `orderBy desc` do Postgres
  // põe nulos primeiro; em memória podemos pôr os sem data no fim, que é a
  // resposta melhor: uma decisão sem data é a menos informativa.
  const candidatosOrdenados = [...candidatos].sort((a, b) => {
    if (a.decidedAt && b.decidedAt) return b.decidedAt.getTime() - a.decidedAt.getTime();
    if (a.decidedAt) return -1;
    if (b.decidedAt) return 1;
    return 0;
  });

  const alertasPorLead = new Map<string, DuplicateAlertView[]>();
  for (const { id, cnpjDigits, phoneKeys } of chaves) {
    const achados = candidatosOrdenados
      .filter(
        (c) =>
          c.id !== id &&
          ((cnpjDigits.length === 14 && c.cnpj === cnpjDigits) || phoneKeys.includes(c.phone)),
      )
      .slice(0, 10);
    alertasPorLead.set(
      id,
      achados.map((a) => ({
        id: a.id,
        status: a.status,
        contactName: a.contactName,
        rejectionCode: a.rejectionCode,
        cautionReason: a.cautionReason,
        // Os MESMOS valores normalizados usados no filtro acima, nunca as
        // colunas cruas: rotular com o valor cru já fez um casamento só por
        // telefone aparecer como CNPJ.
        matchedBy: classifyDuplicateMatch({
          cnpjDigits,
          phoneKeys,
          candidate: { cnpj: a.cnpj, phone: a.phone },
        }),
        decidedAtLabel: a.decidedAt ? dataCurta(a.decidedAt) : null,
      })),
    );
  }

  const respostasPorLead = new Map<string, LeadAnswers>(
    completos.map((l) => [
      l.id,
      {
        id: l.id,
        brand: l.brand,
        status: l.status,
        contactName: l.contactName,
        email: l.email,
        phone: l.phone,
        story: l.story,
        state: l.state,
        city: l.city,
        serviceModel: l.serviceModel,
        serviceModelOther: l.serviceModelOther,
        instagram: l.instagram,
        instagramImagePath: l.instagramImagePath,
        storeImagePath: l.storeImagePath,
        storeImageKind: l.storeImageKind,
        marketTime: l.marketTime,
        teamSize: l.teamSize,
        brandsCarried: l.brandsCarried,
        foundUs: l.foundUs,
        foundUsOther: l.foundUsOther,
        followTime: l.followTime,
        investmentBand: l.investmentBand,
        wantsVisit: l.wantsVisit,
        cnpj: l.cnpj,
        assistantName: l.assistantName,
        rejectionCode: l.rejectionCode,
        cautionReason: l.cautionReason,
        decidedByName: l.decidedBy?.name ?? null,
        decidedAtLabel: l.decidedAt ? dataHora(l.decidedAt) : null,
        createdAtLabel: dataCurta(l.createdAt),
      },
    ]),
  );

  // FILA DA GESTÃO: candidaturas que chegaram sem código de indicação válido e
  // estão sem dono (decisão 14). Não aparecem para a vendedora — `canSeeLead`
  // é explícito sobre isso — e ficam aqui, fora da paginação da tabela, porque
  // é uma fila de trabalho: a mais antiga primeiro.
  //
  // Só entram as que ainda AGUARDAM decisão (`EM_ANALISE`): isto é fila de
  // trabalho, não arquivo. A Gestão pode decidir uma candidatura direto, sem
  // nunca atribuí-la a ninguém — e ela continuaria sem dona, ficando aqui para
  // sempre. Com os meses a lista acumularia toda sem-dona já julgada, e uma
  // lista que nunca esvazia deixa de ser lida. As já decididas não somem: a
  // tabela abaixo, que a Gestão vê sem filtro, continua mostrando todas.
  const semDono = ehGestao
    ? await prisma.wholesaleLead.findMany({
        where: { sellerId: null, status: "EM_ANALISE" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          contactName: true,
          city: true,
          state: true,
          cnpj: true,
          createdAt: true,
        },
        take: TETO_FILA,
      })
    : [];

  // Preserva os filtros ao paginar.
  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (status) sp.set("status", status);
    if (brand) sp.set("brand", brand);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `/vendas/analise-clientes?${qs}` : "/vendas/analise-clientes";
  };

  // Colunas: 8 para a vendedora, 9 para a Gestão (ela também vê "Vendedora").
  const colunas = ehGestao ? 9 : 8;
  const temFiltro = Boolean(status || brand);

  return (
    <div className="space-y-6">
      {/* Título em `text-vendas-text`: a tela é de Vendas. Os CHIPS de status, não —
          estado não é setor (ver `lead-status-chip.tsx`). */}
      <h1 className="text-2xl font-bold text-vendas-text">Análise de Clientes</h1>

      {ehGestao && semDono.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Aguardando decisão, sem vendedora · {semDono.length}
              {semDono.length === TETO_FILA ? "+" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* A distribuição manual saiu em 17/10/2026: quem chega pelo link
                geral entra no rodízio e ganha dona sozinha. Esta lista deixou de
                ser uma fila de trabalho e virou um AVISO — candidatura aqui
                significa que não havia nenhuma vendedora de Atacado ativa para
                recebê-la. Some sozinha na próxima leitura depois de alguém ser
                ativada; o que resolve é ativar uma vendedora, não distribuir. */}
            <p className="mb-3 text-sm text-muted-foreground">
              Chegaram pelo link geral e ainda não têm dona, porque não havia
              nenhuma vendedora de Atacado ativa no momento em que entraram.
              Ative uma vendedora e elas são atribuídas sozinhas na próxima vez
              que esta tela abrir — ou decida direto, aqui mesmo.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="w-px whitespace-nowrap border-r border-border py-2 pr-4">
                      Recebido
                    </th>
                    <th className="border-r border-border py-2 pl-4 pr-4">Nome</th>
                    <th className="border-r border-border py-2 pl-4 pr-4">Cidade/UF</th>
                    <th className="w-px whitespace-nowrap border-r border-border py-2 pl-4 pr-4">
                      CNPJ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {semDono.map((l) => (
                    <tr
                      key={l.id}
                      className="border-b border-border transition-colors last:border-0 hover:bg-secondary/50"
                    >
                      <td className="w-px whitespace-nowrap border-r border-border py-2 pr-4 font-data">
                        {dataCurta(l.createdAt)}
                      </td>
                      <td className="border-r border-border py-2 pl-4 pr-4">{l.contactName}</td>
                      <td className="border-r border-border py-2 pl-4 pr-4">
                        {l.city}/{l.state}
                      </td>
                      <td className="w-px whitespace-nowrap border-r border-border py-2 pl-4 pr-4 font-data">
                        {formatCnpj(l.cnpj)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{ehGestao ? "Candidaturas" : "Minhas candidaturas"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  {/* Colunas estreitas (`w-px whitespace-nowrap`) são as de
                      conteúdo de largura fixa: data, CNPJ, status. O espaço
                      sobra para nome, cidade e Instagram, que variam. */}
                  <th className="w-px whitespace-nowrap border-r border-border py-2 pr-4">
                    Recebido
                  </th>
                  <th className="border-r border-border py-2 pl-4 pr-4">Nome</th>
                  <th className="border-r border-border py-2 pl-4 pr-4">Cidade/UF</th>
                  <th className="border-r border-border py-2 pl-4 pr-4">Instagram</th>
                  <th className="w-px whitespace-nowrap border-r border-border py-2 pl-4 pr-4">
                    CNPJ
                  </th>
                  <th className="w-px whitespace-nowrap border-r border-border py-2 pl-4 pr-4">
                    Status
                  </th>
                  <th className="border-r border-border py-2 pl-4 pr-4">Auxiliar</th>
                  {ehGestao && (
                    <th className="border-r border-border py-2 pl-4 pr-4">Vendedora</th>
                  )}
                  <th className="py-2 pl-4 pr-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const respostas = respostasPorLead.get(l.id);
                  return (
                    <tr
                      key={l.id}
                      className="border-b border-border transition-colors last:border-0 hover:bg-secondary/50"
                    >
                      <td className="w-px whitespace-nowrap border-r border-border py-2 pr-4 font-data">
                        {dataCurta(l.createdAt)}
                      </td>
                      <td className="border-r border-border py-2 pl-4 pr-4">{l.contactName}</td>
                      <td className="border-r border-border py-2 pl-4 pr-4">
                        {l.city}/{l.state}
                      </td>
                      <td className="border-r border-border py-2 pl-4 pr-4">
                        {l.instagram ? `@${l.instagram}` : "—"}
                      </td>
                      <td className="w-px whitespace-nowrap border-r border-border py-2 pl-4 pr-4 font-data">
                        {formatCnpj(l.cnpj)}
                      </td>
                      <td className="w-px whitespace-nowrap border-r border-border py-2 pl-4 pr-4">
                        <LeadStatusChip status={l.status} />
                      </td>
                      {/* Exibida em maiúsculas (decisão 19). A action já grava
                          assim; o `uppercase` aqui cobre registro antigo que
                          tenha entrado por outro caminho. */}
                      <td className="border-r border-border py-2 pl-4 pr-4 uppercase">
                        {l.assistantName ?? "—"}
                      </td>
                      {ehGestao && (
                        <td className="border-r border-border py-2 pl-4 pr-4">
                          {l.sellerName ?? "—"}
                        </td>
                      )}
                      <td className="py-2 pl-4 pr-4 text-right">
                        {/* Sem as respostas completas não há o que analisar. Só
                            acontece se a linha for apagada entre as duas
                            consultas — e aí a tela diz isso em vez de abrir um
                            modal vazio. */}
                        {respostas ? (
                          <LeadRowActions
                            lead={respostas}
                            alerts={alertasPorLead.get(l.id) ?? []}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Candidatura não encontrada
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {leads.length === 0 && (
                  <tr>
                    <td colSpan={colunas} className="py-10 text-center">
                      {/* Estado vazio informativo: uma vendedora que ainda não
                          recebeu candidatura nenhuma é a PRIMEIRA experiência
                          normal desta tela, não uma exceção. "Nenhum
                          resultado" a deixaria achando que algo quebrou. */}
                      <span className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Inbox className="h-6 w-6" aria-hidden />
                        {temFiltro ? (
                          <>
                            <span>Nenhuma candidatura com esse filtro.</span>
                            <Button asChild variant="outline" size="sm">
                              <Link href="/vendas/analise-clientes">Ver todas</Link>
                            </Button>
                          </>
                        ) : ehGestao ? (
                          <span>
                            Nenhuma candidatura recebida ainda. Elas aparecem aqui assim que
                            uma lojista enviar o formulário da landing page.
                          </span>
                        ) : (
                          <span>
                            Nenhuma candidatura na sua fila ainda. Elas chegam aqui quando uma
                            lojista envia o formulário pelo seu link de indicação.
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {total > 0 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Página {pageSafe} de {totalPages} · {total} candidatura
                {total === 1 ? "" : "s"}
              </span>
              <div className="flex gap-2">
                {pageSafe > 1 ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={pageHref(pageSafe - 1)}>Anterior</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Anterior
                  </Button>
                )}
                {pageSafe < totalPages ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={pageHref(pageSafe + 1)}>Próxima</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Próxima
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
