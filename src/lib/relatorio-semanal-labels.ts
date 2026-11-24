/**
 * Rótulos e formatação do Relatório Semanal.
 *
 * PURO e sem banco: é importado por componentes de cliente. A legenda
 * 🟢/🟡/🔴 da planilha vive aqui, num lugar só — era texto dentro da própria
 * célula do Excel, e repeti-la em cada tela traria de volta o problema que a
 * lista suspensa resolvia.
 */

import type {
  MarketingTaskCategory,
  MarketingTaskPriority,
  MarketingTaskStatus,
  WeeklyHealth,
} from "@/lib/relatorio-semanal-math";

export const HEALTH_LABEL: Record<WeeklyHealth, string> = {
  NO_RITMO: "🟢 No ritmo",
  ATENCAO: "🟡 Atenção",
  TRAVADO: "🔴 Travado",
};

export const HEALTH_ORDER: readonly WeeklyHealth[] = ["NO_RITMO", "ATENCAO", "TRAVADO"];

/**
 * Tom da saúde. Nome SEMÂNTICO, não classe: quem desenha escolhe o token do
 * tema. Gravar `text-emerald-500` aqui faria a legenda ignorar o tema escuro
 * do buildflow, que é o padrão da casa.
 */
export const HEALTH_TONE: Record<WeeklyHealth, "ok" | "atencao" | "risco"> = {
  NO_RITMO: "ok",
  ATENCAO: "atencao",
  TRAVADO: "risco",
};

/**
 * O nome que aparece na coluna do quadro.
 *
 * `BACKLOG` se lê "Brainstorm": a primeira coluna é onde a ideia nasce, e não
 * uma fila de pendência. O VALOR no banco continua `BACKLOG` de propósito —
 * renomear o enum custaria uma migration em todos os cartões para mudar uma
 * palavra na tela.
 */
export const TASK_STATUS_LABEL: Record<MarketingTaskStatus, string> = {
  BACKLOG: "Brainstorm",
  A_FAZER: "A fazer",
  EM_ANDAMENTO: "Em andamento",
  REVISAO: "Revisão",
  PUBLICADO: "Publicado",
};

/**
 * Cor do STATUS — o ponto no cabeçalho da coluna e na legenda do rodapé.
 *
 * Hex fixo, para valer nos dois temas. A cor avança de cinza a verde conforme
 * o cartão caminha, que é o que a coluna já diz pela posição — a cor só
 * reforça.
 *
 * A COR NUNCA VIAJA SOZINHA: o nome do status está sempre escrito ao lado. O
 * quadro é auditado na sexta, às vezes impresso, e cerca de 1 em 12 homens
 * não distingue vermelho de verde.
 */
export const TASK_STATUS_COLOR: Record<MarketingTaskStatus, string> = {
  BACKLOG: "#94a3b8",
  A_FAZER: "#3b82f6",
  EM_ANDAMENTO: "#f5a524",
  REVISAO: "#f97316",
  PUBLICADO: "#22c55e",
};

export const TASK_CATEGORY_LABEL: Record<MarketingTaskCategory, string> = {
  CONTEUDO: "Conteúdo",
  PUBLICACAO: "Publicação",
  COMUNIDADE: "Comunidade",
  RELATORIO: "Relatório",
  PROCESSO: "Processo",
};

/**
 * Cor da categoria no cartão do quadro. Mesma regra do status: hex fixo para
 * valer nos dois temas, e o rótulo escrito sempre ao lado.
 */
export const TASK_CATEGORY_COLOR: Record<MarketingTaskCategory, string> = {
  CONTEUDO: "#3b82f6",
  PUBLICACAO: "#8b5cf6",
  COMUNIDADE: "#f5a524",
  RELATORIO: "#14b8a6",
  PROCESSO: "#94a3b8",
};

export const TASK_PRIORITY_LABEL: Record<MarketingTaskPriority, string> = {
  ALTA: "Alta",
  MEDIA: "Média",
  BAIXA: "Baixa",
};

export const TASK_PRIORITY_TONE: Record<MarketingTaskPriority, "risco" | "atencao" | "neutro"> = {
  ALTA: "risco",
  MEDIA: "atencao",
  BAIXA: "neutro",
};

/** "2026-11-17" → "17/11". O ano fica no cabeçalho, não em cada data. */
export function formatarDiaMes(iso?: string): string {
  if (!iso) return "—";
  const [, mes, dia] = iso.split("-");
  if (!mes || !dia) return "—";
  return `${dia}/${mes}`;
}

/** "2026-11-17" → "17/11/2026". */
export function formatarData(iso?: string): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  if (!ano || !mes || !dia) return "—";
  return `${dia}/${mes}/${ano}`;
}

/** ISO completo → "17/11/2026 às 17:42", no fuso de quem está lendo. */
export function formatarDataHora(iso?: string): string {
  if (!iso) return "—";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "—";
  return `${data.toLocaleDateString("pt-BR")} às ${data.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/**
 * Fração → percentual com sinal ("+20,0%", "-25,0%").
 *
 * O sinal é obrigatório na variação: "20%" e "+20%" se leem igual, mas uma
 * queda de 20% escrita sem o sinal passa por alta na leitura rápida de sexta.
 */
export function formatarVariacao(fracao?: number): string {
  if (fracao === undefined) return "—";
  const sinal = fracao > 0 ? "+" : "";
  return `${sinal}${(fracao * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

/** Fração → percentual sem sinal ("90,0%"). */
export function formatarPercentual(fracao?: number): string {
  if (fracao === undefined) return "—";
  return `${(fracao * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

/** Número da tela: até duas casas, separador brasileiro. "—" quando ausente. */
export function formatarNumero(valor?: number): string {
  if (valor === undefined) return "—";
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/**
 * A evidência é uma imagem nossa, ou um endereço?
 *
 * O campo é um só: caminho começando no prefixo de uploads é print enviado, o
 * resto é link. Uma coluna a mais para guardar essa distinção seria uma
 * coluna que pode discordar do valor ao lado dela.
 */
export function evidenciaEhImagem(evidence?: string): boolean {
  return !!evidence && evidence.startsWith("/uploads/");
}

/** As iniciais de quem toca o cartão, quando não há foto — e aqui nunca há. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}
