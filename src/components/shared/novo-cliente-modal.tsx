"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { UserPlus, X } from "lucide-react";
import { createCustomer } from "@/lib/actions/sales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CustomerOpt } from "@/components/shared/customer-combobox";

/**
 * NOVO CLIENTE — cadastro em modal, sem sair do formulário em andamento.
 *
 * Existe para o "+ Novo cliente" do CustomerCombobox: quem está no meio de uma
 * adesão do Select descobre ali que a cliente não existe, e mandar essa pessoa
 * para /vendas/clientes jogaria fora tudo o que ela já preencheu.
 *
 * Os campos são os MESMOS da tela de cadastro de clientes, com os mesmos
 * obrigatórios (código e nome) — endereço e contato são opcionais ali e aqui.
 * Duas telas que cadastram a mesma coisa pedindo campos diferentes acabam
 * gerando duas qualidades de cadastro na mesma base.
 *
 * A gravação é a `createCustomer` já usada pela tela de clientes: o modal não
 * tem regra própria de validação nem caminho próprio até o banco.
 */
export function NovoClienteModal({
  initialName,
  onCreated,
  onClose,
}: {
  /** Termo digitado na busca, aproveitado como nome. */
  initialName?: string;
  /** Cliente gravada. Quem chama recebe pronta para selecionar. */
  onCreated: (customer: CustomerOpt) => void;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [f, setF] = useState({
    code: "",
    name: initialName ?? "",
    cep: "", street: "", district: "", city: "", state: "", contact: "",
  });

  useEffect(() => setPortalTarget(document.body), []);

  // ESC fecha. Um modal aberto por engano no meio de um formulário longo não
  // pode exigir mira no botão para sair.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function set(k: keyof typeof f, v: string) {
    setF((p) => ({ ...p, [k]: v }));
  }

  function salvar() {
    setErro(null);
    start(async () => {
      const res = await createCustomer(f);
      if (!res.ok) {
        setErro(res.error);
        return;
      }
      // `createCustomer` devolve id e nome. O código é o que acabamos de
      // enviar — e é por isso que esta action NÃO precisou mudar de contrato
      // para servir ao combobox (ela também atende o Novo Pedido).
      onCreated({
        id: res.data.id,
        code: f.code.trim(),
        name: res.data.name,
        cep: f.cep || null,
        street: f.street || null,
        district: f.district || null,
        city: f.city || null,
        state: f.state || null,
        contact: f.contact || null,
      });
    });
  }

  if (!portalTarget) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl animate-scale-in">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-vendas/15 text-vendas-text">
              <UserPlus className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-lg font-semibold leading-tight">Novo cliente</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Fica selecionada no formulário assim que for cadastrada.
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

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Código *</Label>
              <Input value={f.code} onChange={(e) => set("code", e.target.value)} placeholder="Código da cliente" />
            </div>
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input autoFocus value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Nome da cliente" />
            </div>
          </div>
          {/* Endereço e contato — todos opcionais, como na tela de clientes. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>CEP</Label>
              <Input value={f.cep} onChange={(e) => set("cep", e.target.value)} placeholder="00000-000" />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>Logradouro</Label>
              <Input value={f.street} onChange={(e) => set("street", e.target.value)} placeholder="Rua, Av..." />
            </div>
            <div className="space-y-2">
              <Label>Bairro</Label>
              <Input value={f.district} onChange={(e) => set("district", e.target.value)} placeholder="Bairro" />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>Cidade</Label>
              <Input value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="Cidade" />
            </div>
            <div className="space-y-2">
              <Label>UF</Label>
              <Input value={f.state} maxLength={2} onChange={(e) => set("state", e.target.value.toUpperCase())} placeholder="UF" />
            </div>
            <div className="space-y-2">
              <Label>Contato</Label>
              <Input value={f.contact} onChange={(e) => set("contact", e.target.value)} placeholder="Telefone / E-mail / Responsável" />
            </div>
          </div>
        </div>

        {erro && <p className="mt-3 text-sm text-destructive">{erro}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            variant="vendas"
            onClick={salvar}
            // Nome com 2+ caracteres é o que `createCustomerSchema` exige.
            // Habilitar com 1 trocaria uma dica clara por "Dados inválidos".
            disabled={pending || !f.code.trim() || f.name.trim().length < 2}
          >
            {pending ? "Salvando..." : "Cadastrar e selecionar"}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>,
    portalTarget,
  );
}
