import { z } from 'zod';
import {
  colaboradorSchema,
  ligaSchema,
  modeloGradeSchema,
  polaridadeSchema,
  setorSchema,
} from '@komotors/shared';
import type { Sessao } from '@/lib/auth/sessao';
import { exigirSessao } from '@/lib/auth/sessao';
import { ERROS } from '@/lib/api/erros';

export const CRUDS = ['ligas', 'setores', 'colaboradores', 'modelos-grade', 'polaridades'] as const;
export type CrudValido = (typeof CRUDS)[number];

export const SCHEMAS: Record<CrudValido, z.ZodTypeAny> = {
  ligas: ligaSchema,
  setores: setorSchema,
  colaboradores: colaboradorSchema,
  'modelos-grade': modeloGradeSchema,
  polaridades: polaridadeSchema,
};

export async function lerCorpo(request: Request) {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function validaCrud(value: string): value is CrudValido {
  return (CRUDS as readonly string[]).includes(value);
}

export async function autorizarAdmin(): Promise<
  { sessao: Sessao; resposta?: undefined } | { sessao?: undefined; resposta: Response }
> {
  const sessao = await exigirSessao();
  if (!sessao) return { resposta: ERROS.naoAutenticado() };
  if (sessao.perfil !== 'ADMIN') return { resposta: ERROS.semPermissao() };
  return { sessao };
}
