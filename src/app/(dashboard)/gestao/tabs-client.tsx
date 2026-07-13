"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createSimple, toggleSimple, renameSimple, deleteSimple,
  createOperation, renameOperation,
  createUser, updateUser, toggleUser, deleteUser,
} from "@/lib/actions/management";
import {
  createSalesGoal, deleteSalesGoal,
  createCampaign, renameCampaign, toggleCampaign, deleteCampaign,
} from "@/lib/actions/goals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CrudTable, type CrudRow } from "@/components/shared/crud-table";
import { CsvImport } from "@/components/shared/csv-import";
import { ClientesManager, type ClienteRow } from "@/app/(dashboard)/vendas/clientes/manager-client";
import { importUsersCsv, importOperationsCsv, importCustomersCsv } from "@/lib/actions/import";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { formatBRL } from "@/lib/utils";
import type { Role, SalesModel } from "@prisma/client";

interface Row { id: string; name: string; active: boolean; }
interface OpRow { id: string; code: string; name: string; active: boolean; }
interface UserRow { id: string; name: string; email: string; role: Role; active: boolean; salesModel: SalesModel | null; }
interface SellerOpt { id: string; name: string; salesModel: SalesModel | null; }
interface GoalRow { id: string; userName: string; amount: number; targetItems: number | null; month: number; year: number; scope: SalesModel; campaignName: string | null; }
interface CampaignRow { id: string; name: string; active: boolean; }
interface CampaignOpt { id: string; name: string; }

type SimpleEntity = "store" | "orderType" | "shippingMethod";

const TABS = ["Usuários", "Clientes", "Metas", "Campanhas", "Lojas", "Tipos de Pedido", "Operações", "Formas de Envio"] as const;

export function GestaoTabs(props: {
  users: UserRow[]; stores: Row[]; orderTypes: Row[]; operations: OpRow[]; shippingMethods: Row[];
  sellers: SellerOpt[]; goals: GoalRow[]; campaigns: CampaignRow[]; activeCampaigns: CampaignOpt[];
  customers: ClienteRow[];
  currentMonth: number; currentYear: number;
  // Periodo das metas exibidas (pode ser um mes passado no modo historico).
  goalPeriodMonth: number; goalPeriodYear: number; isCurrentGoalPeriod: boolean;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Usuários");

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Usuários" && <UsersPanel users={props.users} />}
      {tab === "Clientes" && <CustomersPanel customers={props.customers} />}
      {tab === "Metas" && <GoalsPanel sellers={props.sellers} goals={props.goals} activeCampaigns={props.activeCampaigns} month={props.currentMonth} year={props.currentYear} periodMonth={props.goalPeriodMonth} periodYear={props.goalPeriodYear} isCurrentPeriod={props.isCurrentGoalPeriod} />}
      {tab === "Campanhas" && <CampaignsPanel campaigns={props.campaigns} />}
      {tab === "Lojas" && <SimplePanel entity="store" rows={props.stores} label="loja" />}
      {tab === "Tipos de Pedido" && <SimplePanel entity="orderType" rows={props.orderTypes} label="tipo de pedido" />}
      {tab === "Operações" && <OperationPanel rows={props.operations} />}
      {tab === "Formas de Envio" && <SimplePanel entity="shippingMethod" rows={props.shippingMethods} label="forma de envio" />}
    </div>
  );
}

