"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getWhatsappPanelState,
  setWhatsappEnabled,
  resetWhatsappSession,
  getWhatsappLogs,
  type WhatsappPanelState,
  type WhatsappLogRow,
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
  const [logs, setLogs] = useState<WhatsappLogRow[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const carregar = useCallback(async () => {
    const res = await getWhatsappPanelState();
    if (res.ok) { setInfo(res.data); setErro(null); }
    else setErro(res.error);
  }, []);

  const carregarLogs = useCallback(async () => {
    const res = await getWhatsappLogs();
    if (res.ok) setLogs(res.data);
  }, []);

  useEffect(() => { void carregar(); void carregarLogs(); }, [carregar, carregarLogs]);

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

      {/* DIAGNOSTICO — mostra onde o boot parou. "Desconectado" sozinho e
          ambiguo: significa tanto "nunca iniciou" quanto "iniciou e falhou". */}
      <div className="rounded-lg border border-border p-4">
        <p className="mb-2 font-medium">Diagnóstico</p>
        {info.diag.bootAt == null ? (
          <p className="text-sm text-destructive">
            Nenhum boot registrado. A conexão não está sendo iniciada pelo servidor —
            a instrumentação do Next não rodou neste container.
          </p>
        ) : (
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Último boot</dt>
            <dd className="font-data">
              {new Date(info.diag.bootAt).toLocaleString("pt-BR")}
            </dd>
            <dt className="text-muted-foreground">Parou em</dt>
            <dd className="font-data">{info.diag.stage ?? "—"}</dd>
            <dt className="text-muted-foreground">Concessão</dt>
            <dd className="font-data">
              {info.diag.leaseAgeSec == null
                ? "nenhuma"
                : `${info.diag.leaseAlive ? "viva" : "vencida"} · ${info.diag.leaseAgeSec}s atrás`}
            </dd>
            {info.diag.lastError && (
              <>
                <dt className="text-muted-foreground">Último erro</dt>
                <dd className="whitespace-pre-wrap break-all text-destructive">
                  {info.diag.lastError}
                </dd>
              </>
            )}
          </dl>
        )}
      </div>

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

      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="font-medium">Histórico de envios</p>
            <p className="text-sm text-muted-foreground">
              Últimos {logs.length} registros, mais recentes primeiro. Um por motorista
              por disparo.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { void carregarLogs(); }} disabled={pending}>
            Atualizar
          </Button>
        </div>

        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum envio registrado até agora.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Quando</th>
                  <th className="py-2 pr-4">Motorista</th>
                  <th className="py-2 pr-4">Número</th>
                  <th className="py-2 pr-4">Pedido</th>
                  <th className="py-2 pr-4">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap py-2 pr-4">
                      {new Date(l.createdAt).toLocaleString("pt-BR", {
                        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2 pr-4">{l.driverName}</td>
                    {/* So o final do numero: o telefone completo nunca sai do servidor. */}
                    <td className="py-2 pr-4 font-data">
                      {l.phoneSuffix ? `•••• ${l.phoneSuffix}` : "—"}
                    </td>
                    <td className="py-2 pr-4">{l.orderNumber ?? "—"}</td>
                    <td className="py-2 pr-4">
                      {l.status === "ENVIADO" && <Badge variant="motorista">Enviado</Badge>}
                      {l.status === "FALHOU" && (
                        // Badge nao tem variante destrutiva; o design system e
                        // compartilhado com outras telas, entao a cor vem por
                        // className em vez de virar uma variante nova.
                        <div className="flex flex-col items-start gap-0.5">
                          <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
                            Falhou
                          </Badge>
                          {l.error && (
                            <span className="text-[11px] text-muted-foreground">{l.error}</span>
                          )}
                        </div>
                      )}
                      {l.status === "IGNORADO" && (
                        <div className="flex flex-col items-start gap-0.5">
                          <Badge variant="secondary">Ignorado</Badge>
                          {l.error && (
                            <span className="text-[11px] text-muted-foreground">{l.error}</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </div>
  );
}
