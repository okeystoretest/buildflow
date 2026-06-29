import { z } from "zod";

// O campo "Usuário" aceita texto livre (ex: "Alessandra#BF") ou e-mail.
// É apenas o identificador de login, casado com User.email no banco.
export const loginSchema = z.object({
  email: z.string().min(1, "Informe o usuário."),
  password: z.string().min(1, "Senha obrigatoria."),
});

export type LoginInput = z.infer<typeof loginSchema>;
