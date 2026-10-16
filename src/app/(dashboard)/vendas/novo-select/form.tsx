"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Info, Loader2 } from "lucide-react";
import {
  lookupSelectCustomer,
  previewSelectContract,
  createSelectContract,
  type ActiveContractInfo,
  type SelectPreview,
} from "@/lib/actions/selects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CustomerCombobox,
  type CustomerOpt,
} from "@/components/shared/customer-combobox";
import { NovoClienteModal } from "@/components/shared/novo-cliente-modal";
import { formatBRL } from "@/lib/utils";
import {
  contractEndDate,
  parseDayUTC,
  toInputDate,
  formatDayBR,
  dayUTC,
  monthlyWithBuildSales,
} from "@/lib/select-contract";

export interface PlanOption {
  id: string;
  name: string;
  validityMonths: number;
  monthlyAmount: number | null;
  minMonthlyPurchase: number | null;
  editableValues: boolean;
  benefits: string[];
}

// A cliente é ESCOLHIDA na busca, nunca digitada: não existe mais o estado
// "NOVA" (cliente que o Select criaria junto com o contrato). Quem não está
// cadastrada passa pelo modal e só então pode ser selecionada.
type CustomerState =
  | { kind: "VAZIO" }
  | { kind: "BUSCANDO" }
  | { kind: "ENCONTRADA"; code: string; name: string; actives: ActiveContractInfo[] }
  | { kind: "ERRO"; message: string };

const selectClass =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Formulário da adesão.
 *
 * Duas decisões de fluxo valem o comentário:
 *
 * 1. A cliente é buscada ao SAIR do campo de código, não a cada tecla — a base
 *    tem dezenas de milhares de cadastros, e uma ida ao banco por caractere
 *    digitado seria um ataque ao próprio servidor.
 * 2. O contrato vigente é mostrado NA BUSCA, antes de qualquer preenchimento.
 *    Quem é de Vendas descobre ali que a troca exige Gestão ou Financeiro, em
 *    vez de descobrir no botão de salvar, com o formulário inteiro preenchido.
 *
 * Os valores exibidos aqui são conforto visual. O resumo que antecede a
 * gravação é montado NO SERVIDOR (previewSelectContract), e a gravação
 * recalcula tudo de novo: nada que esta tela calcule chega ao banco.
 */
