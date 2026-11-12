import { FUSO_NEGOCIO } from "@/lib/rank-window";
import { formatPhone } from "@/lib/phone";
import { WHOLESALE_CONTENT } from "@/lib/wholesale-content";

/**
 * Textos da apresentação agendada pela lojista na LP de atacado.
 *
 * Função PURA (sem Prisma, sem rede) pelo mesmo motivo de
 * `notifications/messages.ts`: é texto que chega a uma pessoa e precisa de um
 * script que o confira sem subir banco. A Server Action monta a tarefa e a
 * notificação a partir daqui.
 *
 * TODA data é lida no fuso do NEGÓCIO. `presentationAt` é um instante, e
 * formatá-lo com o relógio do processo (UTC no container) mostraria à
 * vendedora um horário três horas antes do que a lojista escolheu — o mesmo
 * erro que a própria coluna existe para não cometer.
 */

/** "20/11/2026" no fuso do negócio. */
export function dataDaApresentacao(quando: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_NEGOCIO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(quando);
}

/** "14:00" no fuso do negócio — o formato que `DailyTask.startTime` guarda. */
export function horaDaApresentacao(quando: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_NEGOCIO,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(quando);
}

export interface TextosApresentacao {
  /** Título do card no quadro de Tarefas. */
  titulo: string;
  /** "HH:MM" para `DailyTask.startTime`. */
  horario: string;
  /** Etiqueta do card. */
  categoria: string;
  /** Corpo do card: o que a vendedora precisa para ligar. */
  notas: string;
  /** Texto do sininho (`Notification.message`). */
  notificacao: string;
  /** Corpo do push, que chega com o app fechado. */
  push: string;
}

/**
 * O título carrega a DATA, e não só o nome.
 *
 * `DailyTask` guarda `startTime` como "HH:MM" e não tem coluna de data — o
 * quadro é um kanban pessoal, não uma agenda. Uma apresentação marcada para
 * daqui a duas semanas apareceria hoje mostrando só "14:00", e a vendedora
 * leria como "hoje às 14:00". A data no título é o que impede o card de
 * mentir enquanto o modelo não tiver um campo próprio.
 *
 * shortcut: data no título em vez de coluna `date` em DailyTask; trocar
 * quando o quadro virar agenda de verdade (com filtro por dia).
 */
export function textosDaApresentacao(args: {
  contactName: string;
  brand: "OKEY" | "LOV_CLUB";
  phone: string;
  quando: Date;
}): TextosApresentacao {
  const dia = dataDaApresentacao(args.quando);
  const hora = horaDaApresentacao(args.quando);
  const marca = WHOLESALE_CONTENT[args.brand].brandName;
  const nome = args.contactName.trim();

  return {
    titulo: `Apresentação ${dia} ${hora} — ${nome}`,
    horario: hora,
    categoria: "Atacado",
    notas:
      `Disponibilidade informada pela lojista na candidatura ${marca}.\n` +
      `WhatsApp: ${formatPhone(args.phone)}`,
    notificacao: `${nome} tem disponibilidade para apresentação em ${dia} às ${hora}.`,
    push: `${nome} — ${dia} às ${hora}`,
  };
}
