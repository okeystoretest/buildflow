"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  getWhatsappPanelState,
  setWhatsappEnabled,
  resetWhatsappSession,
  type WhatsappPanelState,
} from "@/lib/actions/whatsapp";

const ROTULO: Record<string, string> = {
  DESCONECTADO: "Desconectado",
  AGUARDANDO_QR: "Aguardando leitura do QR",
  CONECTANDO: "Conectando...",
  CONECTADO: "Conectado",
  SEM_LIDERANCA: "Outro processo detém a conexão",
  BLOQUEADO: "Conexão bloqueada — precisa de intervenção",
};

const TOM: Record<string, string> = {
  CONECTADO: "border-motorista/40 bg-motorista/10 text-motorista",
  AGUARDANDO_QR: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  BLOQUEADO: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function WhatsappPanel() {
  const [info, setInfo] = useState<WhatsappPanelState | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const carregar = useCallback(async () => {
    const res = await getWhatsappPanelState();
    if (res.ok) { setInfo(res.data); setErro(null); }
    else setErro(res.error);
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  // Atualiza de 3 em 3s enquanto NAO estiver conectado.
  //
  // A condicao e "diferente de CONECTADO", e nao "igual a AGUARDANDO_QR": logo
  // apos o deploy o estado passa por DESCONECTADO e CONECTANDO, e so parar de
  // atualizar nesses casos deixava a tela congelada justamente no primeiro uso,
  // obrigando a recarregar a mao para ver o QR.
  //
  // O intervalo de 3s importa porque o QR expira em torno de 60s e e trocado.
  useEffect(() => {
    if (info?.state === "CONECTADO") return;
    const id = setInterval(() => { void carregar(); }, 3000);
    return () => clearInterval(id);
  }, [info?.state, carregar]);

  function alternarEnvio() {
    if (!info) return;
    start(async () => {
      const res = await setWhatsappEnabled(!info.enabled);
      if (res.ok) await carregar();
      else setErro(res.error);
    });
  }

  function reiniciar() {
    start(async () => {
      const res = await resetWhatsappSession();
      if (res.ok) await carregar();
      else setErro(res.error);
    });
  }

  if (!info) {
    return <p className="text-sm text-muted-foreground">Carregando status do WhatsApp...</p>;
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border px-3 py-2 text-sm font-semibold ${TOM[info.state] ?? "border-border bg-secondary/30"}`}>
        {ROTULO[info.state] ?? info.state}
        {info.connectedNumber && (
          <span className="ml-2 font-normal opacity-80">({info.connectedNumber})</span>
        )}
      </div>

      {info.qrDataUrl && (
        <div className="rounded-lg border border-border p-4">
          <p className="mb-2 text-sm font-medium">Escaneie com o WhatsApp do número da operação</p>
          <p className="mb-3 text-xs text-muted-foreground">
            No celular: Aparelhos conectados → Conectar um aparelho. O código é renovado
            automaticamente a cada poucos segundos.
          </p>
          {/* O QR usa <img> e nao next/image: e um data URL ja dimensionado, e o
              otimizador de imagens esta desligado no projeto (images.unoptimized). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={info.qrDataUrl} alt="QR Code do WhatsApp" width={280} height={280} />
        </div>
      )}

      <div className="rounded-lg border border-border p-4">
        <p className="font-medium">Envio de notificações</p>
        <p className="mb-3 text-sm text-muted-foreground">
          Quando desligado, nenhuma mensagem é enviada, mesmo com a conexão ativa.
          Use para interromper os disparos sem precisar de um novo deploy.
        </p>
        <Button variant={info.enabled ? "destructive" : "brand"} onClick={alternarEnvio} disabled={pending}>
          {info.enabled ? "Desligar envio" : "Ligar envio"}
        </Button>
      </div>

      <div className="rounded-lg border border-border p-4">
        <p className="font-medium">Trocar de número</p>
        <p className="mb-3 text-sm text-muted-foreground">
          Desconecta e apaga a sessão. Será necessário escanear um novo QR Code.
        </p>
        <Button variant="outline" onClick={reiniciar} disabled={pending}>
          Desconectar e reparear
        </Button>
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </div>
  );
}
