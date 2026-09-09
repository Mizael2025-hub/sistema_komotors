import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email('Email inválido'),
  senha: z.string().min(1, 'Informe a senha'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const alteracaoSenhaSchema = z.object({
  senha_atual: z.string().min(1, 'Informe a senha atual'),
  nova_senha: z
    .string()
    .min(8, 'A nova senha deve ter pelo menos 8 caracteres')
    .max(72, 'A nova senha deve ter no máximo 72 caracteres'),
});
export type AlteracaoSenhaInput = z.infer<typeof alteracaoSenhaSchema>;
