"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createSelectPlan,
  updateSelectPlan,
  toggleSelectPlan,
  deleteSelectPlan,
} from "@/lib/actions/select-plans";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/lib/utils";
import { BUILD_SALES_MONTHLY, parseMoney } from "@/lib/select-contract";

/**
 * Um benefício do plano. `executable` decide se ele vira etapa do roadmap de
 * entrega do contrato (ver `src/lib/select-roadmap.ts`): entregável tem marco
 * de conclusão e conta progresso; casual/contínuo não tem e fica fora da régua.
 */
export interface BenefitRow {
  text: string;
  executable: boolean;
}

/** Linha nova nasce entrando na régua: entregável é o caso comum. */
const NOVO_BENEFICIO: BenefitRow = { text: "", executable: true };

export interface PlanAdminRow {
  id: string;
  name: string;
  validityMonths: number;
  /** Mensalidade BASE, sem o Build.Sales. null no plano negociado. */
  monthlyAmount: number | null;
  minMonthlyPurchase: number | null;
  editableValues: boolean;
  active: boolean;
  benefits: BenefitRow[];
  /** Quantos contratos já foram vendidos neste plano. */
  contractCount: number;
}

const VAZIO = {
  name: "",
  validityMonths: "12",
  monthlyAmount: "",
  minMonthlyPurchase: "",
  editableValues: false,
  benefits: [NOVO_BENEFICIO] as BenefitRow[],
};

type FormState = typeof VAZIO;

function paraForm(p: PlanAdminRow): FormState {
  return {
    name: p.name,
    validityMonths: String(p.validityMonths),
    monthlyAmount: p.monthlyAmount == null ? "" : String(p.monthlyAmount),
    minMonthlyPurchase: p.minMonthlyPurchase == null ? "" : String(p.minMonthlyPurchase),
    editableValues: p.editableValues,
    benefits: p.benefits.length > 0 ? [...p.benefits] : [NOVO_BENEFICIO],
  };
}

/**
 * PLANOS — a aba que alimenta a lista do + Novo Select.
 *
 * Vive em arquivo próprio, e não dentro de tabs-client.tsx, porque aquele
 * arquivo já carrega dez painéis em 45 KB: um décimo primeiro ali tornaria
 * ainda mais difícil achar qualquer um deles.
 *
 * O cuidado central da tela é o campo de mensalidade. `SelectPlan.monthlyAmount`
 * guarda o valor BASE, e o servidor soma o Build.Sales na adesão — então quem
 * digita 597 faz a cliente pagar 664. A tela mostra essa conta embaixo do campo
 * enquanto se digita; sem isso, cadastrar "664" é o erro mais natural do mundo,
 * e ele cobra o Build.Sales duas vezes.
 */
