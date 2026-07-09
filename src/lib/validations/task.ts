import { z } from "zod";

// Horario no formato "HH:MM" (24h). Opcional (a vendedora pode deixar vazio).
const horaOpcional = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato HH:MM.")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const TASK_STATUSES = ["A_FAZER", "FAZENDO", "CONCLUIDA"] as const;

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Título obrigatório.").max(200, "Título muito longo."),
  startTime: horaOpcional,
  endTime: horaOpcional,
  category: z.string().trim().max(60, "Categoria muito longa.").optional()
    .or(z.literal("").transform(() => undefined)),
  notes: z.string().trim().max(1000, "Observações muito longas.").optional()
    .or(z.literal("").transform(() => undefined)),
});

export const updateTaskSchema = createTaskSchema.extend({
  id: z.string().min(1, "ID obrigatório."),
});

export const moveTaskSchema = z.object({
  id: z.string().min(1, "ID obrigatório."),
  status: z.enum(TASK_STATUSES),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
