"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ClipboardCheck, ImageOff, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { decideLead, deleteLead, setAssistantName } from "@/lib/actions/wholesale-leads";
import { findRejectionCode, rejectionCodesByCategory } from "@/lib/wholesale-rejection-codes";
import { formatCnpj } from "@/lib/wholesale-identity";
import { formatPhone } from "@/lib/phone";
import type { DuplicateMatch } from "@/lib/wholesale-queries";
import { LEAD_STATUS_ORDER, LEAD_STATUS_META, LeadStatusChip } from "./lead-status-chip";

/**
 * MODAL COM AS RESPOSTAS — a aba 6 da planilha, inteira.
 *
 * É aqui que uma candidatura a revenda é julgada: as 18 respostas que a
 * lojista deu, de uma vez, mais os quatro campos internos (Atendente, Status,
 * Motivo de reprovação e Auxiliar Responsável). As 18 respostas são SÓ
 * LEITURA: o formulário é da lojista, e deixar a analista editar o que a
 * lojista escreveu apagaria a única versão original que existe do cadastro.
 *
 * POR QUE `createPortal` E NÃO RADIX DIALOG: é o padrão dos modais desta casa
 * (`delay-reason-modal`, `edit-proofs-modal`, `novo-cliente-modal`,
 * `order-detail-modal`, `return-modal`) — portal no `document.body`, ESC
 * fechando por listener próprio, `useTransition` para o pendente. Um sexto
 * modal construído de outra forma, numa tela usada pela MESMA equipe, é como
 * um projeto acaba com duas qualidades de modal na mesma base. O portal, além
 * do padrão, resolve um defeito concreto que o `order-detail-modal` já
 * documenta: um ancestral com `transform` prende o `position: fixed`.
 *
 * O MODAL É MONTADO SÓ QUANDO ABRE (ver `lead-row-actions.tsx`), então o
 * estado inicial dos campos vem dos dados do lead na montagem e não precisa de
 * sincronização por `useEffect` — abrir de novo monta de novo.
 */

/** As 18 respostas do formulário mais os campos de decisão já legíveis. */
export interface LeadAnswers {
  id: string;
  brand: string;
  status: string;

  // --- Seção 1: Boas-vindas e Identificação ---
  contactName: string;
  email: string;
  phone: string;
  story: string;

  // --- Seção 2: Sobre o Seu Negócio ---
  state: string;
  city: string;
  serviceModel: string | null;
  serviceModelOther: string | null;
  instagram: string;
  instagramImagePath: string;
  storeImagePath: string;
  /** Nulo em candidatura importada de planilha — ver `wholesale-import.ts`. */
  storeImageKind: string | null;
  marketTime: string;
  teamSize: string;

  // --- Seção 3: Conectividade e Parceria Comercial ---
  brandsCarried: string;
  foundUs: string | null;
  foundUsOther: string | null;
  followTime: string;
  investmentBand: string | null;
  wantsVisit: boolean | null;

  // --- Seção 4: Validação Cadastro ---
  cnpj: string;

  // --- Campos internos ---
  assistantName: string | null;
  rejectionCode: string | null;
  cautionReason: string | null;
  /** "Atendente" (decisão 18): quem aprovou/reprovou. */
  decidedByName: string | null;
  /**
   * Datas chegam FORMATADAS do servidor, não como `Date`. Formatar no cliente
   * com `toLocaleString` usaria o fuso e o locale do navegador, que podem
   * divergir do servidor — e a divergência aparece como erro de hidratação,
   * não como "a data está errada".
   */
  decidedAtLabel: string | null;
  createdAtLabel: string;
}

/**
 * Um alerta de cadastro repetido, pronto para a tela. É o `DuplicateAlert` de
 * `wholesale-queries.ts` com a data já formatada no servidor, pelo mesmo
 * motivo acima.
 */
export interface DuplicateAlertView {
  id: string;
  status: string;
  contactName: string;
  rejectionCode: string | null;
  cautionReason: string | null;
  matchedBy: DuplicateMatch;
  decidedAtLabel: string | null;
}

/** Limites do servidor (`wholesale-leads.ts`), espelhados nos campos. */
const MAX_CAUTION = 500;
const MAX_ASSISTANT = 120;