function SimplePanel({ entity, rows, label }: { entity: SimpleEntity; rows: Row[]; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    start(async () => {
      const res = await createSimple(entity, name);
      if (res.ok) { setName(""); router.refresh(); } else setError(res.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input placeholder={`Nova ${label}...`} value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button variant="brand" onClick={add} disabled={pending || !name}>Adicionar</Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <CrudTable
        rows={rows as CrudRow[]}
        onRename={(id, n) => renameSimple(entity, id, n)}
        onToggle={(id, a) => toggleSimple(entity, id, a)}
        onDelete={(id) => deleteSimple(entity, id)}
      />
    </div>
  );
}

function OperationPanel({ rows }: { rows: OpRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [eCode, setECode] = useState("");
  const [eName, setEName] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  function add() {
    setError(null);
    start(async () => {
      const res = await createOperation({ code, name });
      if (res.ok) { setCode(""); setName(""); router.refresh(); } else setError(res.error);
    });
  }
  function saveEdit(id: string) {
    start(async () => {
      const res = await renameOperation(id, eCode, eName);
      if (res.ok) { setEditId(null); router.refresh(); } else setError(res.error);
    });
  }
  function toggle(id: string, active: boolean) {
    start(async () => { await toggleSimple("operation", id, !active); router.refresh(); });
  }
  function del(id: string) {
    start(async () => {
      const res = await deleteSimple("operation", id);
      if (res.ok) { setConfirmDel(null); router.refresh(); } else { setError(res.error); setConfirmDel(null); }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input className="w-32" placeholder="Código" value={code} onChange={(e) => setCode(e.target.value)} />
        <Input placeholder="Nome da operação" value={name} onChange={(e) => setName(e.target.value)} />
        <Button variant="brand" onClick={add} disabled={pending || !code || !name}>Adicionar</Button>
      </div>
      <CsvImport
        title="Importar operações via CSV"
        description="Cadastre várias operações de uma vez enviando um arquivo .csv."
        columns={["codigo", "nome"]}
        sample={["OP01", "Venda balcão"]}
        action={importOperationsCsv}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-muted-foreground">
          <tr><th className="py-2 pr-4">Código</th><th className="py-2 pr-4">Nome</th><th className="py-2 pr-4">Ativo</th><th className="py-2 pr-4 text-right">Ações</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
              <td className="py-2 pr-4 font-data">{editId === r.id ? <Input className="h-8 w-24" value={eCode} onChange={(e) => setECode(e.target.value)} /> : r.code}</td>
              <td className="py-2 pr-4">{editId === r.id ? <Input className="h-8" value={eName} onChange={(e) => setEName(e.target.value)} /> : r.name}</td>
              <td className="py-2 pr-4">{r.active ? <Badge variant="motorista">Sim</Badge> : <Badge variant="secondary">Não</Badge>}</td>
              <td className="py-2 pr-4">
                <div className="flex justify-end gap-1">
                  {editId === r.id ? (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => saveEdit(r.id)} disabled={pending}><Check className="h-4 w-4 text-motorista" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => { setEditId(r.id); setECode(r.code); setEName(r.name); }}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="outline" size="sm" onClick={() => toggle(r.id, r.active)} disabled={pending}>{r.active ? "Desativar" : "Ativar"}</Button>
                      {confirmDel === r.id ? (
                        <span className="flex items-center gap-1">
                          <Button variant="destructive" size="sm" onClick={() => del(r.id)} disabled={pending}>Confirmar</Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDel(null)}>Não</Button>
                        </span>
                      ) : (
                        <Button variant="ghost" size="icon" onClick={() => setConfirmDel(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      )}
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">Nenhuma operação.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function UsersPanel({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const EMPTY = { name: "", email: "", password: "", role: "VENDAS" as Role, salesModel: "VAREJO" as SalesModel };
  const [f, setF] = useState(EMPTY);
  // Quando != null, o formulario esta EDITANDO este usuario (em vez de criar).
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const editando = editId !== null;

  // Carrega o usuario no formulario para edicao. A senha fica em branco:
  // preencher so se quiser trocar.
  function startEdit(u: UserRow) {
    setEditId(u.id);
    setF({
      name: u.name,
      email: u.email,
      password: "",
      role: u.role as Role,
      salesModel: (u.salesModel ?? "VAREJO") as SalesModel,
    });
    setError(null);
    setMsg(null);
    // Leva o usuario ate o formulario (ele fica no topo do painel).
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditId(null);
    setF(EMPTY);
    setError(null);
    setMsg(null);
  }

  function save() {
    setError(null);
    setMsg(null);
    start(async () => {
      const salesModel = f.role === "VENDAS" ? f.salesModel : null;
      const res = editId
        ? await updateUser({
            id: editId,
            name: f.name,
            email: f.email,
            // Senha vazia = mantem a atual.
            password: f.password.trim() || undefined,
            role: f.role,
            salesModel,
          })
        : await createUser({ ...f, salesModel });

      if (res.ok) {
        setMsg(editId ? "Usuário atualizado." : "Usuário criado.");
        setEditId(null);
        setF(EMPTY);
        router.refresh();
      } else setError(res.error);
    });
  }

  function toggle(id: string, active: boolean) {
    start(async () => { await toggleUser(id, !active); router.refresh(); });
  }
  function del(id: string) {
    start(async () => {
      const res = await deleteUser(id);
      if (res.ok) { setConfirmDel(null); router.refresh(); } else { setError(res.error); setConfirmDel(null); }
    });
  }

  // Ao criar, senha e obrigatoria. Ao editar, e opcional.
  const podeSalvar = !!f.name && !!f.email && (editando || f.password.length >= 6);

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border p-4 space-y-3 ${editando ? "border-primary bg-primary/5" : "border-border"}`}>
        <div className="flex items-center justify-between">
          <p className="font-medium">{editando ? "Editar usuário" : "Novo usuário"}</p>
          {editando && (
            <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={pending}>
              <X className="h-4 w-4" /> Cancelar edição
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input placeholder="Ex: Maria Souza" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <FieldHint>Nome completo do usuário.</FieldHint>
          </div>
          <div className="space-y-1">
            <Label>Usuário</Label>
            <Input placeholder="Ex: Maria#BF" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <FieldHint>Login de acesso ao sistema (deve ser único).</FieldHint>
          </div>
          <div className="space-y-1">
            <Label>Senha</Label>
            <PasswordInput
              placeholder={editando ? "Deixe em branco para manter" : "Mínimo 6 caracteres"}
              value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
            />
            <FieldHint>
              {editando
                ? "Preencha apenas se quiser trocar a senha (mín. 6 caracteres)."
                : "Senha de acesso ao sistema (mínimo 6 caracteres)."}
            </FieldHint>
          </div>
          <div className="space-y-1">
            <Label>Perfil</Label>
            <select className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm"
              value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
              <option value="GESTAO">Gestão</option>
              <option value="VENDAS">Vendas</option>
              <option value="FINANCEIRO">Financeiro</option>
              <option value="LOGISTICA">Logística</option>
              <option value="MOTORISTA">Motorista</option>
            </select>
            <FieldHint>Define quais funcionalidades o usuário pode acessar.</FieldHint>
          </div>
          {f.role === "VENDAS" && (
            <div className="space-y-1">
              <Label>Modelo de Venda</Label>
              <select className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm"
                value={f.salesModel} onChange={(e) => setF({ ...f, salesModel: e.target.value as SalesModel })}>
                <option value="VAREJO">Varejo</option>
                <option value="ATACADO">Atacado</option>
              </select>
              <FieldHint>Obrigatório para vendedores; trava o escopo das vendas.</FieldHint>
            </div>
          )}
        </div>
        <div>
          <Button variant="brand" onClick={save} disabled={pending || !podeSalvar}>
            {pending ? "Salvando..." : editando ? "Salvar alterações" : "Criar usuário"}
          </Button>
          {!editando && <FieldHint>Cria um único usuário. Para vários de uma vez, use a importação abaixo.</FieldHint>}
        </div>
        {msg && <p className="text-sm text-motorista">{msg}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <CsvImport
        title="Importar usuários via CSV"
        description="Cadastro em lote. Perfil aceita: Gestao, Vendas, Financeiro, Logistica, Motorista. Modelo (Varejo/Atacado) só para Vendas."
        columns={["nome", "usuario", "senha", "perfil", "modelo"]}
        sample={["Maria Souza", "Maria#bBF", "senha123", "Vendas", "Varejo"]}
        action={importUsersCsv}
      />

      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-muted-foreground">
          <tr><th className="py-2 pr-4">Nome</th><th className="py-2 pr-4">Usuário</th><th className="py-2 pr-4">Perfil</th><th className="py-2 pr-4">Modelo</th><th className="py-2 pr-4">Ativo</th><th className="py-2 pr-4 text-right">Ações</th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={`border-b border-border last:border-0 hover:bg-secondary/50 ${editId === u.id ? "bg-primary/5" : ""}`}>
              <td className="py-2 pr-4 font-medium">{u.name}</td>
              <td className="py-2 pr-4">{u.email}</td>
              <td className="py-2 pr-4">{u.role}</td>
              <td className="py-2 pr-4">{u.salesModel ? (u.salesModel === "VAREJO" ? "Varejo" : "Atacado") : "—"}</td>
              <td className="py-2 pr-4">{u.active ? <Badge variant="motorista">Sim</Badge> : <Badge variant="secondary">Não</Badge>}</td>
              <td className="py-2 pr-4">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" onClick={() => startEdit(u)} disabled={pending} aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toggle(u.id, u.active)} disabled={pending}>{u.active ? "Desativar" : "Ativar"}</Button>
                  {confirmDel === u.id ? (
                    <span className="flex items-center gap-1">
                      <Button variant="destructive" size="sm" onClick={() => del(u.id)} disabled={pending}>Confirmar</Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDel(null)}>Não</Button>
                    </span>
                  ) : (
                    <Button variant="ghost" size="icon" onClick={() => setConfirmDel(u.id)} aria-label="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
// ===== Painel de Clientes (Gestao) =====
function CustomersPanel({ customers }: { customers: ClienteRow[] }) {
  return (
    <div className="space-y-4">
      <CsvImport
        title="Importar clientes via CSV"
        description="Cadastro rápido em lote. Colunas: código e nome. Código duplicado é ignorado."
        columns={["codigo", "nome"]}
        sample={["CLI-0001", "Loja do João"]}
        action={importCustomersCsv}
      />
      {/* A base tem dezenas de milhares de clientes. Aqui mostramos apenas uma
          amostra; a busca e a paginacao completas ficam na tela dedicada. */}
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
        Mostrando apenas os primeiros clientes. Para buscar e navegar por toda a base,
        use a tela{" "}
        <a href="/vendas/clientes" className="font-semibold underline underline-offset-2">
          Vendas › Clientes
        </a>.
      </div>
      <ClientesManager customers={customers} />
    </div>
  );
}


// ===== Painel de Metas financeiras =====
function GoalsPanel({ sellers, goals, activeCampaigns, month, year, periodMonth, periodYear, isCurrentPeriod }: {
  sellers: SellerOpt[]; goals: GoalRow[]; activeCampaigns: CampaignOpt[]; month: number; year: number;
  periodMonth: number; periodYear: number; isCurrentPeriod: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState(0);
  const [targetItems, setTargetItems] = useState(0);
  const [m, setM] = useState(month);
  const [y, setY] = useState(year);
  // "" = Geral; senao = id da campanha vinculada.
  const [campaignId, setCampaignId] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Seletores do periodo do HISTORICO (navegam via querystring, sem apagar nada).
  const [histM, setHistM] = useState(periodMonth);
  const [histY, setHistY] = useState(periodYear);

  const MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const nowYear = new Date().getFullYear();
  const anos = Array.from({ length: 5 }, (_, i) => nowYear - i);

  // Ao navegar o historico, o formulario de cadastro acompanha o periodo.
  useEffect(() => { setM(periodMonth); setY(periodYear); }, [periodMonth, periodYear]);

  function verPeriodo(mm: number, yy: number) {
    setHistM(mm); setHistY(yy);
    router.push(`/gestao?goalMonth=${mm}&goalYear=${yy}`);
  }
  function voltarAtual() {
    const now = new Date();
    verPeriodo(now.getMonth() + 1, now.getFullYear());
  }

  // Geral usa valor (R$); Campanha usa quantidade de itens.
  const isCampaign = campaignId !== "";
  const selectedSeller = sellers.find((s) => s.id === userId);
  // O escopo segue o modelo de venda do vendedor selecionado.
  const scope = selectedSeller?.salesModel ?? null;

  function add() {
    setError(null);
    if (!scope) { setError("Selecione um vendedor com Modelo de Venda definido."); return; }
    start(async () => {
      const res = await createSalesGoal({
        userId, amount, month: m, year: y, scope,
        campaignId: campaignId || null,
        targetItems: isCampaign ? targetItems : undefined,
      });
      if (res.ok) { setAmount(0); setTargetItems(0); router.refresh(); } else setError(res.error);
    });
  }
  function del(id: string) {
    start(async () => { await deleteSalesGoal(id); router.refresh(); });
  }

  const valido = isCampaign ? targetItems > 0 : amount > 0;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Defina se a meta é <strong>Geral</strong> (faturamento em R$) ou vinculada a uma
        <strong> Campanha</strong> ativa (quantidade de itens). O escopo (Varejo/Atacado)
        segue o Modelo de Venda do vendedor.
      </p>

      {/* Barra de histórico: navega entre meses sem apagar metas antigas. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 p-2">
        <span className="text-sm font-medium">Período exibido:</span>
        <select className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
          value={histM} onChange={(e) => verPeriodo(Number(e.target.value), histY)}>
          {MESES.map((nome, i) => <option key={i} value={i + 1}>{nome}</option>)}
        </select>
        <select className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
          value={histY} onChange={(e) => verPeriodo(histM, Number(e.target.value))}>
          {anos.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {!isCurrentPeriod && (
          <>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-500">
              Histórico
            </span>
            <Button variant="outline" size="sm" onClick={voltarAtual}>Voltar ao mês atual</Button>
          </>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <FieldHelp label="Vendedor" help="Quem recebe a meta. O escopo (Varejo/Atacado) vem do cadastro dele.">
          <select className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm"
            value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Vendedor...</option>
            {sellers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.salesModel === "ATACADO" ? "Atacado" : "Varejo"})</option>)}
          </select>
        </FieldHelp>

        <FieldHelp label="Vínculo" help="Geral = meta em R$. Campanha = meta por quantidade de itens.">
          <select className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm"
            value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">Geral</option>
            {activeCampaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FieldHelp>

        {isCampaign ? (
          <FieldHelp label="Qtd. de itens" help="Total de peças que o vendedor deve vender nesta campanha.">
            <Input type="number" min={1} step="1" placeholder="Ex: 50"
              value={targetItems || ""} onChange={(e) => setTargetItems(Number(e.target.value))} />
          </FieldHelp>
        ) : (
          <FieldHelp label="Meta (R$)" help="Faturamento alvo do mês para este vendedor.">
            <Input type="number" min={0} step="0.01" placeholder="Ex: 30000"
              value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} />
          </FieldHelp>
        )}

        <FieldHelp label="Mês" help="Mês de vigência (1 a 12).">
          <Input type="number" min={1} max={12} placeholder="Mês" value={m} onChange={(e) => setM(Number(e.target.value))} />
        </FieldHelp>

        <FieldHelp label="Ano" help="Ano de vigência da meta.">
          <Input type="number" placeholder="Ano" value={y} onChange={(e) => setY(Number(e.target.value))} />
        </FieldHelp>

        <div className="flex items-end">
          <Button variant="brand" className="w-full" onClick={add} disabled={pending || !userId || !valido}>Salvar meta</Button>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-muted-foreground">
          <tr><th className="py-2 pr-4">Vendedor</th><th className="py-2 pr-4">Meta</th><th className="py-2 pr-4">Vínculo</th><th className="py-2 pr-4">Período</th><th className="py-2 pr-4">Escopo</th><th className="py-2 pr-4 text-right">Ações</th></tr>
        </thead>
        <tbody>
          {goals.map((g) => (
            <tr key={g.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
              <td className="py-2 pr-4 font-medium">{g.userName}</td>
              <td className="py-2 pr-4 font-data">
                {g.campaignName
                  ? `${g.targetItems ?? 0} itens`
                  : formatBRL(g.amount)}
              </td>
              <td className="py-2 pr-4">
                {g.campaignName
                  ? <Badge variant="vendas">{g.campaignName}</Badge>
                  : <Badge variant="secondary">Geral</Badge>}
              </td>
              <td className="py-2 pr-4 font-data">{String(g.month).padStart(2, "0")}/{g.year}</td>
              <td className="py-2 pr-4">{g.scope === "ATACADO" ? "Atacado" : "Varejo"}</td>
              <td className="py-2 pr-4 text-right">
                <Button variant="ghost" size="icon" onClick={() => del(g.id)} disabled={pending}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </td>
            </tr>
          ))}
          {goals.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">Nenhuma meta em {String(periodMonth).padStart(2, "0")}/{periodYear}.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}


// ===== Painel de Campanhas (cadastro simples: apenas o nome) =====
function CampaignsPanel({ campaigns }: { campaigns: CampaignRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  function create() {
    setError(null);
    start(async () => {
      const res = await createCampaign({ name });
      if (res.ok) { setName(""); router.refresh(); } else setError(res.error);
    });
  }
  function startEdit(c: CampaignRow) { setEditId(c.id); setEditName(c.name); }
  function saveEdit() {
    setError(null);
    start(async () => {
      const res = await renameCampaign({ id: editId!, name: editName });
      if (res.ok) { setEditId(null); router.refresh(); } else setError(res.error);
    });
  }
  function toggleC(id: string, active: boolean) {
    start(async () => { await toggleCampaign(id, !active); router.refresh(); });
  }
  function del(id: string) {
    start(async () => {
      const res = await deleteCampaign(id);
      if (res.ok) router.refresh(); else setError(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Cadastre apenas o <strong>nome</strong> da campanha. As metas vinculadas são definidas na aba <strong>Metas</strong>.
      </p>
      <div className="rounded-lg border border-border p-4 space-y-3">
        <p className="font-medium">Nova campanha</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input placeholder="Nome da campanha" value={name} onChange={(e) => setName(e.target.value)} />
          <div>
            <Button variant="brand" onClick={create} disabled={pending || !name.trim()}>Criar campanha</Button>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-muted-foreground">
          <tr><th className="py-2 pr-4">Campanha</th><th className="py-2 pr-4">Ativa</th><th className="py-2 pr-4 text-right">Ações</th></tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
              <td className="py-2 pr-4 font-medium">
                {editId === c.id
                  ? <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 max-w-xs" />
                  : c.name}
              </td>
              <td className="py-2 pr-4">{c.active ? <Badge variant="motorista">Sim</Badge> : <Badge variant="secondary">Não</Badge>}</td>
              <td className="py-2 pr-4">
                <div className="flex justify-end gap-1">
                  {editId === c.id ? (
                    <>
                      <Button variant="ghost" size="icon" onClick={saveEdit} disabled={pending || !editName.trim()}><Check className="h-4 w-4 text-vendas" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => startEdit(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="outline" size="sm" onClick={() => toggleC(c.id, c.active)} disabled={pending}>{c.active ? "Desativar" : "Ativar"}</Button>
                      <Button variant="ghost" size="icon" onClick={() => del(c.id)} disabled={pending}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {campaigns.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-muted-foreground">Nenhuma campanha.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// Campo de formulário com rótulo e texto de ajuda inline (melhora o
// entendimento de cada campo no cadastro de metas).
function FieldHelp({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-foreground">{label}</label>
      {children}
      <p className="text-[11px] leading-tight text-muted-foreground">{help}</p>
    </div>
  );
}
