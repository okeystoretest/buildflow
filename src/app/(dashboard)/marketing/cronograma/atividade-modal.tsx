"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/shared/modal";
import { criarAtividade, editarAtividade, excluirAtividade } from "@/lib/actions/cronograma";
import {
  BRANDS,
  FORMATOS,
  FUNIS,
  PLATAFORMAS,
  type AtividadeInput,
} from "@/lib/cronograma-schemas";
import {
  CORES_DE_FORMATO,
  CORES_DE_FUNIL,
  CORES_DE_MARCA,
  CORES_DE_PLATAFORMA,
  estiloDaCor,
  rotuloDeFormato,
  rotuloDeFunil,
  rotuloDeMarca,
  rotuloDePlataforma,
} from "@/lib/cronograma";
import type { Atividade } from "@/lib/cronograma-data";
import { IconeDaRede } from "./plataforma-icone";
import { cn } from "@/lib/utils";

/**
 * O FORMULÁRIO DA PEÇA: nova, ou a edição de uma que é sua.
 *
 * SÓ ABRE PARA PEÇA DAQUI. A atividade do Build.Connect não tem lápis nenhum na
 * tela, porque a sincronização é de mão única — e, mesmo que tivesse, as
 * actions recusariam: o id dela não existe no nosso banco.
 *
 * DATA E HORA SÃO DOIS CAMPOS, e o valor vai cru para o servidor, que os junta
 * em UTC. Montar o instante aqui faria o fuso do navegador entrar na conta: a
 * mesma atividade marcada às 09:00 cairia numa célula diferente conforme o
 * computador de quem a criou.
 *
 * FORMATOS E REDES SÃO CAIXAS, não listas de seleção múltipla: a seleção
 * múltipla nativa esconde o que está marcado atrás de um scroll e exige
 * Ctrl+clique, que ninguém descobre sozinho.
 */

/** Limites iguais aos do `atividadeSchema` — o contador precisa dizer a verdade. */
const MAX_TITULO = 120;
const MAX_NOTAS = 500;
const MAX_FORMATO_OUTRO = 60;

/** `YYYY-MM-DD` e `HH:MM` em UTC, que é como a grade lê a data. */
function partesDaData(iso: string | undefined): { data: string; hora: string } {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return { data: "", hora: "09:00" };
  return { data: d.toISOString().slice(0, 10), hora: d.toISOString().slice(11, 16) };
}

/**
 * O CHIP DE ESCOLHA: NEUTRO quando não escolhido, na cor do que ele nomeia
 * quando escolhido (pedido do dono, 26/11/2026).
 *
 * A COR É O ESTADO, e isto é uma correção do que estava aqui. Antes todos
 * nasciam tingidos e o escolhido ganhava um anel: sete chips coloridos de uma
 * vez viram um vitral, e "qual eu marquei?" passava a depender de achar um
 * anel no meio da cor. Agora a cor só aparece onde houve escolha, e ela é a
 * própria resposta.
 *
 * A COR NÃO É A ÚNICA PISTA: o escolhido também fica em negrito, e o estado vai
 * no `aria-pressed` (ou no `aria-checked`, ver `comoRadio`) para quem ouve a
 * tela em vez de olhar.
 *
 * `comoRadio` PARA GRUPO DE ESCOLHA ÚNICA (a etapa do funil): a diferença, para
 * quem usa leitor de tela, é saber que escolher uma desmarca a outra. É a mesma
 * decisão do `Segmented` da casa, que não serve aqui porque o neutro dele é
 * outro e os dois grupos deste formulário precisam ter a mesma cara.
 */
