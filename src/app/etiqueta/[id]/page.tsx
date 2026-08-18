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
//   [ COMANDA          | CLIENTE  ]  <- topo
//   [ ENDEREÇO ENTREGA | EXCURSÃO ]  <- meio (preenche a altura)
//   [ OBSERVAÇÕES DE ENVIO        ]  <- rodapé
//
// Tipografia: "Aptos" para texto normal e "Aptos Black" para os destaques.
// A Aptos é fonte de sistema (Microsoft 365); o stack tem fallback para
// Segoe UI / Arial nas máquinas que não a tenham instalada.
//
// Hierarquia visual (leitura rápida): Comanda, Nome da Cliente e Endereço de
// Entrega em corpo ampliado e Aptos Black. Telefone da cliente logo abaixo do
// nome (origem: Customer.contact).
//
// O campo "Vendedora" foi REMOVIDO do layout e do fluxo de dados — a query nem
// carrega mais a relação `seller`.

// Regra de negócio da etiqueta: exibir SOMENTE os dois primeiros nomes da
// cliente (evita quebra de linha e mantém a legibilidade em corpo grande).
function doisPrimeirosNomes(nomeCompleto: string): string {
  const partes = nomeCompleto.trim().split(/\s+/).filter(Boolean);
  return partes.slice(0, 2).join(" ");
}

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

  // Nome exibido: apenas os dois primeiros nomes.
  const nomeCliente = doisPrimeirosNomes(order.customer.name);

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
          /* Aptos (texto normal) com fallback de sistema */
          --f-aptos: "Aptos", "Aptos Display", "Segoe UI Variable Text", "Segoe UI", Arial, sans-serif;
          /* Aptos Black (destaques) com fallback de sistema */
          --f-aptos-black: "Aptos Black", "Aptos ExtraBold", "Aptos Display", "Aptos",
                           "Segoe UI Black", "Segoe UI", "Arial Black", Arial, sans-serif;

          width: 140mm; height: 105mm; padding: 2.5mm;
          font-family: var(--f-aptos); color: #000; background: #fff;
          display: flex; flex-direction: column; gap: 1.4mm; text-align: center;
        }
        /* Utilitário: tudo que for destaque usa Aptos Black */
        .etq .blk { font-family: var(--f-aptos-black); font-weight: 900; }

        /* Faixa preta de título de seção */
        .etq-band {
          background: #000; color: #fff; font-family: var(--f-aptos-black); font-weight: 900;
          text-transform: uppercase; letter-spacing: .04em; font-size: 11.5pt;
          padding: 1mm 2mm; line-height: 1.1;
        }
        /* Corpo da seção (borda contínua com a faixa) */
        .etq-box {
          border: 1.2pt solid #000; border-top: none; padding: 1.6mm 2.2mm;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1mm;
        }

        .etq-row { display: flex; gap: 1.4mm; }
        .etq-row-mid { flex: 1; min-height: 0; }
        .etq-col { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .etq-col-addr { flex: 1.05; }
        .etq-fill { flex: 1; }

        /* --- Destaque 1: número da comanda --- */
        .etq-comanda { font-size: 40pt; line-height: 1; letter-spacing: .01em; }

        /* --- Destaque 2: nome da cliente (dois primeiros nomes) --- */
        .etq-cli-nome { font-size: 18pt; line-height: 1.1; text-transform: uppercase; }
        /* Código do cliente: peso normal (Aptos), entre parênteses, ao lado do nome */
        .etq-cli-nome .cod {
          font-family: var(--f-aptos); font-weight: 400; font-size: 13pt; white-space: nowrap;
        }
        .etq-cli-fone { font-size: 14pt; font-weight: 400; }

        /* --- Destaque 3: endereço de entrega --- */
        .etq-addr-l1 { font-size: 14pt; line-height: 1.12; text-transform: uppercase; }
        .etq-addr-l2 { font-size: 12pt; font-weight: 400; text-transform: uppercase; }
        .etq-addr-cep { font-size: 12pt; font-weight: 400; }

        /* --- Apoio: excursão e observações --- */
        .etq-exc-nome { font-size: 12.5pt; line-height: 1.1; text-transform: uppercase; }
        .etq-exc-txt { font-size: 11pt; font-weight: 400; line-height: 1.2; text-transform: uppercase; }
        .etq-obs { min-height: 13mm; font-size: 11pt; font-weight: 400; line-height: 1.25; }
      `}</style>

      <div className="etq">
        {/* Topo: Comanda | Cliente */}
        <div className="etq-row">
          <div className="etq-col">
            <div className="etq-band">Comanda</div>
            <div className="etq-box etq-fill">
              <div className="etq-comanda blk">{comanda}</div>
            </div>
          </div>

          <div className="etq-col">
            <div className="etq-band">Cliente</div>
            <div className="etq-box etq-fill">
              <div className="etq-cli-nome blk">
                {nomeCliente}
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
              <div className="etq-addr-l1 blk">{enderecoLinha1 || "—"}</div>
              {enderecoLinha2 ? <div className="etq-addr-l2">{enderecoLinha2}</div> : null}
              {order.shipCep ? <div className="etq-addr-cep">CEP {order.shipCep}</div> : null}
            </div>
          </div>

          <div className="etq-col">
            <div className="etq-band">Excursão</div>
            <div className="etq-box etq-fill">
              {order.excursao ? (
                <>
                  <div className="etq-exc-nome blk">{order.excursao.name}</div>
                  {order.excursao.address ? (
                    <div className="etq-exc-txt">{order.excursao.address}</div>
                  ) : null}
                  {excursaoNotes ? <div className="etq-exc-txt">{excursaoNotes}</div> : null}
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
          <div className="etq-box etq-obs">{observacoes || ""}</div>
        </div>
      </div>
    </>
  );
}
