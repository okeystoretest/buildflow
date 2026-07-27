// Constantes compartilhadas do Financeiro.
// IMPORTANTE: NAO adicionar "use server" aqui — arquivos "use server" so
// podem exportar funcoes async. Estas constantes sao importadas tanto pela
// server action (finance.ts) quanto pela pagina (page.tsx).

// Nome exato do status de pagamento que gera a pendencia na coluna azul.
export const PENDING_PAYMENT_STATUS_NAME = "Liberado (Pendente)";

// Nota gravada no historico ao confirmar o pagamento (marcador de confirmacao).
export const PAYMENT_CONFIRMED_NOTE = "PAGAMENTO_CONFIRMADO";
