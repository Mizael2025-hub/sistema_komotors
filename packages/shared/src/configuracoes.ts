import { z } from 'zod';
import { COR_LIGA, POLARIDADE, TIPO_FORNECEDOR } from './dominio';

export const ligaSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, 'Informe o nome da liga')
    .max(50, 'Nome com no máximo 50 caracteres'),
  cor: z.enum(COR_LIGA, 'Escolha a cor da liga'),
});

export const setorSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, 'Informe o nome do setor')
    .max(50, 'Nome com no máximo 50 caracteres'),
  descricao: z.string().trim().max(200, 'Descrição com no máximo 200 caracteres').optional().transform((v) => v || undefined),
});

export const colaboradorSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, 'Informe o nome do colaborador')
    .max(100, 'Nome com no máximo 100 caracteres'),
  setor_id: z.number().int().positive('Escolha o setor'),
});

export const modeloGradeSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, 'Informe o nome do modelo')
    .max(50, 'Nome com no máximo 50 caracteres'),
});

export const polaridadeSchema = z.object({
  nome: z.enum(POLARIDADE, 'Escolha a polaridade'),
});

export const fornecedorOpcoes = TIPO_FORNECEDOR;

export type LigaInput = z.infer<typeof ligaSchema>;
export type SetorInput = z.infer<typeof setorSchema>;
export type ColaboradorInput = z.infer<typeof colaboradorSchema>;
export type ModeloGradeInput = z.infer<typeof modeloGradeSchema>;
export type PolaridadeInput = z.infer<typeof polaridadeSchema>;
