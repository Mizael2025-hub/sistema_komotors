import { z } from 'zod';
import { TIPO_FORNECEDOR } from './dominio';

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

const montePosicaoSchema = z.object({
  linha: z.number().int().min(1).max(30),
  coluna: z.number().int().min(1).max(30),
  qtd_barras: z.number().int('Quantidade de barras deve ser número inteiro').positive('Informe a quantidade de barras'),
  peso: z.number().nonnegative('Peso nao pode ser negativo').max(99999, 'Peso muito grande').optional(),
  ordem_liberacao: z.number().int().positive().max(1000).optional(),
});

export const entradaLoteSchema = z
  .object({
    data_chegada: z.string().regex(DATA_ISO, 'Informe uma data valida'),
    codigo: z
      .string()
      .trim()
      .min(1, 'Informe o numero do lote')
      .max(50, 'Codigo com no maximo 50 caracteres'),
    liga_id: z.number().int().positive('Escolha a liga de chumbo'),
    fornecedor: z.enum(TIPO_FORNECEDOR).default('OUTRO'),
    peso_total_informado: z.number().nonnegative('Peso nao pode ser negativo').max(9999999).optional(),
    linhas: z.number().int().min(1).max(20),
    colunas: z.number().int().min(1).max(20),
    montes: z.array(montePosicaoSchema).min(1, 'Marque pelo menos uma posicao na grade'),
  })
  .refine(
    (d) => {
      const chaves = new Set(d.montes.map((m) => `${m.linha}-${m.coluna}`));
      const dentro = d.montes.every((m) => m.linha <= d.linhas && m.coluna <= d.colunas);
      return chaves.size === d.montes.length && dentro && d.montes.length <= d.linhas * d.colunas;
    },
    { message: 'Montes excedem a grade ou possuem posicoes duplicadas' },
  );

const monteIdsSchema = z.object({
  monte_ids: z
    .array(z.number().int().positive())
    .min(1, 'Selecione pelo menos um monte'),
});

export const reservaSchema = monteIdsSchema.extend({
  setor_id: z.number().int().positive('Escolha o setor'),
  observacao: z.string().trim().max(200, 'Observacao com no maximo 200 caracteres').optional().transform((v) => (v ? v : undefined)),
});

export const cancelarReservaSchema = monteIdsSchema.extend({
  observacao: z.string().trim().max(200).optional().transform((v) => (v ? v : undefined)),
});

export const moverSetorSchema = monteIdsSchema.extend({
  setor_id: z.number().int().positive('Escolha o setor'),
  qtd_barras: z.number().int().positive('Informe a quantidade de barras').optional(),
  peso_informado: z.number().positive('Peso deve ser maior que zero').max(99999).optional(),
  observacao: z.string().trim().max(200).optional().transform((v) => (v ? v : undefined)),
});

export const baixaVendaSchema = monteIdsSchema.extend({
  destino: z.string().trim().min(1, 'Informe o destino').max(100),
  para_quem: z.string().trim().min(1, 'Informe para quem').max(100),
  data: z.string().regex(DATA_ISO, 'Informe uma data valida'),
  qtd_barras: z.number().int().positive('Informe a quantidade de barras').optional(),
  peso_informado: z.number().positive('Peso deve ser maior que zero').max(99999).optional(),
  peso_editado: z.boolean().default(false),
  observacao: z.string().trim().max(200).optional().transform((v) => (v ? v : undefined)),
});

export const edicaoMonteSchema = z
  .object({
    monte_id: z.number().int().positive(),
    peso: z.number().nonnegative('Peso nao pode ser negativo').max(99999).optional(),
    qtd_barras: z.number().int().positive('Informe a quantidade de barras').optional(),
  })
  .refine((d) => d.peso !== undefined || d.qtd_barras !== undefined, {
    message: 'Informe o novo peso ou a nova quantidade de barras',
  });

export const recorteMonteSchema = z
  .object({
    monte_id: z.number().int().positive(),
    linha: z.number().int().min(1).max(20),
    coluna: z.number().int().min(1).max(30),
  });

export const redimensionarGradeSchema = z.object({
  linhas: z.number().int().min(1).max(20),
  colunas: z.number().int().min(1).max(20),
});

export type EntradaLoteInput = z.infer<typeof entradaLoteSchema>;
export type ReservaInput = z.infer<typeof reservaSchema>;
export type CancelarReservaInput = z.infer<typeof cancelarReservaSchema>;
export type MoverSetorInput = z.infer<typeof moverSetorSchema>;
export type BaixaVendaInput = z.infer<typeof baixaVendaSchema>;
export type EdicaoMonteInput = z.infer<typeof edicaoMonteSchema>;
export type RecorteMonteInput = z.infer<typeof recorteMonteSchema>;
export type RedimensionarGradeInput = z.infer<typeof redimensionarGradeSchema>;
