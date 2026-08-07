import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { notFound } from "next/navigation";
import { EtiquetaAutoPrint } from "./auto-print";

// Etiqueta térmica (Zebra) 105 x 140 mm para pedidos com forma de envio que
// exige endereço (ex.: "1 - Excursão"). Página standalone (fora do shell do
// dashboard) para imprimir limpa. Abre em nova aba e dispara a impressão.
//
// Layout do adesivo:
//   - Comanda em tipografia GRANDE e destacada (topo)
//   - Código + Nome da cliente
//   - Nome da vendedora
//   - Endereço completo (CEP, logradouro, número, bairro, cidade, UF)
//   - Informações complementares de envio (observações)
export default async function EtiquetaPage({ params }: { params: { id: string } }) {
  // Somente papéis que operam vendas/logística podem imprimir.
  await requireRole(["GESTAO", "VENDAS", "FINANCEIRO", "LOGISTICA"]);

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { customer: true, seller: true, shippingMethod: true, excursao: true },
  });
  if (!order) notFound();

  const requiresAddress = order.shippingMethod?.requiresAddress === true;

  // Só faz sentido para formas de envio que exigem endereço.
  if (!requiresAddress) {
    return (
      <main style={{ fontFamily: "system-ui", padding: 24 }}>
        <h1 style={{ fontSize: 18 }}>Etiqueta indisponível</h1>
        <p>Este pedido não usa uma forma de envio com endereço (Excursão).</p>
      </main>
    );
  }

  const comanda = order.comandaNumber ?? order.orderNumber;
  const enderecoLinha1 = [order.shipStreet, order.shipNumber].filter(Boolean).join(", ");
  const enderecoLinha2 = [order.shipDistrict, order.shipCity, order.shipState]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <EtiquetaAutoPrint />
      <style>{`
        @page { size: 105mm 140mm; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .etq {
          width: 105mm; height: 140mm; padding: 5mm; 
          font-family: "Helvetica Neue", Arial, sans-serif; color: #000;
          display: flex; flex-direction: column; gap: 2.5mm;
        }
        /* Cada bloco de informação é delimitado por borda própria, para
           separação visual clara dos dados na etiqueta. */
        .etq-block { border: 1.5pt solid #000; border-radius: 2mm; padding: 2.5mm 3mm; }
        .etq-comanda {
          border: 3pt solid #000; border-radius: 3mm; text-align: center;
          padding: 3mm 2mm;
        }
        .etq-comanda .rot { font-size: 9pt; letter-spacing: .12em; text-transform: uppercase; font-weight: 700; }
        .etq-comanda .num { font-size: 44pt; font-weight: 900; line-height: 1; margin-top: 1mm; letter-spacing: .02em; }
        .etq-sec { font-size: 10.5pt; line-height: 1.28; }
        .etq-sec .lbl { font-size: 7.5pt; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; color: #000; }
        .etq-sec .val { font-size: 12pt; font-weight: 700; }
        /* Código do cliente: destaque próprio, exibido ANTES do nome. */
        .etq-cli-cod {
          display: inline-block; border: 1.5pt solid #000; border-radius: 2mm;
          padding: 0 2mm; font-weight: 900; font-size: 13pt; margin-bottom: .8mm;
        }
        .etq-addr .l1 { font-size: 13pt; font-weight: 800; }
        .etq-addr .l2 { font-size: 11pt; font-weight: 600; margin-top: .8mm; }
        .etq-addr .cep { font-size: 11pt; font-weight: 700; margin-top: .8mm; }
        .etq-foot { margin-top: auto; font-size: 9pt; }
        .etq-foot .lbl { font-size: 7pt; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; }
      `}</style>

      <div className="etq">
        {/* Comanda em destaque */}
        <div className="etq-comanda">
          <div className="rot">Comanda</div>
          <div className="num">{comanda}</div>
        </div>

        {/* Cliente — Código ANTES do Nome, cada um com destaque próprio */}
        <div className="etq-block etq-sec">
          <span className="lbl">Cliente</span>
          {order.customer.code && <div className="etq-cli-cod">{order.customer.code}</div>}
          <div className="val">{order.customer.name}</div>
        </div>

        {/* Vendedora */}
        <div className="etq-block etq-sec">
          <span className="lbl">Vendedora</span>
          <div className="val">{order.seller.name}</div>
        </div>

        {/* Excursão (despacho) — endereço da excursão vinculada, exibido
            somente na etiqueta. Independente do endereço do cliente. */}
        {order.excursao && (
          <div className="etq-block etq-sec etq-addr">
            <span className="lbl">Excursão · Despacho</span>
            <div className="l1">{order.excursao.name}</div>
            <div className="l2">{order.excursao.address}</div>
            {(order.excursao.operatingDays || order.excursao.cutoffTime) && (
              <div className="l2">
                {[
                  order.excursao.operatingDays ? `Dias: ${order.excursao.operatingDays}` : "",
                  order.excursao.cutoffTime ? `Até às ${order.excursao.cutoffTime}` : "",
                ].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
        )}

        {/* Endereço de entrega do cliente */}
        <div className="etq-block etq-sec etq-addr">
          <span className="lbl">Endereço de Entrega (Cliente)</span>
          <div className="l1">{enderecoLinha1 || "—"}</div>
          {enderecoLinha2 && <div className="l2">{enderecoLinha2}</div>}
          {order.shipCep && <div className="cep">CEP {order.shipCep}</div>}
        </div>

        {/* Informações complementares de envio */}
        <div className="etq-block etq-foot">
          <div className="lbl">Envio · {order.shippingMethod?.name ?? ""}</div>
          {order.notes?.trim() ? <div>{order.notes}</div> : null}
        </div>
      </div>
    </>
  );
}
