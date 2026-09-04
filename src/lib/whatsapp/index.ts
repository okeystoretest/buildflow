// Superficie publica do modulo de WhatsApp. Importar daqui, e nao dos
// arquivos internos — e o que permite trocar de provedor sem tocar em quem usa.
export { sendWhatsappToDrivers, MENSAGEM_NOVO_PACOTE } from "./send";
export { startWhatsapp, getConnectionSnapshot, type WhatsappState } from "./connection";
