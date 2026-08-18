import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { notFound } from "next/navigation";
import { EtiquetaAutoPrint } from "./auto-print";

// Etiqueta térmica (Zebra) 140 x 105 mm — ORIENTAÇÃO HORIZONTAL (paisagem).
// Usada em pedidos com forma de envio que exige endereço (ex.: "1 - Excursão").
// Página standalone (fora do shell do dashboard) para imprimir limpa. Abre em
// nova aba e dispara a impressão.
//
// Layout do adesivo (faixas pretas por seção, conteúdo centralizado):
//   [ COMANDA         | CLIENTE  ]  <- topo
//   [ ENDEREÇO ENTREGA| EXCURSÃO ]  <- meio (preenche a altura)
//   [ OBSERVAÇÕES DE ENVIO       ]  <- rodapé
//
// Hierarquia visual: Comanda (44pt), Nome da Cliente (17pt) e Endereço (15.5pt)
// são as três informações de leitura rápida. Telefone da cliente logo abaixo do
// nome (origem: Customer.contact).
//
// O campo "Vendedora" foi REMOVIDO do layout e do fluxo de dados — a query nem
// carrega mais a relação `seller`.
export default async function EtiquetaPage({ params }: { params: { id: string } }) {
  // Somente papéis que operam vendas/logística podem imprimir.
  await requireRole(["GESTAO", "VENDAS", "FINANCEIRO", "LOGISTICA"]);

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { customer: true, shippingMethod: true, excursao: true },
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

  // Contato da cliente (telefone). Campo de texto livre no cadastro de Clientes.
  const contato = order.customer.contact?.trim() ?? "";

  const enderecoLinha1 = [order.shipStreet, order.shipNumber].filter(Boolean).join(", ");
  const enderecoLinha2 = [order.shipDistrict, order.shipCity, order.shipState]
    .filter(Boolean)
    .join(" · ");

  // Dias/horários de funcionamento da excursão, quando cadastrados.
  const excursaoHorario = [
    order.excursao?.operatingDays ?? "",
    order.excursao?.cutoffTime ? `até às ${order.excursao.cutoffTime}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const excursaoNotes = order.excursao?.notes?.trim() ?? "";
  const observacoes = order.notes?.trim() ?? "";

  return (
    <>
      <EtiquetaAutoPrint />
      <style>{`
        /* Etiqueta horizontal (paisagem) 140 x 105 mm */
        @page { size: 140mm 105mm; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

        .etq {
          width: 140mm; height: 105mm; padding: 3mm;
          font-family: "Helvetica Neue", Arial, sans-serif; color: #000; background: #fff;
          display: flex; flex-direction: column; gap: 1.6mm; text-align: center;
        }

        /* Faixa preta de título de seção */
        .etq-band {
          background: #000; color: #fff; font-weight: 900; text-transform: uppercase;
          letter-spacing: .05em; font-size: 12pt; padding: 1.2mm 2mm; line-height: 1.1;
        }
        /* Corpo da seção (borda contínua com a faixa) */
        .etq-box {
          border: 1.2pt solid #000; border-top: none; padding: 1.8mm 2.4mm;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .6mm;
        }

        .etq-row { display: flex; gap: 1.6mm; }
        .etq-row-mid { flex: 1; min-height: 0; }
        .etq-col { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .etq-col-addr { flex: 1.12; }
        .etq-fill { flex: 1; }

        /* --- Destaque 1: número da comanda --- */
        .etq-comanda { font-size: 44pt; font-weight: 900; line-height: 1; letter-spacing: .01em; }

        /* --- Destaque 2: nome da cliente (+ código e telefone) --- */
        .etq-cli-nome { font-size: 17pt; font-weight: 900; line-height: 1.1; word-break: break-word; }
        .etq-cli-nome .cod { font-weight: 500; font-size: 14pt; }
        .etq-cli-fone { font-size: 14.5pt; font-weight: 700; }

        /* --- Destaque 3: endereço de entrega --- */
        .etq-addr-l1 { font-size: 15.5pt; font-weight: 800; line-height: 1.12; }
        .etq-addr-l2 { font-size: 11.5pt; font-weight: 600; }
        .etq-addr-cep { font-size: 12.5pt; font-weight: 900; }

        /* --- Apoio: excursão e observações --- */
        .etq-exc-nome { font-size: 13.5pt; font-weight: 900; line-height: 1.1; }
        .etq-exc-txt { font-size: 10pt; font-weight: 600; line-height: 1.25; }
        .etq-exc-obs { font-size: 10pt; font-weight: 800; line-height: 1.25; }
        .etq-obs { min-height: 14mm; font-size: 11pt; font-weight: 600; line-height: 1.3; }
      `}</style>

      <div className="etq">
        {/* Topo: Comanda | Cliente */}
        <div className="etq-row">
          <div className="etq-col">
            <div className="etq-band">Comanda</div>
            <div className="etq-box etq-fill">
              <div className="etq-comanda">{comanda}</div>
            </div>
          </div>

          <div className="etq-col">
            <div className="etq-band">Cliente</div>
            <div className="etq-box etq-fill">
              <div className="etq-cli-nome">
                {order.customer.name}
                {order.customer.code ? <span className="cod"> ({order.customer.code})</span> : null}
              </div>
              <div className="etq-cli-fone">{contato || "—"}</div>
            </div>
          </div>
        </div>

        {/* Meio: Endereço de Entrega (cliente) | Excursão (despacho) */}
        <div className="etq-row etq-row-mid">
          <div className="etq-col etq-col-addr">
            <div className="etq-band">Endereço de Entrega</div>
            <div className="etq-box etq-fill">
              <div className="etq-addr-l1">{enderecoLinha1 || "—"}</div>
              {enderecoLinha2 ? <div className="etq-addr-l2">{enderecoLinha2}</div> : null}
              {order.shipCep ? <div className="etq-addr-cep">CEP {order.shipCep}</div> : null}
            </div>
          </div>

          <div className="etq-col">
            <div className="etq-band">Excursão</div>
            <div className="etq-box etq-fill">
              {order.excursao ? (
                <>
                  <div className="etq-exc-nome">{order.excursao.name}</div>
                  {order.excursao.address ? (
                    <div className="etq-exc-txt">{order.excursao.address}</div>
                  ) : null}
                  {excursaoNotes ? <div className="etq-exc-obs">Obs.: {excursaoNotes}</div> : null}
                  {excursaoHorario ? <div className="etq-exc-txt">{excursaoHorario}</div> : null}
                </>
              ) : (
                <div className="etq-exc-txt">—</div>
              )}
            </div>
          </div>
        </div>

        {/* Rodapé: Observações de Envio */}
        <div>
          <div className="etq-band">Observações de Envio</div>
          <div className="etq-box etq-obs">{observacoes || "—"}</div>
        </div>
      </div>
    </>
  );
}