function Caixa({
  marcada,
  cor,
  estiloEscolhido,
  ponto = false,
  icone,
  comoRadio = false,
  rotuloAcessivel,
  className,
  onToggle,
  children,
}: {
  marcada: boolean;
  /** Cor de identificação da opção — a tinta do estado escolhido. */
  cor?: string;
  /**
   * Paleta pronta para o estado escolhido, no lugar da receita de `cor`.
   *
   * Existe para a MARCA. A cor dela (`#f0e6a8`) é um amarelo pálido feito para
   * ser FUNDO de card, não tinta: passada pela receita comum, o rótulo "OKEY"
   * saía em 4,23:1 no tema claro. A marca já tem o par fundo/tinta definido
   * pelo Connect, e é ele que vale aqui.
   */
  estiloEscolhido?: CSSProperties;
  /** Desenha a bolinha da cor antes do rótulo. */
  ponto?: boolean;
  /** Entra antes do rótulo — é por onde o ícone da rede chega. */
  icone?: React.ReactNode;
  /** Opção de um grupo em que escolher uma desmarca as outras. */
  comoRadio?: boolean;
  /** Nome falado, quando o rótulo visível é uma sigla. */
  rotuloAcessivel?: string;
  className?: string;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const tinta = marcada ? (estiloEscolhido ?? (cor ? estiloDaCor(cor) : undefined)) : undefined;

  return (
    <button
      type="button"
      onClick={onToggle}
      role={comoRadio ? "radio" : undefined}
      aria-checked={comoRadio ? marcada : undefined}
      aria-pressed={comoRadio ? undefined : marcada}
      aria-label={rotuloAcessivel}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        marcada ? "font-semibold" : "font-medium",
        // Escolhido sem cor própria cai no roxo do Marketing. Não acontece com
        // o vocabulário de hoje — todo valor tem cor —, mas um valor novo
        // criado no Connect precisa PARECER escolhido mesmo sem cor aqui.
        tinta
          ? ""
          : marcada
            ? "border-marketing bg-marketing text-marketing-fg"
            : "border-transparent bg-secondary text-muted-foreground hover:text-foreground",
        className,
      )}
      style={tinta}
    >
      {icone}
      {ponto && cor && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{
            backgroundColor: cor,
            // Aro de um pixel: escolhida, a marca pinta o chip com a MESMA cor
            // da bolinha, e sem contorno ela desaparece dentro do próprio
            // fundo. É o anel que a imagem do Connect mostra.
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18)",
          }}
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}

