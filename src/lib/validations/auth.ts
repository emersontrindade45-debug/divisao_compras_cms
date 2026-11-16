import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Tamanho mínimo da senha nova. Igual ao exigido por `scripts/criar-usuario.mjs`. */
export const SENHA_MIN_CARACTERES = 8;

export const alterarSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1, "Informe a senha atual"),
    novaSenha: z
      .string()
      .min(SENHA_MIN_CARACTERES, `A nova senha precisa ter pelo menos ${SENHA_MIN_CARACTERES} caracteres`)
      // bcrypt ignora tudo depois do 72º byte: uma senha maior pareceria mais forte do que é.
      .max(72, "A nova senha pode ter no máximo 72 caracteres"),
    confirmacao: z.string(),
  })
  .refine((d) => d.novaSenha === d.confirmacao, {
    message: "A confirmação não confere com a nova senha",
    path: ["confirmacao"],
  })
  .refine((d) => d.novaSenha !== d.senhaAtual, {
    message: "A nova senha precisa ser diferente da atual",
    path: ["novaSenha"],
  });

export type AlterarSenhaInput = z.infer<typeof alterarSenhaSchema>;