const BRAND_LABEL: Record<string, string> = {
  OKEY: "OKEY",
  LOV_CLUB: "Lov Club",
};

/**
 * Rótulos das quatro perguntas de alternativa, na redação da planilha
 * (Anexo A.1 da spec). Ficam aqui, e não num módulo compartilhado, porque esta
 * é a única tela que LÊ as respostas; o formulário público (Tarefa 15) ESCREVE
 * e tem a redação das perguntas no próprio corpo. Quando existir um módulo de
 * conteúdo da LP, é dele que estes rótulos devem passar a vir.
 */
const SERVICE_MODEL_LABEL: Record<string, string> = {
  LOJA_FISICA: "Loja física",
  LOJA_ONLINE: "Loja online",
  FISICA_E_ONLINE: "Loja física e online",
  OUTRO: "Outro",
};

const FOUND_US_LABEL: Record<string, string> = {
  INSTAGRAM: "Instagram",
  SITE: "Site",
  INDICACAO: "Indicação",
  OUTRO: "Outro",
};

const INVESTMENT_LABEL: Record<string, string> = {
  ATE_3K: "Até R$ 3 mil",
  DE_3_A_5K: "De R$ 3 a R$ 5 mil",
  DE_5_A_10K: "De R$ 5 a R$ 10 mil",
  ACIMA_10K: "Acima de R$ 10 mil",
};

/** O que casou no aviso de repetição, em palavra, não em sigla de enum. */
const MATCH_LABEL: Record<DuplicateMatch, string> = {
  cnpj: "CNPJ",
  telefone: "telefone",
  ambos: "CNPJ e telefone",
};

/** Enum desconhecido mostra o valor cru em vez de vazio: some menos informação. */
/**
 * Rótulo de valor fechado. `null` é resposta AUSENTE (candidatura importada de
 * planilha, que não registrava estas perguntas) e vira travessão, igual ao que
 * `ou()` faz com texto vazio — não "null" nem espaço em branco na ficha.
 */
const rotulo = (mapa: Record<string, string>, valor: string | null) =>
  valor ? (mapa[valor] ?? valor) : "—";

/** Resposta ausente aparece como travessão, nunca como espaço em branco. */
const ou = (v: string | null | undefined) => (v && v.trim() ? v.trim() : "—");

/**
 * As imagens são gravadas com caminho público (`/uploads/atacado/...`), mas
 * quem SERVE o arquivo com checagem de sessão é `/api/uploads/[...path]`
 * (decisão 26: formulário público escreve, só gente de dentro lê). A rota
 * legada `/uploads` só redireciona — passar por ela custa um 307 a cada
 * miniatura, então apontamos direto para a autenticada.
 */
function uploadUrl(caminho: string): string {
  if (!caminho) return "";
  if (caminho.startsWith("/api/uploads/")) return caminho;
  if (caminho.startsWith("/uploads/")) return `/api/uploads${caminho.slice("/uploads".length)}`;
  return caminho;
}

/**
 * Miniatura que SOBREVIVE à imagem que falta.
 *
 * Arquivo de upload pode não estar mais no disco — migração de máquina, volume
 * remontado, arquivo apagado à mão. O ícone de imagem quebrada do navegador
 * não diz nada à analista e parece defeito da tela; uma caixa neutra dizendo o
 * que aconteceu deixa claro que o resto da candidatura continua válido. Isto é
 * comportamento de produto, não conveniência de desenvolvimento.
 */
function Miniatura({ caminho, alt }: { caminho: string; alt: string }) {
  const [falhou, setFalhou] = useState(false);
  const url = uploadUrl(caminho);

  if (!url || falhou) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-dashed border-border bg-secondary/40 p-2">
        <span className="flex flex-col items-center gap-1 text-center text-xs text-muted-foreground">
          <ImageOff className="h-5 w-5" aria-hidden />
          Imagem não disponível
        </span>
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block aspect-[4/3] w-full overflow-hidden rounded-lg border border-border transition-colors hover:border-vendas"
      title="Abrir em tamanho real"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        onError={() => setFalhou(true)}
        className="h-full w-full object-cover"
      />
    </a>
  );
}

