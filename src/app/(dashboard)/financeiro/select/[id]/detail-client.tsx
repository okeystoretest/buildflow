"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Ban, ChevronDown, ChevronRight, FileText, Paperclip, RotateCcw, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/utils";
import { shrinkImageToBase64 } from "@/lib/client-image";
import {
  registerSelectPayment, reverseSelectPayment, cancelSelectInstallment, setSelectInstallmentNote,
} from "@/lib/actions/select-finance";
import { cancelSelectContract } from "@/lib/actions/selects";
import { SelectRoadmapCard } from "@/components/shared/select-roadmap-card";
import { SelectPurchaseCycles } from "@/components/shared/select-purchase-cycles";
import {
  formatDayBR, toInputDate, dayUTC,
  CONTRACT_STATE_LABEL, INSTALLMENT_STATE_LABEL,
  type InstallmentState, type ContractState,
} from "@/lib/select-contract";
import type { SelectDetail, SelectInstallmentRow } from "@/lib/select-queries";
import { NomeDoCliente } from "@/components/shared/customer-card-modal";

const CONTRACT_BADGE: Record<ContractState, string> = {
  ATIVO: "bg-servico/15 text-servico-text",
  AGENDADO: "bg-brand/15 text-brand-text",
  ENCERRADO: "bg-secondary text-muted-foreground",
  CANCELADO: "bg-destructive/15 text-destructive",
};

const INSTALLMENT_BADGE: Record<InstallmentState, string> = {
  PAGA: "bg-servico/15 text-servico-text",
  PARCIAL: "bg-brand/15 text-brand-text",
  VENCIDA: "bg-destructive/15 text-destructive",
  PENDENTE: "bg-secondary text-muted-foreground",
  CANCELADA: "bg-secondary text-muted-foreground line-through",
};

const selectClass =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

const d = (iso: string) => formatDayBR(new Date(iso));

