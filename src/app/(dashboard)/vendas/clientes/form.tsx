"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCustomer } from "@/lib/actions/sales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ClienteForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [f, setF] = useState({
    code: "", name: "",
    cep: "", street: "", district: "", city: "", state: "", contact: "",
  });

  function set(k: keyof typeof f, v: string) { setF((p) => ({ ...p, [k]: v })); }

  function onSubmit() {
    setMsg(null);
    start(async () => {
      const res = await createCustomer(f);
      if (res.ok) {
        setMsg({ ok: true, text: `Cliente "${res.data.name}" cadastrado.` });
        setF({ code: "", name: "", cep: "", street: "", district: "", city: "", state: "", contact: "" });
        router.refresh();
      } else setMsg({ ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2"><Label>Código *</Label><Input value={f.code} onChange={(e) => set("code", e.target.value)} /></div>
        <div className="space-y-2"><Label>Nome *</Label><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
      </div>
      {/* Endereço e contato — todos opcionais. Usados para pré-preencher o
          Endereço de Entrega no Novo Pedido (forma Excursão). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2"><Label>CEP</Label><Input value={f.cep} onChange={(e) => set("cep", e.target.value)} placeholder="00000-000" /></div>
        <div className="space-y-2 lg:col-span-2"><Label>Logradouro</Label><Input value={f.street} onChange={(e) => set("street", e.target.value)} placeholder="Rua, Av..." /></div>
        <div className="space-y-2"><Label>Bairro</Label><Input value={f.district} onChange={(e) => set("district", e.target.value)} placeholder="Bairro" /></div>
        <div className="space-y-2 lg:col-span-2"><Label>Cidade</Label><Input value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="Cidade" /></div>
        <div className="space-y-2"><Label>UF</Label><Input value={f.state} maxLength={2} onChange={(e) => set("state", e.target.value.toUpperCase())} placeholder="UF" /></div>
        <div className="space-y-2"><Label>Contato</Label><Input value={f.contact} onChange={(e) => set("contact", e.target.value)} placeholder="Telefone / E-mail / Responsável" /></div>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="vendas" onClick={onSubmit} disabled={pending || !f.name || !f.code}>{pending ? "Salvando..." : "Cadastrar"}</Button>
        {msg && <span className={`text-sm ${msg.ok ? "text-motorista" : "text-destructive"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