export function PlanosPanel({ plans }: { plans: PlanAdminRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState<FormState>(VAZIO);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  function novo() {
    setEditId(null);
    setF(VAZIO);
    setErro(null);
    setAberto(true);
  }

  function editar(p: PlanAdminRow) {
    setEditId(p.id);
    setF(paraForm(p));
    setErro(null);
    setAberto(true);
  }

  function fechar() {
    setAberto(false);
    setEditId(null);
    setErro(null);
  }

  function setBeneficio(i: number, patch: Partial<BenefitRow>) {
    setF((p) => {
      const b = [...p.benefits];
      b[i] = { ...b[i], ...patch };
      return { ...p, benefits: b };
    });
  }

  function adicionarBeneficio() {
    setF((p) => ({ ...p, benefits: [...p.benefits, NOVO_BENEFICIO] }));
  }

  function removerBeneficio(i: number) {
    setF((p) => {
      const b = p.benefits.filter((_, j) => j !== i);
      return { ...p, benefits: b.length > 0 ? b : [NOVO_BENEFICIO] };
    });
  }

  function salvar() {
    setErro(null);
    start(async () => {
      const payload = {
        name: f.name,
        editableValues: f.editableValues,
        validityMonths: f.validityMonths,
        monthlyAmount: f.monthlyAmount,
        minMonthlyPurchase: f.minMonthlyPurchase,
        benefits: f.benefits,
      };
      const res = editId
        ? await updateSelectPlan({ ...payload, id: editId })
        : await createSelectPlan(payload);
      if (res.ok) {
        fechar();
        router.refresh();
      } else setErro(res.error);
    });
  }

  function alternar(p: PlanAdminRow) {
    setErro(null);
    start(async () => {
      const res = await toggleSelectPlan(p.id, !p.active);
      if (res.ok) router.refresh();
      else setErro(res.error);
    });
  }

  function excluir(id: string) {
    setErro(null);
    start(async () => {
      const res = await deleteSelectPlan(id);
      if (res.ok) {
        setConfirmDel(null);
        router.refresh();
      } else setErro(res.error);
    });
  }

  // Conta exibida embaixo do campo: base digitada + Build.Sales.
  const baseDigitada = parseMoney(f.monthlyAmount);
  const mensalFinal =
    baseDigitada != null && baseDigitada > 0 ? baseDigitada + BUILD_SALES_MONTHLY : null;

  return (
    <div className="space-y-4">
      {!aberto && (
        <Button variant="servico" onClick={novo}>
          <Plus className="h-4 w-4" /> Novo plano
        </Button>
      )}

      {aberto && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">
              {editId ? "Editar plano" : "Novo plano"}
            </h3>
            <button
              type="button"
              onClick={fechar}
              aria-label="Fechar"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 lg:col-span-2">
              <Label>Nome do plano *</Label>
              <Input
                value={f.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Ex.: Esmeralda"
              />
            </div>
            <div className="space-y-2">
              <Label>Validade (meses) *</Label>
              <Input
                value={f.validityMonths}
                onChange={(e) => set("validityMonths", e.target.value)}
                placeholder="12"
              />
            </div>
          </div>

          {/* Plano negociado: os três valores saem de cena porque não existe
              valor de tabela a guardar — cada adesão combina o seu. */}
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={f.editableValues}
              onChange={(e) => set("editableValues", e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <strong>Valores negociados a cada adesão</strong>
              <span className="block text-muted-foreground">
                Mensalidade, mínimo de compras e validade são digitados na hora
                de cadastrar cada Select. É como funciona o Diamante (Wincon).
              </span>
            </span>
          </label>

          {!f.editableValues && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Mensalidade base *</Label>
                <Input
                  value={f.monthlyAmount}
                  onChange={(e) => set("monthlyAmount", e.target.value)}
                  placeholder="597"
                />
                {/* A armadilha nº 1 deste cadastro, dita em voz alta. */}
                <p className="text-xs text-muted-foreground">
                  Valor <strong>sem</strong> o Build.Sales.{" "}
                  {mensalFinal != null ? (
                    <>
                      A cliente pagará{" "}
                      <strong className="text-servico-text">{formatBRL(mensalFinal)}</strong>/mês
                      (base + {formatBRL(BUILD_SALES_MONTHLY)}).
                    </>
                  ) : (
                    <>
                      O servidor soma {formatBRL(BUILD_SALES_MONTHLY)} do Build.Sales
                      na adesão.
                    </>
                  )}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Mínimo de compras mensal *</Label>
                <Input
                  value={f.minMonthlyPurchase}
                  onChange={(e) => set("minMonthlyPurchase", e.target.value)}
                  placeholder="6.000"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Benefícios</Label>
            <div className="space-y-2">
              {f.benefits.map((b, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex gap-2">
                    <Input
                      value={b.text}
                      onChange={(e) => setBeneficio(i, { text: e.target.value })}
                      placeholder={`Benefício ${i + 1}`}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => removerBeneficio(i)}
                      aria-label={`Remover benefício ${i + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {/* `htmlFor`/`id` em vez de aninhar o input no label: o texto
                      do benefício muda de posição quando linhas são removidas,
                      e o id por índice mantém o par clicável estável. */}
                  <div className="flex items-center gap-2 pl-1">
                    <input
                      type="checkbox"
                      id={`beneficio-roadmap-${i}`}
                      checked={b.executable}
                      onChange={(e) => setBeneficio(i, { executable: e.target.checked })}
                      className="h-4 w-4 rounded border-input accent-servico"
                    />
                    <Label
                      htmlFor={`beneficio-roadmap-${i}`}
                      className="text-xs font-normal text-muted-foreground"
                    >
                      Entra no roadmap de entrega
                    </Label>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" onClick={adicionarBeneficio}>
              <Plus className="h-4 w-4" /> Adicionar benefício
            </Button>
            <p className="text-xs text-muted-foreground">
              Aparecem na ordem desta lista, na tela de adesão. Linha em branco é
              descartada. Marcados viram etapas do roadmap de entrega do
              contrato e contam o progresso; desmarque os que não têm conclusão
              (suporte sob demanda, atendimento recorrente) — eles continuam
              aparecendo no plano, só ficam fora da régua.
            </p>
          </div>

          {editId && (plans.find((p) => p.id === editId)?.contractCount ?? 0) > 0 && (
            <p className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
              Este plano tem{" "}
              <strong>{plans.find((p) => p.id === editId)?.contractCount}</strong>{" "}
              contrato(s) vendido(s). Alterar nome ou valores aqui{" "}
              <strong>não</strong> reescreve nenhum deles: cada contrato guarda o
              que foi vendido. A mudança vale para as adesões novas.
            </p>
          )}

          {erro && <p className="text-sm text-destructive">{erro}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="servico" onClick={salvar} disabled={pending}>
              {pending ? "Salvando..." : editId ? "Salvar alterações" : "Cadastrar plano"}
            </Button>
            <Button variant="outline" onClick={fechar} disabled={pending}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {!aberto && erro && <p className="text-sm text-destructive">{erro}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-muted-foreground">
            <tr>
              <th className="py-2 pr-4">Plano</th>
              <th className="py-2 pr-4">Mensalidade</th>
              <th className="py-2 pr-4">Mínimo mensal</th>
              <th className="py-2 pr-4">Validade</th>
              <th className="py-2 pr-4">Benefícios</th>
              <th className="py-2 pr-4">Contratos</th>
              <th className="py-2 pr-4">Situação</th>
              <th className="py-2 pr-4">Ações</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} className="border-b border-border/60">
                <td className="py-2 pr-4 font-medium">{p.name}</td>
                <td className="py-2 pr-4">
                  {p.editableValues ? (
                    <span className="text-muted-foreground">negociada</span>
                  ) : (
                    <>
                      {formatBRL((p.monthlyAmount ?? 0) + BUILD_SALES_MONTHLY)}
                      <span className="block text-xs text-muted-foreground">
                        base {formatBRL(p.monthlyAmount ?? 0)}
                      </span>
                    </>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {p.minMonthlyPurchase == null ? (
                    <span className="text-muted-foreground">negociado</span>
                  ) : (
                    formatBRL(p.minMonthlyPurchase)
                  )}
                </td>
                <td className="py-2 pr-4 font-data">{p.validityMonths} m</td>
                <td className="py-2 pr-4">{p.benefits.length}</td>
                <td className="py-2 pr-4 font-data">{p.contractCount}</td>
                <td className="py-2 pr-4">
                  {p.active ? (
                    <span className="text-servico-text">Ativo</span>
                  ) : (
                    <span className="text-muted-foreground">Inativo</span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => editar(p)}
                      disabled={pending}
                      aria-label={`Editar ${p.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => alternar(p)}
                      disabled={pending}
                    >
                      {p.active ? "Desativar" : "Ativar"}
                    </Button>
                    {confirmDel === p.id ? (
                      <>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => excluir(p.id)}
                          disabled={pending}
                        >
                          Confirmar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmDel(null)}
                          disabled={pending}
                        >
                          Não
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => { setErro(null); setConfirmDel(p.id); }}
                        disabled={pending}
                        aria-label={`Excluir ${p.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {plans.length === 0 && (
              <tr>
                <td colSpan={8} className="py-4 text-center text-muted-foreground">
                  Nenhum plano cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
