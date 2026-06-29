"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createSimple, toggleSimple, renameSimple, deleteSimple,
  createOperation, renameOperation,
  createUser, toggleUser, deleteUser,
} from "@/lib/actions/management";
import {
  createSalesGoal, deleteSalesGoal,
  createCampaign, renameCampaign, toggleCampaign, deleteCampaign,
} from "@/lib/actions/goals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      {tab === "Metas" && <GoalsPanel sellers={props.sellers} goals={props.goals} activeCampaigns={props.activeCampaigns} month={props.currentMonth} year={props.currentYear} />}
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
  const [f, setF] = useState({ name: "", email: "", password: "", role: "VENDAS" as Role, salesModel: "VAREJO" as SalesModel });
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  function add() {
    setError(null);
    start(async () => {
      const res = await createUser({
        ...f,
        salesModel: f.role === "VENDAS" ? f.salesModel : null,
      });
      if (res.ok) { setF({ name: "", email: "", password: "", role: "VENDAS", salesModel: "VAREJO" }); router.refresh(); }
      else setError(res.error);
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

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-4 space-y-3">
        <p className="font-medium">Novo usuário</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input placeholder="Ex: Maria Souza" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <FieldHint>Nome completo que aparece nos relatórios.</FieldHint>
          </div>
          <div className="space-y-1">
            <Label>Usuário</Label>
            <Input placeholder="Ex: maria@buildflow.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <FieldHint>É o login de acesso ao sistema (deve ser único).</FieldHint>
          </div>
          <div className="space-y-1">
            <Label>Senha</Label>
            <Input placeholder="Mínimo 6 caracteres" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            <FieldHint>O usuário pode alterar depois com você.</FieldHint>
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
            <FieldHint>Define o que o usuário pode acessar.</FieldHint>
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
          <Button variant="brand" onClick={add} disabled={pending || !f.name || !f.email || !f.password}>Criar usuário</Button>
          <FieldHint>Cria um único usuário. Para vários de uma vez, use a importação abaixo.</FieldHint>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <CsvImport
        title="Importar usuários via CSV"
        description="Cadastro em lote. Perfil aceita: Gestao, Vendas, Financeiro, Logistica, Motorista. Modelo (Varejo/Atacado) só para Vendas."
        columns={["nome", "usuario", "senha", "perfil", "modelo"]}
        sample={["Maria Souza", "maria@buildflow.com", "senha123", "Vendas", "Varejo"]}
        action={importUsersCsv}
      />

      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-muted-foreground">
          <tr><th className="py-2 pr-4">Nome</th><th className="py-2 pr-4">Usuário</th><th className="py-2 pr-4">Perfil</th><th className="py-2 pr-4">Modelo</th><th className="py-2 pr-4">Ativo</th><th className="py-2 pr-4 text-right">Ações</th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
              <td className="py-2 pr-4 font-medium">{u.name}</td>
              <td className="py-2 pr-4">{u.email}</td>
              <td className="py-2 pr-4">{u.role}</td>
              <td className="py-2 pr-4">{u.salesModel ? (u.salesModel === "VAREJO" ? "Varejo" : "Atacado") : "—"}</td>
              <td className="py-2 pr-4">{u.active ? <Badge variant="motorista">Sim</Badge> : <Badge variant="secondary">Não</Badge>}</td>
              <td className="py-2 pr-4">
                <div className="flex justify-end gap-1">
                  <Button variant="outline" size="sm" onClick={() => toggle(u.id, u.active)} disabled={pending}>{u.active ? "Desativar" : "Ativar"}</Button>
                  {confirmDel === u.id ? (
                    <span className="flex items-center gap-1">
                      <Button variant="destructive" size="sm" onClick={() => del(u.id)} disabled={pending}>Confirmar</Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDel(null)}>Não</Button>
                    </span>
                  ) : (
                    <Button variant="ghost" size="icon" onClick={() => setConfirmDel(u.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
      <ClientesManager customers={customers} />
    </div>
  );
}


// ===== Painel de Metas financeiras =====
function GoalsPanel({ sellers, goals, activeCampaigns, month, year }: {
  sellers: SellerOpt[]; goals: GoalRow[]; activeCampaigns: CampaignOpt[]; month: number; year: number;
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
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <select className="h-10 rounded-lg border border-input bg-background px-2 text-sm"
          value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Vendedor...</option>
          {sellers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.salesModel === "ATACADO" ? "Atacado" : "Varejo"})</option>)}
        </select>
        <select className="h-10 rounded-lg border border-input bg-background px-2 text-sm"
          value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
          <option value="">Geral</option>
          {activeCampaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {isCampaign ? (
          <Input type="number" min={1} step="1" placeholder="Qtd. de itens"
            value={targetItems || ""} onChange={(e) => setTargetItems(Number(e.target.value))} />
        ) : (
          <Input type="number" min={0} step="0.01" placeholder="Meta R$"
            value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} />
        )}
        <Input type="number" min={1} max={12} placeholder="Mês" value={m} onChange={(e) => setM(Number(e.target.value))} />
        <Input type="number" placeholder="Ano" value={y} onChange={(e) => setY(Number(e.target.value))} />
        <Button variant="brand" onClick={add} disabled={pending || !userId || !valido}>Salvar meta</Button>
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
          {goals.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">Nenhuma meta no mês atual.</td></tr>}
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