/**
 * Pergunta em cima, resposta embaixo, DENTRO de uma caixa com contorno.
 *
 * O contorno por campo vem do `Info` de `order-ficha.tsx`, que é o padrão do
 * modal de pedidos. Sem ele, dezoito perguntas em cinza e dezoito respostas em
 * preto viram uma parede de texto onde não se vê onde uma acaba e a outra
 * começa — e é justamente nesta tela que alguém decide sobre o negócio de uma
 * pessoa real.
 *
 * O CORPO É MAIOR QUE O DO `Info` (16px na resposta, 14px na pergunta, contra
 * 14/12 lá), a pedido do dono. Aqui se LÊ: o modal de pedidos é conferência de
 * campos que a pessoa já conhece de cor, e este é texto escrito pela lojista,
 * lido uma vez para decidir. A hierarquia não se perde porque continua dupla —
 * a pergunta é apagada e normal, a resposta é cheia e `font-medium`.
 */
function Resposta({
  pergunta,
  children,
  className,
}: {
  pergunta: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-border px-3 py-2 ${className ?? ""}`}>
      <p className="text-sm leading-snug text-muted-foreground">{pergunta}</p>
      <p className="mt-0.5 whitespace-pre-line break-words text-base font-medium leading-snug">
        {children}
      </p>
    </div>
  );
}

/**
 * Bloco de informação: contorno externo e uma grade dentro.
 *
 * Três colunas a partir de `lg`, duas em tablet, uma no celular. É a largura
 * nova do modal que permite a terceira — e é ela que faz cada bloco caber
 * inteiro sem empurrar o seguinte para fora da tela.
 */
function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border p-4">
      <h4 className="mb-3 text-base font-semibold text-muted-foreground">{titulo}</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

export function DecisionModal({
  lead,
  alerts,
  ehGestao,
  onClose,
  onDone,
}: {
  lead: LeadAnswers;
  /** Vem calculado no servidor: `findDuplicateAlerts` consulta o banco. */
  alerts: DuplicateAlertView[];
  /**
   * Libera a EXCLUSÃO do cadastro. Esconder o botão é conveniência; a guarda
   * está em `deleteLead`, que reconfere o papel no servidor.
   */
  ehGestao: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const [status, setStatus] = useState(lead.status);
  const [codigo, setCodigo] = useState(lead.rejectionCode ?? "");
  const [justificativa, setJustificativa] = useState(lead.cautionReason ?? "");
  const [auxiliar, setAuxiliar] = useState(lead.assistantName ?? "");

  useEffect(() => setPortalTarget(document.body), []);

  // ESC fecha. O modal é longo e a pessoa pode ter rolado para longe do X.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /**
   * Trocar o status APAGA o campo que deixou de valer, na tela.
   *
   * É o espelho do que `resolveDecision` faz no servidor, que zera
   * `rejectionCode` em CUIDADO e `cautionReason` em REPROVADO. Sem isto, mudar
   * REPROVADO para APROVADO deixaria o motivo escolhido escondido no estado do
   * componente: não apareceria na tela, mas voltar para REPROVADO o traria de
   * volta como se tivesse sido reafirmado. Decidir sobre o negócio de uma
   * empresa real não pode depender de um resto de estado invisível.
   */
  function trocarStatus(novo: string) {
    setStatus(novo);
    setCodigo(novo === "REPROVADO" ? lead.rejectionCode ?? "" : "");
    setJustificativa(novo === "CUIDADO" ? lead.cautionReason ?? "" : "");
    setErro(null);
  }

  /**
   * "Comprou" só aparece no seletor quando a candidatura JÁ ESTÁ aprovada (ou
   * já comprou).
   *
   * É a regra de `resolveDecision`, que recusa COMPROU vindo de qualquer outra
   * origem — comprar sem ter sido aprovada não é um caminho do negócio.
   * Esconder aqui é conveniência: poupa a analista de escolher uma opção que o
   * servidor vai recusar. A AUTORIDADE continua sendo o servidor, que confere
   * de novo com o status lido dentro da transação.
   *
   * A condição também garante que o status ATUAL nunca saia da lista: COMPROU
   * é o único escondível, e ele fica quando é o estado de agora. Um `select`
   * cujo `value` não está entre as opções aparece em branco, e aí a tela diria
   * "sem status" sobre uma candidatura que tem um.
   */
  const statusOferecidos = LEAD_STATUS_ORDER.filter(
    (s) =>
      s !== "COMPROU" || lead.status === "APROVADO" || lead.status === "COMPROU",
  );

  const criterio = codigo ? findRejectionCode(codigo)?.criteria ?? null : null;

  const auxiliarNormalizado = auxiliar.trim().toUpperCase();
  const auxiliarMudou = auxiliarNormalizado !== (lead.assistantName ?? "");
  const decisaoMudou =
    status !== lead.status ||
    (status === "REPROVADO" && codigo !== (lead.rejectionCode ?? "")) ||
    (status === "CUIDADO" && justificativa.trim() !== (lead.cautionReason ?? ""));

  // As duas invariantes da decisão, conferidas aqui SÓ para a pessoa não
  // preencher o modal inteiro e perder a viagem (decisões 8 e 10). A
  // autoridade continua sendo o servidor: `resolveDecision` recusa os mesmos
  // dois casos com as mesmas mensagens, e é ele que vale.
  const faltaMotivo = status === "REPROVADO" && !codigo;
  const faltaJustificativa = status === "CUIDADO" && !justificativa.trim();
  const nadaMudou = !decisaoMudou && !auxiliarMudou;

  /**
   * `onDone` e não `onClose`: a linha que este modal mostra deixou de existir,
   * e o pai precisa fechar sabendo que a lista mudou. `deleteLead` já chama
   * `revalidatePath`, então a tabela se redesenha sem a candidatura.
   */
  function excluir() {
    setErro(null);
    start(async () => {
      const r = await deleteLead({ leadId: lead.id });
      if (r.ok) onDone();
      else {
        setConfirmandoExclusao(false);
        setErro(r.error);
      }
    });
  }

  function salvar() {
    setErro(null);
    start(async () => {
      // A Auxiliar Responsável tem action própria e vai primeiro: ela é
      // editável em qualquer status e nunca obrigatória (decisão 34), então
      // não pode ser perdida se a decisão for recusada por falta de motivo.
      if (auxiliarMudou) {
        const r = await setAssistantName({ leadId: lead.id, assistantName: auxiliar });
        if (!r.ok) {
          setErro(r.error);
          return;
        }
      }

      // `decideLead` SEMPRE grava um evento no diário (decisões 12 e 33).
      // Chamá-la sem mudança nenhuma encheria o diário de linhas
      // "EM_ANALISE -> EM_ANALISE", justamente na trilha que existe para a
      // Gestão analisar depois. Então só chamamos quando a decisão mudou.
      if (decisaoMudou) {
        const r = await decideLead({
          leadId: lead.id,
          toStatus: status,
          rejectionCode: status === "REPROVADO" ? codigo : null,
          cautionReason: status === "CUIDADO" ? justificativa : null,
        });
        if (!r.ok) {
          setErro(r.error);
          return;
        }
      }

      onDone();
    });
  }

  if (!portalTarget) return null;

  // Sem `storeImageKind` (candidatura importada) a pergunta não é afirmada:
  // dizer "foto do seu espaço físico" a uma loja só online seria inventar o que
  // foi pedido — e nada foi, porque não houve formulário.
  const rotuloFotoLoja =
    lead.storeImageKind === null
      ? "Imagem da loja:"
      : lead.storeImageKind === "LOJA_ONLINE"
        ? "Compartilhe conosco um print da sua loja online:"
        : "Compartilhe conosco uma foto do seu espaço físico:";

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
      {/* `max-h-[90vh]` com rolagem própria, como no `order-detail-modal`:
          são 18 respostas mais os campos de decisão, e um painel mais alto que
          a tela centralizado pelo flex teria o topo inalcançável. */}
      {/* `max-w-[88rem]` (e não o `max-w-2xl` do modal de pedidos): são 18
          respostas com perguntas de frase inteira, em corpo maior, e em duas
          colunas estreitas cada bloco ficava mais alto que a tela. Em `rem` e
          não `vw` para não colar nas bordas do monitor; o `p-4` do fundo
          escuro continua garantindo a margem em tela menor. */}
      <div className="max-h-[90vh] w-full max-w-[88rem] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl animate-scale-in">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-vendas/15 text-vendas-text">
              <ClipboardCheck className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-lg font-semibold leading-tight">{lead.contactName}</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {rotulo(BRAND_LABEL, lead.brand)} · recebida em {lead.createdAtLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* AVISO DE CADASTRO REPETIDO — no topo, antes das respostas
            (decisão 9). Traz o TEXTO do motivo, não só o código: o aviso só
            vale se disser por que pede cautela. Atravessa o escopo da
            vendedora de propósito — alerta que só o dono vê não protege
            ninguém. */}
        {alerts.length > 0 && (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-destructive">
                  {alerts.length === 1
                    ? "Cadastro repetido: 1 candidatura anterior pede cautela"
                    : `Cadastro repetido: ${alerts.length} candidaturas anteriores pedem cautela`}
                </p>
                <ul className="mt-2 space-y-2">
                  {alerts.map((a) => {
                    // O texto que faz o aviso valer: a justificativa escrita do
                    // CUIDADO, ou o rótulo do código da reprovação. Nunca só o
                    // número do código — "34" não diz nada a quem lê a tela.
                    const cod = a.rejectionCode ? findRejectionCode(a.rejectionCode) : null;
                    const motivo = a.cautionReason?.trim()
                      ? a.cautionReason.trim()
                      : cod
                        ? `Código ${cod.code} — ${cod.label}`
                        : a.rejectionCode
                          ? `Código ${a.rejectionCode}`
                          : null;
                    return (
                      <li key={a.id} className="text-sm">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium">{a.contactName}</span>
                          <LeadStatusChip status={a.status} />
                          <span className="text-xs text-muted-foreground">
                            casou por {MATCH_LABEL[a.matchedBy]}
                            {a.decidedAtLabel ? ` · ${a.decidedAtLabel}` : ""}
                          </span>
                        </span>
                        <span className="mt-0.5 block break-words text-sm text-muted-foreground">
                          {motivo ?? "Sem motivo registrado."}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* AS 18 RESPOSTAS, nos quatro títulos do formulário. Só leitura. */}
        <div className="space-y-3">
          <Secao titulo="Boas-vindas e Identificação">
            <Resposta pergunta="Como podemos te chamar?">{ou(lead.contactName)}</Resposta>
            <Resposta pergunta="Qual é o seu melhor e-mail para contato?">
              {ou(lead.email)}
            </Resposta>
            <Resposta pergunta="Qual é o seu WhatsApp ou telefone para conversarmos?">
              <span className="font-data">{lead.phone ? formatPhone(lead.phone) : "—"}</span>
            </Resposta>
            <Resposta
              className="sm:col-span-2 lg:col-span-3"
              pergunta="Conte-nos um pouco sobre você e sua trajetória:"
            >
              {ou(lead.story)}
            </Resposta>
          </Secao>

          <Secao titulo="Sobre o Seu Negócio">
            <Resposta pergunta="Qual é o seu estado?">{ou(lead.state)}</Resposta>
            <Resposta pergunta="Em qual cidade sua loja está localizada?">
              {ou(lead.city)}
            </Resposta>
            <Resposta
              className="sm:col-span-2 lg:col-span-3"
              pergunta="Como você atende suas clientes hoje?"
            >
              {rotulo(SERVICE_MODEL_LABEL, lead.serviceModel)}
              {/* "Outro" só informa com o texto ao lado (decisão 22). */}
              {lead.serviceModelOther?.trim() ? ` — ${lead.serviceModelOther.trim()}` : ""}
            </Resposta>
            <Resposta pergunta="Qual é o Instagram da sua loja? (@)">
              {lead.instagram ? `@${lead.instagram}` : "—"}
            </Resposta>
            <Resposta pergunta="Há quanto tempo sua loja atua no mercado?">
              {ou(lead.marketTime)}
            </Resposta>
            <Resposta pergunta="Quantas pessoas fazem parte da sua equipe atualmente?">
              {ou(lead.teamSize)}
            </Resposta>
            {/* As duas imagens ganham o MESMO contorno das respostas: elas são
                resposta de pergunta do formulário como as outras, e sem a caixa
                flutuariam soltas no meio da grade. */}
            <div className="rounded-lg border border-border px-2.5 py-1.5">
              <p className="mb-1 text-sm leading-snug text-muted-foreground">
                Envie uma imagem ou print do perfil do seu Instagram:
              </p>
              <Miniatura
                caminho={lead.instagramImagePath}
                alt={`Print do Instagram de ${lead.contactName}`}
              />
            </div>
            <div className="rounded-lg border border-border px-2.5 py-1.5">
              {/* O rótulo acompanha o que foi PEDIDO no envio (decisão 21):
                  loja só online não tem espaço físico para fotografar. */}
              <p className="mb-1 text-sm leading-snug text-muted-foreground">{rotuloFotoLoja}</p>
              <Miniatura
                caminho={lead.storeImagePath}
                alt={`Imagem da loja de ${lead.contactName}`}
              />
            </div>
          </Secao>

          <Secao titulo="Conectividade e Parceria Comercial">
            <Resposta
              className="sm:col-span-2 lg:col-span-3"
              pergunta="Quais marcas já fazem parte do seu espaço?"
            >
              {ou(lead.brandsCarried)}
            </Resposta>
            <Resposta pergunta="Como você nos encontrou?">
              {rotulo(FOUND_US_LABEL, lead.foundUs)}
              {lead.foundUsOther?.trim() ? ` — ${lead.foundUsOther.trim()}` : ""}
            </Resposta>
            <Resposta pergunta="Há quanto tempo você acompanha a nossa marca?">
              {ou(lead.followTime)}
            </Resposta>
            <Resposta pergunta="Qual valor você planeja investir na sua próxima coleção conosco?">
              {rotulo(INVESTMENT_LABEL, lead.investmentBand)}
            </Resposta>
            <Resposta pergunta="Gostaria de receber a visita de uma de nossas representantes em sua loja?">
              {lead.wantsVisit === null ? "—" : lead.wantsVisit ? "Sim" : "Não"}
            </Resposta>
          </Secao>

          <Secao titulo="Validação Cadastro">
            <Resposta
              className="sm:col-span-2 lg:col-span-3"
              pergunta="Para finalizarmos, informe o CNPJ da sua empresa (utilizado para confirmação do segmento):"
            >
              <span className="font-data">{lead.cnpj ? formatCnpj(lead.cnpj) : "—"}</span>
            </Resposta>
          </Secao>

          {/* CAMPOS INTERNOS. Separados por borda tingida de Vendas: o que
              está daqui para baixo é o que a equipe escreve, não a lojista. */}
          <section className="rounded-xl border border-vendas/40 p-4">
            <h4 className="mb-3 text-sm font-semibold text-vendas-text">Decisão</h4>

            <div className="space-y-3">
              {/* "Atendente" (decisão 18): puxado de quem decidiu, nunca
                  digitado. Só leitura por isso mesmo. */}
              <Resposta pergunta="Atendente">
                {lead.decidedByName
                  ? `${lead.decidedByName}${lead.decidedAtLabel ? ` · ${lead.decidedAtLabel}` : ""}`
                  : "Ainda sem decisão"}
              </Resposta>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`lead-status-${lead.id}`}>Status</Label>
                  <select
                    id={`lead-status-${lead.id}`}
                    value={status}
                    onChange={(e) => trocarStatus(e.target.value)}
                    disabled={pending}
                    className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm"
                  >
                    {statusOferecidos.map((s) => (
                      <option key={s} value={s}>
                        {LEAD_STATUS_META[s].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  {/* Nunca obrigatória, editável em qualquer status
                      (decisão 34). Exibida e gravada em MAIÚSCULAS (decisão
                      19) — a action normaliza de novo no servidor; aqui é só
                      para a tela mostrar o que vai ser gravado. */}
                  <Label htmlFor={`lead-auxiliar-${lead.id}`}>Auxiliar Responsável</Label>
                  <Input
                    id={`lead-auxiliar-${lead.id}`}
                    value={auxiliar}
                    maxLength={MAX_ASSISTANT}
                    disabled={pending}
                    onChange={(e) => setAuxiliar(e.target.value.toUpperCase())}
                    placeholder="Opcional"
                  />
                </div>
              </div>

              {/* O dropdown de motivo aparece SÓ em REPROVADO (planilha, aba
                  6), agrupado por categoria na ordem da planilha — é a ordem
                  em que o negócio pensa os motivos, e reordenar por conta
                  própria faria a analista procurar. */}
              {status === "REPROVADO" && (
                <div className="space-y-2">
                  <Label htmlFor={`lead-motivo-${lead.id}`}>Motivo de reprovação *</Label>
                  <select
                    id={`lead-motivo-${lead.id}`}
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    disabled={pending}
                    className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm"
                  >
                    <option value="">Selecione o motivo...</option>
                    {rejectionCodesByCategory().map((g) => (
                      <optgroup key={g.category} label={g.category}>
                        {g.codes.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code} — {c.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {/* O critério do código escolhido: é o texto que ajuda a
                      decidir, e esconder não economiza nada. */}
                  {criterio && <p className="text-xs text-muted-foreground">{criterio}</p>}
                </div>
              )}

              {/* CUIDADO abre a justificativa, obrigatória (decisão 8): sem o
                  texto, o aviso diria "cuidado com esse" sem dizer por quê — e
                  aviso assim se aprende a ignorar. */}
              {status === "CUIDADO" && (
                <div className="space-y-2">
                  <Label htmlFor={`lead-justificativa-${lead.id}`}>Justificativa do alerta *</Label>
                  <textarea
                    id={`lead-justificativa-${lead.id}`}
                    required
                    rows={3}
                    value={justificativa}
                    maxLength={MAX_CAUTION}
                    disabled={pending}
                    onChange={(e) => setJustificativa(e.target.value)}
                    placeholder="O que a equipe precisa saber para não cair no mesmo."
                    className="w-full rounded-lg border border-input bg-background p-3 text-sm"
                  />
                </div>
              )}
            </div>
          </section>
        </div>

        {erro && <p className="mt-3 text-sm text-destructive">{erro}</p>}

        {/* EXCLUSÃO — só a Gestão, e em dois tempos.
            A confirmação é inline e não `window.confirm`: é o padrão da casa
            (o cancelamento do Select faz igual) e um diálogo nativo dentro de
            um portal não respeita nem o tema nem o ESC deste modal.
            Dois tempos porque isto não tem desfazer: as 18 respostas, as duas
            fotos e o diário saem juntos. */}
        {ehGestao && confirmandoExclusao && (
          <div className="mt-4 space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
            <p className="text-sm">
              Excluir apaga <strong>definitivamente</strong> o cadastro de{" "}
              <strong>{lead.contactName}</strong>: as respostas do formulário, as
              duas fotos enviadas e o histórico de decisões. Não há como
              desfazer.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" onClick={excluir} disabled={pending}>
                {pending ? "Excluindo..." : "Confirmar exclusão"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setConfirmandoExclusao(false)}
                disabled={pending}
              >
                Voltar
              </Button>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            variant="vendas"
            onClick={salvar}
            disabled={pending || faltaMotivo || faltaJustificativa || nadaMudou}
          >
            {pending ? "Salvando..." : "Salvar decisão"}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Fechar
          </Button>
          {/* Longe do "Salvar decisão" e com o visual destrutivo: é a ação que
              não tem volta, e vizinhança de botão é o que produz clique
              errado. `ml-auto` empurra para a outra ponta da linha. */}
          {ehGestao && !confirmandoExclusao && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmandoExclusao(true)}
              disabled={pending}
            >
              <Trash2 className="h-4 w-4" /> Excluir cadastro
            </Button>
          )}
          {/* Diz POR QUE o botão está travado. Botão desabilitado sem motivo
              visível manda a pessoa procurar o campo que falta. */}
          {faltaMotivo && (
            <span className="text-xs text-muted-foreground">
              Escolha o motivo da reprovação.
            </span>
          )}
          {faltaJustificativa && (
            <span className="text-xs text-muted-foreground">Descreva o motivo do alerta.</span>
          )}
          {!faltaMotivo && !faltaJustificativa && nadaMudou && (
            <span className="text-xs text-muted-foreground">Nada alterado.</span>
          )}
        </div>
      </div>
    </div>,
    portalTarget,
  );
}
