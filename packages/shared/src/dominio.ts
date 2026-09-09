import { z } from 'zod';

export const PERFIL_USUARIO = ['ADMIN', 'OPERADOR'] as const;
export type PerfilUsuario = (typeof PERFIL_USUARIO)[number];

export const STATUS_MONTE = [
  'EM_ESTOQUE',
  'RESERVADO',
  'NO_SETOR',
  'PARCIAL',
  'VENDIDO',
  'AJUSTADO',
] as const;
export type StatusMonte = (typeof STATUS_MONTE)[number];

export const TIPO_MOVIMENTACAO = [
  'ENTRADA',
  'RESERVA',
  'CANCELAMENTO_RESERVA',
  'MOVIMENTO_SETOR',
  'BAIXA_VENDA',
  'EDICAO',
  'RECONCILIACAO',
  'AJUSTE',
] as const;
export type TipoMovimentacao = (typeof TIPO_MOVIMENTACAO)[number];

export const ACAO_AUDITORIA = ['CRIACAO', 'ATUALIZACAO', 'EXCLUSAO'] as const;
export type AcaoAuditoria = (typeof ACAO_AUDITORIA)[number];

export const COR_LIGA = ['AZUL', 'VERMELHO', 'VERDE', 'AMARELO', 'CINZA', 'PRETO'] as const;
export type CorLiga = (typeof COR_LIGA)[number];

export const COR_LIGA_HEX: Record<CorLiga, string> = {
  AZUL: '#2563eb',
  VERMELHO: '#dc2626',
  VERDE: '#16a34a',
  AMARELO: '#eab308',
  CINZA: '#6b7280',
  PRETO: '#171717',
};

export const POLARIDADE = ['POSITIVO', 'NEGATIVO'] as const;
export type Polaridade = (typeof POLARIDADE)[number];

export const TIPO_FORNECEDOR = ['INTERNO', 'EXTERNO', 'OUTRO'] as const;
export type TipoFornecedor = (typeof TIPO_FORNECEDOR)[number];