export function SelectDetailClient({
  detail, paymentMethods, banks, cnpjs,
}: {
  detail: SelectDetail;
  paymentMethods: { id: string; name: string }[];
  banks: { id: string; name: string }[];
  cnpjs: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cancelandoContrato, setCancelandoContrato] = useState(false);
  const [motivoContrato, setMotivoContrato] = useState("");

  const encerravel = detail.state !== "CANCELADO";

  function cancelarContrato() {
    setMsg(null);
    start(async () => {
      const res = await cancelSelectContract({ id: detail.id, reason: motivoContrato });
      if (res.ok) {
        setCancelandoContrato(false);
        setMotivoContrato("");
        router.refresh();
      } else setMsg({ ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ cabeçalho -- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-servico-text">
            <Star className="h-6 w-6" />{" "}
            <NomeDoCliente
              nome={detail.customerName}
              codigo={detail.customerCode}
              clicavel
              curto={false}
            />
          </h1>
          <p className="font-data text-sm text-muted-foreground">{detail.customerCode}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={CONTRACT_BADGE[detail.state]}>{CONTRACT_STATE_LABEL[detail.state]}</Badge>
          {encerravel && (
            <Button variant="outline" size="sm" onClick={() => setCancelandoContrato((v) => !v)}>
              <Ban className="h-4 w-4" /> Cancelar Select
            </Button>
          )}
        </div>
      </div>

      {cancelandoContrato && (
        <Card className="border-destructive/40">
          <CardContent className="space-y-3 pt-5">
            <p className="text-sm">
              Cancelar encerra o contrato e <strong>cancela as parcelas pendentes a vencer</strong>. As
              parcelas já vencidas em aberto permanecem, e as pagas não são tocadas. Um Select cancelado
              não volta atrás: para corrigir, cadastre outro.
            </p>
            <div className="space-y-2">
              <Label>Motivo *</Label>
              <Input value={motivoContrato} onChange={(e) => setMotivoContrato(e.target.value)} placeholder="Por que este Select está sendo cancelado?" />
            </div>
            <div className="flex gap-2">
              <Button variant="destructive" onClick={cancelarContrato} disabled={pending || !motivoContrato.trim()}>
                {pending ? "Cancelando..." : "Confirmar cancelamento"}
              </Button>
              <Button variant="outline" onClick={() => setCancelandoContrato(false)} disabled={pending}>Voltar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {msg && !msg.ok && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{msg.text}</div>
      )}

      {/* ----------------------------------------- roadmap de entrega -- */}
      <SelectRoadmapCard
        steps={detail.steps}
        bloqueado={detail.state === "CANCELADO"}
        onErro={(t) => setMsg({ ok: false, text: t })}
      />

      {/* --------------------------------------------- dados do contrato -- */}
      <Card>
        <CardHeader><CardTitle>Contrato</CardTitle></CardHeader>
        <CardContent>
          {/* Tabela, e não a grade de `<dl>` que havia aqui: dez campos soltos
              num grid de quatro colunas não diziam onde um terminava e o outro
              começava, e com a tela mais larga o vão só cresceu. A `<table>`
              sem `table-plain` herda a grade completa do `globals.css` — linha
              em toda célula e cabeçalho chapado —, que é exatamente o
              separador que faltava, sem CSS novo.

              PARES por linha (rótulo, valor, rótulo, valor): com um par só a
              tabela teria dez linhas e metade da largura vazia. Rola na
              horizontal no celular, onde quatro colunas não cabem. */}
          <div className="kanban-scroll overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Dados do contrato</caption>
              <tbody>
                {[
                  ["Plano", detail.planName, "Responsável", detail.responsibleName],
                  ["Início", d(detail.startDate), "Fim", d(detail.closedAt ?? detail.endDate)],
                  ["Validade", `${detail.validityMonths} meses`, "Mensalidade", formatBRL(detail.monthlyAmount)],
                  ["Valor do contrato", formatBRL(detail.totalAmount), "A cobrar (parcelas geradas)", formatBRL(detail.billableAmount)],
                  ["Mínimo de compras mensal", formatBRL(detail.minMonthlyPurchase), "Registrado em", d(detail.createdAt)],
                ].map(([r1, v1, r2, v2]) => (
                  <tr key={r1}>
                    <th scope="row" className="whitespace-nowrap py-2.5 text-left text-xs font-normal uppercase tracking-wide text-muted-foreground">{r1}</th>
                    {/* `w-1/4` nas duas células de valor: sem largura declarada
                        o navegador dá a sobra toda à coluna do rótulo mais
                        longo, e os dois pares da linha saem assimétricos. */}
                    <td className="w-1/4 py-2.5 font-medium">{v1}</td>
                    <th scope="row" className="whitespace-nowrap py-2.5 text-left text-xs font-normal uppercase tracking-wide text-muted-foreground">{r2}</th>
                    <td className="w-1/4 py-2.5 font-medium">{v2}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detail.billableAmount < detail.totalAmount && (
            <p className="mt-3 rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
              O valor a cobrar é menor que o do contrato porque este Select começou numa data retroativa:
              as parcelas de vencimento já passado não foram geradas.
            </p>
          )}

          {detail.cancelReason && (
            <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <strong>Cancelado{detail.canceledAt ? ` em ${d(detail.canceledAt)}` : ""}:</strong> {detail.cancelReason}
            </p>
          )}

          {(detail.replaces || detail.replacedBy) && (
            <div className="mt-3 space-y-1 rounded-lg border border-border bg-secondary/40 p-3 text-sm">
              {detail.replaces && (
                <p>
                  Substituiu o Select{" "}
                  <Link href={`/financeiro/select/${detail.replaces.id}`} className="font-medium text-brand-text hover:underline">
                    {detail.replaces.planName} (início {d(detail.replaces.startDate)})
                  </Link>
                </p>
              )}
              {detail.replacedBy && (
                <p>
                  Substituído pelo Select{" "}
                  <Link href={`/financeiro/select/${detail.replacedBy.id}`} className="font-medium text-brand-text hover:underline">
                    {detail.replacedBy.planName} (início {d(detail.replacedBy.startDate)})
                  </Link>
                </p>
              )}
            </div>
          )}

          {detail.paidBeyondClosure > 0 && (
            <div className="mt-3 flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Há <strong>{formatBRL(detail.paidBeyondClosure)}</strong> pagos referentes a período
                posterior ao encerramento deste Select. Nada foi estornado automaticamente — o
                tratamento (estorno ou crédito) é decisão do Financeiro, por fora do sistema.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------- parcelas -- */}
      <Card>
        <CardHeader><CardTitle>Parcelas</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {detail.installments.length === 0 && (
            <p className="py-6 text-center text-muted-foreground">
              Nenhuma parcela gerada — todas as mensalidades deste contrato venceriam em datas já passadas.
            </p>
          )}
          {detail.installments.map((i) => (
            <Parcela
              key={i.id}
              inst={i}
              validityMonths={detail.validityMonths}
              paymentMethods={paymentMethods}
              banks={banks}
              cnpjs={cnpjs}
            />
          ))}
        </CardContent>
      </Card>

      {/* ------------------------------------- mínimo de compras ----- */}
      <SelectPurchaseCycles cycles={detail.cycles} />
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Uma parcela: linha resumida que abre nos pagamentos e nas ações. */
function Parcela({
  inst, validityMonths, paymentMethods, banks, cnpjs,
}: {
  inst: SelectInstallmentRow;
  validityMonths: number;
  paymentMethods: { id: string; name: string }[];
  banks: { id: string; name: string }[];
  cnpjs: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aberta, setAberta] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  // Pagamento
  const [paidAt, setPaidAt] = useState(toInputDate(dayUTC()));
  const [amount, setAmount] = useState("");
  const [methodId, setMethodId] = useState("");
  const [bankId, setBankId] = useState("");
  const [cnpjId, setCnpjId] = useState("");
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<{ base64: string; label: string } | null>(null);

  // Observação da parcela
  const [instNote, setInstNote] = useState(inst.note ?? "");

  const saldo = Math.round((inst.amount - inst.paidAmount) * 100) / 100;
  const podeReceber = inst.state !== "CANCELADA" && inst.state !== "PAGA";

  async function escolherArquivo(file: File | undefined) {
    setErro("");
    if (!file) { setProof(null); return; }
    if (file.type === "application/pdf") {
      // 9MB, nao 15: o teto real e o bodySizeLimit de 12mb do next.config, e o
      // base64 do data-URL infla o binario em 4/3. Avisar 15MB aqui faria o
      // arquivo subir para morrer no limite do Next com erro opaco.
      if (file.size > 9 * 1024 * 1024) { setErro("Comprovante muito grande (máx. 9MB)."); return; }
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result ?? ""));
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(file);
      });
      setProof({ base64, label: file.name });
      return;
    }
    const res = await shrinkImageToBase64(file);
    if (!res.base64) { setErro(res.error ?? "Não foi possível ler a imagem."); return; }
    setProof({ base64: res.base64, label: file.name });
  }

  function registrar() {
    setErro("");
    start(async () => {
      const res = await registerSelectPayment({
        installmentId: inst.id,
        paidAt, amount,
        paymentMethodId: methodId || undefined,
        bankId: bankId || undefined,
        cnpjId: cnpjId || undefined,
        proofBase64: proof?.base64,
        note: note || undefined,
      });
      if (res.ok) {
        setAmount(""); setNote(""); setProof(null);
        if (res.data.advancedAmount > 0) {
          const destinos = res.data.allocations
            .filter((a) => a.number !== inst.number)
            .map((a) => `${formatBRL(a.amount)} na parcela ${a.number}`)
            .join(", ");
          setAviso(`Adiantamento aplicado: ${destinos}.`);
        }
        router.refresh();
      } else setErro(res.error);
    });
  }

  function reverter(paymentId: string, emLote: boolean) {
    const motivo = window.prompt(
      emLote
        ? "Este pagamento cobriu mais de uma parcela e será revertido por inteiro.\n\nMotivo da reversão:"
        : "Motivo da reversão:",
    );
    if (!motivo?.trim()) return;
    setErro("");
    start(async () => {
      const res = await reverseSelectPayment({ paymentId, reason: motivo });
      if (res.ok) router.refresh();
      else setErro(res.error);
    });
  }

  function cancelarParcela() {
    const motivo = window.prompt("Motivo do cancelamento da parcela:");
    if (!motivo?.trim()) return;
    setErro("");
    start(async () => {
      const res = await cancelSelectInstallment({ installmentId: inst.id, reason: motivo });
      if (res.ok) router.refresh();
      else setErro(res.error);
    });
  }

  function salvarObservacao() {
    setErro("");
    start(async () => {
      const res = await setSelectInstallmentNote({ installmentId: inst.id, note: instNote });
      if (res.ok) router.refresh();
      else setErro(res.error);
    });
  }

  const vivos = inst.payments.filter((p) => !p.reversedAt);

  return (
    <div className={`rounded-lg border ${inst.state === "VENCIDA" ? "border-destructive/40 bg-destructive/5" : "border-border"}`}>
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 p-3 text-left text-sm hover:bg-secondary/40"
      >
        {aberta ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="font-data font-medium">{inst.number}/{validityMonths}</span>
        <span className="font-data">venc. {d(inst.dueDate)}</span>
        <span className="font-data">{formatBRL(inst.amount)}</span>
        <Badge className={INSTALLMENT_BADGE[inst.state]}>{INSTALLMENT_STATE_LABEL[inst.state]}</Badge>
        {inst.paidAmount > 0 && (
          <span className="font-data text-muted-foreground">
            pago {formatBRL(inst.paidAmount)}{saldo > 0 && ` · saldo ${formatBRL(saldo)}`}
          </span>
        )}
        {vivos.length > 0 && (
          <span className="text-xs text-muted-foreground">{vivos.length} pagamento(s)</span>
        )}
      </button>

      {aberta && (
        <div className="space-y-4 border-t border-border p-3">
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          {aviso && <p className="text-sm text-servico-text">{aviso}</p>}

          {/* pagamentos já registrados */}
          {inst.payments.length > 0 && (
            <div className="space-y-1.5">
              {inst.payments.map((p) => (
                <div
                  key={p.id}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-2 text-sm ${
                    p.reversedAt ? "border-border bg-secondary/40 text-muted-foreground" : "border-border"
                  }`}
                >
                  <span className={`font-data font-medium ${p.reversedAt ? "line-through" : ""}`}>{formatBRL(p.amount)}</span>
                  <span className="font-data">{d(p.paidAt)}</span>
                  {p.methodName && <span>{p.methodName}</span>}
                  {p.bankName && <span className="text-muted-foreground">{p.bankName}</span>}
                  {p.cnpjName && <span className="text-muted-foreground">{p.cnpjName}</span>}
                  {p.proofPath && (
                    <a href={p.proofPath} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-brand-text hover:underline">
                      <FileText className="h-3.5 w-3.5" /> comprovante
                    </a>
                  )}
                  {p.note && <span className="text-muted-foreground">“{p.note}”</span>}
                  {p.batchId && (
                    <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs text-brand-text">
                      parte de um pagamento que cobriu várias parcelas
                    </span>
                  )}
                  {p.reversedAt ? (
                    <span className="text-xs">revertido em {d(p.reversedAt)}{p.reversalReason && ` — ${p.reversalReason}`}</span>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => reverter(p.id, p.batchId != null)} disabled={pending}>
                      <RotateCcw className="h-3.5 w-3.5" /> Reverter
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* registrar pagamento */}
          {podeReceber && (
            <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-sm font-medium">
                Registrar pagamento <span className="font-normal text-muted-foreground">· saldo {formatBRL(saldo)}</span>
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Data *</Label>
                  <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Valor *</Label>
                  <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={saldo.toFixed(2).replace(".", ",")} inputMode="decimal" />
                </div>
                <div className="space-y-1.5">
                  <Label>Forma de pagamento</Label>
                  <select className={selectClass} value={methodId} onChange={(e) => setMethodId(e.target.value)}>
                    <option value="">—</option>
                    {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Banco</Label>
                  <select className={selectClass} value={bankId} onChange={(e) => setBankId(e.target.value)}>
                    <option value="">—</option>
                    {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>CNPJ recebedor</Label>
                  <select className={selectClass} value={cnpjId} onChange={(e) => setCnpjId(e.target.value)}>
                    <option value="">—</option>
                    {cnpjs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5 lg:col-span-2">
                  <Label>Observação</Label>
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
                </div>
                <div className="space-y-1.5">
                  <Label>Comprovante</Label>
                  <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm text-muted-foreground hover:bg-secondary">
                    <Paperclip className="h-4 w-4 shrink-0" />
                    <span className="truncate">{proof?.label ?? "Anexar imagem ou PDF"}</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => escolherArquivo(e.target.files?.[0])}
                    />
                  </label>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="servico" size="sm" onClick={registrar} disabled={pending || !amount.trim()}>
                  {pending ? "Registrando..." : "Registrar pagamento"}
                </Button>
                <Button variant="outline" size="sm" onClick={cancelarParcela} disabled={pending}>
                  <Ban className="h-4 w-4" /> Cancelar parcela
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Pagamento parcial é aceito: registre o valor recebido e a parcela fica como Parcial até o
                saldo zerar.
              </p>
            </div>
          )}

          {/* observação da parcela */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 space-y-1.5" style={{ minWidth: 220 }}>
              <Label>Observação da parcela</Label>
              <Input value={instNote} onChange={(e) => setInstNote(e.target.value)} placeholder="Anotação do Financeiro" />
            </div>
            <Button variant="outline" size="sm" onClick={salvarObservacao} disabled={pending}>Salvar observação</Button>
          </div>
        </div>
      )}
    </div>
  );
}