export function NovoSelectForm({
  plans,
  responsibleName,
  canChooseResponsible,
  sellers,
  canConfirmTroca,
}: {
  plans: PlanOption[];
  /** Nome de quem está logado. Exibido quando não há escolha a fazer. */
  responsibleName: string;
  canChooseResponsible: boolean;
  /** Vendedores ativos. Vem vazia para quem não pode escolher. */
  sellers: { id: string; name: string }[];
  canConfirmTroca: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // `selecionada` é a fonte da verdade do campo de cliente; `code` é o que a
  // action consome. Os dois andam juntos — escolher na lista preenche ambos,
  // limpar zera ambos.
  const [selecionada, setSelecionada] = useState<CustomerOpt | null>(null);
  const [code, setCode] = useState("");
  const [customer, setCustomer] = useState<CustomerState>({ kind: "VAZIO" });
  // Termo digitado quando a busca não achou nada: abre o modal e vira o nome.
  const [novoClienteTermo, setNovoClienteTermo] = useState<string | null>(null);

  // Vendedor a quem a venda pertence. Só Gestão e Financeiro escolhem; para
  // Vendas fica vazio e o servidor usa o próprio usuário da sessão.
  const [responsibleId, setResponsibleId] = useState("");

  const [planId, setPlanId] = useState("");
  const [startDate, setStartDate] = useState(toInputDate(dayUTC()));
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [minPurchase, setMinPurchase] = useState("");
  const [validityMonths, setValidityMonths] = useState("");

  const [preview, setPreview] = useState<SelectPreview | null>(null);
  const [confirmTroca, setConfirmTroca] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const plan = plans.find((p) => p.id === planId) ?? null;
  const editavel = plan?.editableValues ?? false;

  // Fim do contrato, só para exibir enquanto se preenche. O servidor recalcula.
  const fimPrevisto = useMemo(() => {
    const inicio = parseDayUTC(startDate);
    if (!inicio || !plan) return null;
    const meses = editavel
      ? Number(validityMonths || plan.validityMonths)
      : plan.validityMonths;
    if (!Number.isInteger(meses) || meses < 1 || meses > 120) return null;
    return contractEndDate(inicio, meses);
  }, [startDate, plan, editavel, validityMonths]);

  /**
   * Mensalidade final do plano escolhido: a base somada ao Build.Sales.
   *
   * `plan.monthlyAmount` e o que o usuario digita no plano negociado sao a
   * BASE — a mesma conta que o servidor faz em resolveValues. Esta tela
   * mostra o resultado, mas não é ela que decide: a prévia que aparece antes
   * de confirmar vem do servidor.
   */
  const mensalidadeFinal = useMemo(() => {
    if (!plan) return null;
    const base = editavel
      ? Number((monthlyAmount || "").replace(/\./g, "").replace(",", "."))
      : plan.monthlyAmount;
    if (base == null || !base || !Number.isFinite(base)) return null;
    return monthlyWithBuildSales(base);
  }, [plan, editavel, monthlyAmount]);

  const valorTotalPrevisto = useMemo(() => {
    if (!plan || mensalidadeFinal == null) return null;
    const meses = editavel ? Number(validityMonths || plan.validityMonths) : plan.validityMonths;
    if (!Number.isInteger(meses)) return null;
    return mensalidadeFinal * meses;
  }, [plan, editavel, validityMonths, mensalidadeFinal]);

  /** Contrato que cobre a data de início escolhida — o alvo de uma troca. */
  const vigenteNaData = useMemo(() => {
    if (customer.kind !== "ENCONTRADA") return null;
    const inicio = parseDayUTC(startDate);
    if (!inicio) return null;
    return (
      customer.actives.find((c) => {
        const ini = new Date(c.startDate).getTime();
        const fim = new Date(c.closedAt ?? c.endDate).getTime();
        return ini <= inicio.getTime() && inicio.getTime() < fim;
      }) ?? null
    );
  }, [customer, startDate]);

  const trocaBloqueadaParaMim = vigenteNaData != null && !canConfirmTroca;

  function resetPreview() {
    setPreview(null);
    setConfirmTroca(false);
    setMsg(null);
  }

  /**
   * Cliente escolhida na busca (ou acabada de cadastrar no modal).
   *
   * A consulta ao Select vigente continua acontecendo AQUI, na escolha, e não
   * na gravação: é o que avisa a vendedora de que a cliente já tem Select —
   * e de que a troca exige Gestão ou Financeiro — antes de ela preencher o
   * formulário inteiro.
   */
  function escolherCliente(c: CustomerOpt | null) {
    resetPreview();
    setSelecionada(c);
    setCode(c?.code ?? "");
    if (!c) {
      setCustomer({ kind: "VAZIO" });
      return;
    }
    setCustomer({ kind: "BUSCANDO" });
    start(async () => {
      const res = await lookupSelectCustomer(c.code);
      if (!res.ok) {
        // Erro técnico não é tratado como "sem contrato vigente": seguir em
        // frente sem saber do vigente deixaria passar uma troca não conferida.
        setCustomer({ kind: "ERRO", message: res.error });
        return;
      }
      if (!res.data.found) {
        // A cliente estava na busca e não está mais: apagada entre a escolha e
        // esta conferência. Seguir como "sem contrato vigente" deixaria a
        // gravação falhar depois, com o formulário todo preenchido.
        setCustomer({
          kind: "ERRO",
          message: "Esta cliente não existe mais. Busque novamente.",
        });
        return;
      }
      setCustomer({
        kind: "ENCONTRADA",
        code: res.data.code,
        name: res.data.name ?? c.name,
        actives: res.data.activeContracts,
      });
    });
  }

  function revisar() {
    setMsg(null);
    start(async () => {
      const res = await previewSelectContract({
        code, planId, startDate,
        monthlyAmount, minMonthlyPurchase: minPurchase, validityMonths,
      });
      if (res.ok) {
        setPreview(res.data);
        setConfirmTroca(false);
      } else {
        setPreview(null);
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  function salvar() {
    setMsg(null);
    start(async () => {
      const res = await createSelectContract({
        code, planId, startDate,
        monthlyAmount, minMonthlyPurchase: minPurchase, validityMonths,
        confirmTroca,
        responsibleId: canChooseResponsible ? responsibleId : undefined,
      });
      if (res.ok) {
        setMsg({
          ok: true,
          text:
            res.data.kind === "TROCA"
              ? "Troca de plano registrada. O Select anterior foi encerrado."
              : "Select registrado.",
        });
        setPreview(null);
        setSelecionada(null); setCode(""); setPlanId("");
        setMonthlyAmount(""); setMinPurchase(""); setValidityMonths("");
        setResponsibleId("");
        setStartDate(toInputDate(dayUTC()));
        setCustomer({ kind: "VAZIO" });
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  // O responsável entra aqui, e não só na gravação, para que a falta dele seja
  // descoberta ANTES de preencher o resto — e não no botão de salvar, com o
  // formulário inteiro pronto.
  const podeRevisar =
    code.trim() !== "" &&
    planId !== "" &&
    startDate !== "" &&
    (!canChooseResponsible || responsibleId !== "") &&
    customer.kind === "ENCONTRADA" &&
    (!editavel || (monthlyAmount.trim() !== "" && minPurchase.trim() !== ""));

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------ cliente ---- */}
      {/* Mesma busca do Novo Pedido: sugestões do servidor por nome ou código.
          O `key` faz o campo refletir a cliente escolhida — inclusive a que
          acaba de ser criada no modal, que já chega selecionada. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <CustomerCombobox
            key={selecionada?.id ?? "vazio"}
            label="Cliente *"
            value={selecionada?.id ?? ""}
            initialSelected={selecionada}
            onChange={() => {}}
            onSelect={escolherCliente}
            onCreateNew={(termo) => setNovoClienteTermo(termo)}
            limit={5}
            placeholder="Busque por nome ou código..."
          />
        </div>
      </div>

      {customer.kind === "BUSCANDO" && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Conferindo o Select desta cliente...
        </p>
      )}
      {customer.kind === "ERRO" && <Aviso tone="erro">{customer.message}</Aviso>}

      {novoClienteTermo !== null && (
        <NovoClienteModal
          initialName={novoClienteTermo}
          onCreated={(c) => {
            setNovoClienteTermo(null);
            escolherCliente(c);
          }}
          onClose={() => setNovoClienteTermo(null)}
        />
      )}

      {/* Contrato vigente: aparece ANTES do preenchimento. */}
      {customer.kind === "ENCONTRADA" && customer.actives.length > 0 && (
        <Aviso tone={trocaBloqueadaParaMim ? "alerta" : "info"}>
          <div className="space-y-1">
            <strong>Esta cliente já tem Select.</strong>
            <ul className="ml-4 list-disc">
              {customer.actives.map((c) => (
                <li key={c.id}>
                  {c.planName} · {formatBRL(c.monthlyAmount)}/mês · de{" "}
                  {formatDayBR(new Date(c.startDate))} a {formatDayBR(new Date(c.closedAt ?? c.endDate))}
                </li>
              ))}
            </ul>
            {vigenteNaData ? (
              trocaBloqueadaParaMim ? (
                <span>
                  Um início dentro desse período é uma <strong>troca de plano</strong>, e só Gestão ou
                  Financeiro pode confirmá-la. Escolha um início a partir de{" "}
                  {formatDayBR(new Date(vigenteNaData.closedAt ?? vigenteNaData.endDate))} ou acione um
                  desses perfis.
                </span>
              ) : (
                <span>
                  O início escolhido cai dentro desse período: será uma <strong>troca de plano</strong>.
                </span>
              )
            ) : (
              <span>O início escolhido está fora desse período: será uma renovação.</span>
            )}
          </div>
        </Aviso>
      )}

      {/* ------------------------------------------------- plano ----- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2 lg:col-span-2">
          <Label>Plano *</Label>
          <select
            className={selectClass}
            value={planId}
            onChange={(e) => {
              setPlanId(e.target.value);
              setMonthlyAmount(""); setMinPurchase(""); setValidityMonths("");
              resetPreview();
            }}
          >
            <option value="">Selecione...</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Responsável {canChooseResponsible && "*"}</Label>
          {canChooseResponsible ? (
            <>
              <select
                className={selectClass}
                value={responsibleId}
                onChange={(e) => setResponsibleId(e.target.value)}
                disabled={sellers.length === 0}
              >
                <option value="">Selecione...</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {sellers.length === 0 && (
                <p className="text-xs text-destructive">
                  Nenhum usuário de Vendas ativo cadastrado. O Select precisa de
                  um vendedor responsável — cadastre ou reative um em Usuários.
                </p>
              )}
            </>
          ) : (
            <Input value={responsibleName} disabled />
          )}
        </div>
        <div className="space-y-2">
          <Label>Início *</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); resetPreview(); }}
          />
        </div>
      </div>

      {plan && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Mensalidade {editavel && "*"}</Label>
            {editavel ? (
              <>
                <Input
                  value={monthlyAmount}
                  onChange={(e) => { setMonthlyAmount(e.target.value); resetPreview(); }}
                  placeholder="0,00"
                  inputMode="decimal"
                />
                {/* O servidor soma o Build.Sales ao valor negociado. Sem esta
                    linha, quem digita 1.500 veria 1.567 gravado sem entender
                    de onde veio — alterar em silêncio o número que alguém
                    acabou de digitar é pior que mostrar a conta. */}
                {mensalidadeFinal != null && (
                  <p className="text-xs text-muted-foreground">
                    Com o Build.Sales: <strong>{formatBRL(mensalidadeFinal)}</strong>/mês
                  </p>
                )}
              </>
            ) : (
              <Input
                value={mensalidadeFinal == null ? "" : formatBRL(mensalidadeFinal)}
                disabled
              />
            )}
          </div>
          <div className="space-y-2">
            <Label>Mínimo de compras mensal {editavel && "*"}</Label>
            {editavel ? (
              <Input
                value={minPurchase}
                onChange={(e) => { setMinPurchase(e.target.value); resetPreview(); }}
                placeholder="0,00"
                inputMode="decimal"
              />
            ) : (
              <Input value={plan.minMonthlyPurchase == null ? "" : formatBRL(plan.minMonthlyPurchase)} disabled />
            )}
          </div>
          <div className="space-y-2">
            <Label>Validade (meses) {editavel && "*"}</Label>
            {editavel ? (
              <Input
                value={validityMonths}
                onChange={(e) => { setValidityMonths(e.target.value); resetPreview(); }}
                placeholder={String(plan.validityMonths)}
                inputMode="numeric"
              />
            ) : (
              <Input value={`${plan.validityMonths} meses`} disabled />
            )}
          </div>
          <div className="space-y-2">
            <Label>Fim</Label>
            <Input value={fimPrevisto ? formatDayBR(fimPrevisto) : "—"} disabled />
          </div>
          <div className="space-y-2 lg:col-span-2">
            <Label>Valor total do contrato</Label>
            <Input value={valorTotalPrevisto == null ? "—" : formatBRL(valorTotalPrevisto)} disabled />
          </div>
        </div>
      )}

      {/* ---------------------------------------------- benefícios --- */}
      {plan && plan.benefits.length > 0 && (
        <div className="rounded-lg border border-border bg-secondary/30 p-4">
          <h3 className="mb-2 text-sm font-semibold">Benefícios do plano {plan.name}</h3>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {plan.benefits.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-servico" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ------------------------------------------------- resumo ---- */}
      {preview && <Resumo preview={preview} confirmTroca={confirmTroca} setConfirmTroca={setConfirmTroca} />}

      <div className="flex flex-wrap items-center gap-3">
        {!preview ? (
          <Button variant="servico" onClick={revisar} disabled={pending || !podeRevisar}>
            {pending ? "Conferindo..." : "Revisar e confirmar"}
          </Button>
        ) : (
          <>
            <Button
              variant="servico"
              onClick={salvar}
              disabled={
                pending ||
                preview.requiresPrivilege ||
                (preview.kind === "TROCA" && !confirmTroca)
              }
            >
              {pending ? "Salvando..." : preview.kind === "TROCA" ? "Confirmar troca e salvar" : "Salvar Select"}
            </Button>
            <Button variant="outline" onClick={() => setPreview(null)} disabled={pending}>
              Voltar e editar
            </Button>
          </>
        )}
        {msg && (
          <span className={`text-sm ${msg.ok ? "text-servico" : "text-destructive"}`}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Aviso({ tone, children }: { tone: "info" | "alerta" | "erro"; children: React.ReactNode }) {
  const estilo =
    tone === "erro"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : tone === "alerta"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : "border-brand/40 bg-brand/10 text-foreground";
  const Icone = tone === "info" ? Info : AlertTriangle;
  return (
    <div className={`flex gap-2 rounded-lg border p-3 text-sm ${estilo}`}>
      <Icone className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** O resumo vem pronto do servidor — inclusive as parcelas que serão geradas. */
function Resumo({
  preview, confirmTroca, setConfirmTroca,
}: {
  preview: SelectPreview;
  confirmTroca: boolean;
  setConfirmTroca: (v: boolean) => void;
}) {
  const d = (iso: string) => formatDayBR(new Date(iso));
  return (
    <div className="space-y-3 rounded-lg border-2 border-servico/40 bg-servico/5 p-4">
      <h3 className="font-semibold">Confira antes de salvar</h3>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        <Linha rotulo="Cliente" valor={`${preview.customerName} (${preview.customerCode})`} />
        <Linha rotulo="Plano" valor={preview.planName} />
        <Linha rotulo="Vigência" valor={`${d(preview.startDate)} a ${d(preview.endDate)}`} />
        <Linha rotulo="Mensalidade" valor={formatBRL(preview.monthlyAmount)} />
        <Linha rotulo="Mínimo de compras mensal" valor={formatBRL(preview.minMonthlyPurchase)} />
        <Linha rotulo="Valor do contrato" valor={formatBRL(preview.totalAmount)} />
      </dl>

      <div className="rounded-lg border border-border bg-background p-3 text-sm">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <strong>{preview.installments.length} parcela(s) a cobrar</strong>
          <span className="text-muted-foreground">
            soma: {formatBRL(preview.billableAmount)}
          </span>
        </div>
        {preview.skippedPastInstallments > 0 && (
          <p className="mb-2 text-muted-foreground">
            {preview.skippedPastInstallments} parcela(s) de vencimento já passado não serão geradas — o
            Select começa em {d(preview.startDate)}, uma data retroativa. Por isso a soma a cobrar
            ({formatBRL(preview.billableAmount)}) é menor que o valor do contrato
            ({formatBRL(preview.totalAmount)}).
          </p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
          {preview.installments.slice(0, 6).map((p) => (
            <span key={p.number} className="font-data">{p.number}: {d(p.dueDate)}</span>
          ))}
          {preview.installments.length > 6 && (
            <span>… até {d(preview.installments[preview.installments.length - 1].dueDate)}</span>
          )}
        </div>
      </div>

      {preview.kind === "RENOVACAO" && (
        <Aviso tone="info">Renovação: começa depois do Select anterior, sem sobreposição.</Aviso>
      )}

      {preview.replacing && (
        <Aviso tone="alerta">
          <div className="space-y-1">
            <strong>Isto é uma troca de plano.</strong>
            <p>
              O Select vigente ({preview.replacing.planName}, {formatBRL(preview.replacing.monthlyAmount)}/mês,
              de {d(preview.replacing.startDate)} a {d(preview.replacing.endDate)}) será encerrado em{" "}
              {d(preview.startDate)}
              {preview.replacing.canceledInstallments > 0 &&
                `, e ${preview.replacing.canceledInstallments} parcela(s) pendente(s) dele serão canceladas`}
              .
            </p>
            {preview.replacing.paidBeyondClosure > 0 && (
              <p>
                Atenção: há {formatBRL(preview.replacing.paidBeyondClosure)} já pagos referentes a período
                posterior ao encerramento. Nada é estornado automaticamente — o valor fica registrado no
                detalhe do Select para o Financeiro tratar.
              </p>
            )}
            {preview.requiresPrivilege ? (
              <p className="font-medium">
                Seu perfil não pode confirmar troca de plano. Acione Gestão ou Financeiro.
              </p>
            ) : (
              <label className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={confirmTroca}
                  onChange={(e) => setConfirmTroca(e.target.checked)}
                  className="h-4 w-4"
                />
                Confirmo a troca de plano.
              </label>
            )}
          </div>
        </Aviso>
      )}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  );
}