export function AtividadeModal({
  atividade,
  pessoas,
  dataInicial,
  onClose,
}: {
  /** Ausente = atividade nova. */
  atividade?: Atividade;
  pessoas: readonly { id: string; name: string }[];
  /** `YYYY-MM-DD` da célula clicada, quando a atividade nasce de um dia. */
  dataInicial?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const inicio = partesDaData(atividade?.scheduledAt);

  const [title, setTitle] = useState(atividade?.title ?? "");
  const [data, setData] = useState(atividade ? inicio.data : (dataInicial ?? inicio.data));
  const [hora, setHora] = useState(atividade ? inicio.hora : "09:00");
  const [funnel, setFunnel] = useState<string>(atividade?.funnel ?? "TOFU");
  const [formats, setFormats] = useState<string[]>(atividade?.formats ?? []);
  const [formatOther, setFormatOther] = useState(atividade?.formatOther ?? "");
  const [lineUp, setLineUp] = useState(atividade?.lineUp != null ? String(atividade.lineUp) : "");
  const [brand, setBrand] = useState(atividade?.brand ?? "");
  const [platforms, setPlatforms] = useState<string[]>(atividade?.platforms ?? []);
  const [ownerId, setOwnerId] = useState(atividade?.ownerId ?? "");
  const [notes, setNotes] = useState(atividade?.notes ?? "");

  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alterna = (lista: string[], set: (v: string[]) => void, valor: string) =>
    set(lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]);

  async function salvar() {
    if (salvando) return;
    setSalvando(true);
    setErro(null);

    const entrada = {
      title,
      date: data,
      time: hora,
      funnel,
      // SEM `status`: o formulário não o edita mais. A action só grava o campo
      // quando ele chega, então a edição preserva o que já estava no banco.
      formats,
      // Os condicionais vão só quando o formato que os pede está marcado; o
      // servidor limpa de novo, e é lá que a regra vale.
      formatOther: formats.includes("OUTRO") ? formatOther : undefined,
      lineUp: formats.includes("LANCAMENTO") && lineUp ? Number(lineUp) : undefined,
      brand: brand || undefined,
      platforms,
      notes: notes || undefined,
      ownerId: ownerId || undefined,
    } as AtividadeInput;

    const r = atividade ? await editarAtividade(atividade.id, entrada) : await criarAtividade(entrada);
    setSalvando(false);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    router.refresh();
    onClose();
  }

  async function remover() {
    if (!atividade || salvando) return;
    setSalvando(true);
    setErro(null);
    const r = await excluirAtividade(atividade.id);
    setSalvando(false);
    if (!r.ok) {
      setErro(r.error);
      setConfirmando(false);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal onClose={() => !salvando && onClose()} largura="max-w-2xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">
            {atividade ? "Editar atividade" : "Nova atividade"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {atividade
              ? "A atividade continua no calendário desta ferramenta."
              : "Ela nasce no calendário daqui — o Build.Connect não a recebe."}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} disabled={salvando} aria-label="Fechar">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* `kanban-scroll` e não a barra do sistema: é a barra da casa em toda
          área que rola. O formulário é alto e o modal não pode crescer além da
          janela. */}
      <div className="kanban-scroll max-h-[65vh] space-y-3 overflow-y-auto pr-1">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="atividade-titulo">Título</Label>
            <span className="text-xs text-muted-foreground">
              {title.length}/{MAX_TITULO}
            </span>
          </div>
          <Input
            id="atividade-titulo"
            value={title}
            maxLength={MAX_TITULO}
            placeholder="O que vai ao ar"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="atividade-data">Data</Label>
            <Input id="atividade-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="atividade-hora">Horário</Label>
            <Input id="atividade-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
        </div>

        {/* ETAPA DO FUNIL EM BOTÕES, como no Connect — era lista suspensa. São
            três opções fixas que nunca vão crescer, e uma lista suspensa
            esconde duas delas atrás de um clique para economizar um espaço que
            já existe na linha.

            O CAMPO "STATUS" SAIU DAQUI (pedido do dono, 26/11/2026), e o
            formulário do Connect também não o tem. Quem já estava gravado NÃO
            é perdido: a action só grava status quando ele é enviado, então
            editar o título de uma atividade publicada a mantém publicada. Peça
            nova nasce em "Ideia", que é o padrão da coluna no banco. */}
        <div className="space-y-1.5">
          <Label id="rotulo-funil">Etapa do funil</Label>
          <div role="radiogroup" aria-labelledby="rotulo-funil" className="grid grid-cols-3 gap-1.5">
            {FUNIS.map((f) => (
              <Caixa
                key={f}
                marcada={funnel === f}
                cor={CORES_DE_FUNIL[f]}
                comoRadio
                // A SIGLA NO BOTÃO, o nome inteiro na fala: "TOFU" é o que a
                // tela usa no selo do card e na legenda da barra, e
                // "Topo — atrair" não cabe em três colunas.
                rotuloAcessivel={`${f} — ${rotuloDeFunil(f)}`}
                className="h-10 w-full"
                onToggle={() => setFunnel(f)}
              >
                {f}
              </Caixa>
            ))}
          </div>
        </div>

        {/* A MARCA VIROU CHIP, como no Connect — era uma lista suspensa com
            "Sem marca" no topo. Sem marca deixa de ser uma opção escrita e
            passa a ser o estado de nenhuma marcada: clicar na que já está
            marcada a desmarca. É uma escolha a menos para ler. */}
        <div className="space-y-1.5">
          <Label>Marca</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {BRANDS.map((b) => (
              <Caixa
                key={b}
                marcada={brand === b}
                cor={CORES_DE_MARCA[b]?.fundo}
                estiloEscolhido={
                  CORES_DE_MARCA[b] && {
                    backgroundColor: CORES_DE_MARCA[b].fundo,
                    borderColor: CORES_DE_MARCA[b].borda,
                    color: CORES_DE_MARCA[b].texto,
                  }
                }
                ponto
                className="h-10 w-full"
                onToggle={() => setBrand(brand === b ? "" : b)}
              >
                {rotuloDeMarca(b)}
              </Caixa>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Formatos</Label>
          <div className="flex flex-wrap gap-1.5">
            {FORMATOS.map((f) => (
              <Caixa
                key={f}
                marcada={formats.includes(f)}
                cor={CORES_DE_FORMATO[f]}
                ponto
                onToggle={() => alterna(formats, setFormats, f)}
              >
                {rotuloDeFormato(f)}
              </Caixa>
            ))}
          </div>
        </div>

        {/* Os dois campos que só existem por causa de um formato. Aparecem
            quando ele é marcado e somem quando sai — ficar na tela vazios,
            desabilitados, faria procurar o que preencher neles. */}
        {formats.includes("OUTRO") && (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="atividade-formato-outro">Qual formato?</Label>
              <span className="text-xs text-muted-foreground">
                {formatOther.length}/{MAX_FORMATO_OUTRO}
              </span>
            </div>
            <Input
              id="atividade-formato-outro"
              value={formatOther}
              maxLength={MAX_FORMATO_OUTRO}
              placeholder="Descreva o formato"
              onChange={(e) => setFormatOther(e.target.value)}
            />
          </div>
        )}

        {formats.includes("LANCAMENTO") && (
          <div className="space-y-1.5">
            <Label htmlFor="atividade-lineup">Nº do line-up</Label>
            <Input
              id="atividade-lineup"
              inputMode="numeric"
              value={lineUp}
              placeholder="12"
              // Só dígitos: o campo é inteiro no banco, e deixar entrar letra
              // aqui só adia a recusa para depois de preencher o resto.
              onChange={(e) => setLineUp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Redes</Label>
          <div className="flex flex-wrap gap-1.5">
            {PLATAFORMAS.map((p) => (
              <Caixa
                key={p}
                marcada={platforms.includes(p)}
                cor={CORES_DE_PLATAFORMA[p]}
                // O ÍCONE DA REDE NO LUGAR DA BOLINHA: aqui o símbolo é a
                // identidade, e uma bolinha vermelha serve igual ao TikTok e
                // ao YouTube.
                icone={<IconeDaRede plataforma={p} className="h-3.5 w-3.5" />}
                onToggle={() => alterna(platforms, setPlatforms, p)}
              >
                {rotuloDePlataforma(p)}
              </Caixa>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="atividade-responsavel">Responsável</Label>
          <Select
            id="atividade-responsavel"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            options={[
              { value: "", label: "Sem responsável" },
              ...pessoas.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="atividade-notas">Observações</Label>
            <span className="text-xs text-muted-foreground">
              {notes.length}/{MAX_NOTAS}
            </span>
          </div>
          <Textarea
            id="atividade-notas"
            rows={3}
            value={notes}
            maxLength={MAX_NOTAS}
            placeholder="De qual lançamento esta atividade fala, o que ela precisa ter…"
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {erro && <p className="mt-3 text-xs text-destructive">{erro}</p>}

      <div className="mt-6 flex items-center justify-between gap-2">
        {/* EXCLUIR LONGE DE SALVAR, e com uma confirmação no meio: é a única
            ação desta tela que não dá para desfazer. */}
        <div>
          {atividade &&
            (confirmando ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Excluir mesmo?</span>
                <Button variant="destructive" size="sm" onClick={remover} disabled={salvando}>
                  Excluir
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmando(false)}
                  disabled={salvando}
                >
                  Não
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmando(true)}
                disabled={salvando}
              >
                Excluir
              </Button>
            ))}
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || !title.trim() || formats.length === 0}>
            {salvando ? "Salvando…" : atividade ? "Salvar" : "Criar atividade"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
