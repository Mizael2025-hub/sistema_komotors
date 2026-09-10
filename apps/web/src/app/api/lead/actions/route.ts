import { z } from 'zod';
import { baixaVendaSchema, cancelarReservaSchema, moverSetorSchema, reservaSchema, type BaixaVendaInput, type CancelarReservaInput, type MoverSetorInput, type ReservaInput } from '@komotors/shared';
import { exigirSessao } from '@/lib/auth/sessao';
import { ERROS, erro } from '@/lib/api/erros';
import {
  aplicarBaixaVenda,
  cancelarReserva,
  moverSetorMontes,
  RegraError,
  reservarMontes,
} from '@/lib/chumbo/servico';

const MAPA = {
  reservar: reservaSchema,
  'cancelar-reserva': cancelarReservaSchema,
  'mover-setor': moverSetorSchema,
  venda: baixaVendaSchema,
} satisfies Record<string, z.ZodTypeAny>;

export async function POST(request: Request) {
  const sessao = await exigirSessao();
  if (!sessao) return ERROS.naoAutenticado();
  if (sessao.perfil !== 'ADMIN') return ERROS.semPermissao();

  let corpo: { acao?: string; dados?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return erro(400, 'Corpo da requisicao invalido.');
  }

  const acao = corpo.acao;
  if (!acao || !Object.hasOwn(MAPA, acao)) {
    return erro(400, 'Acao invalida.', Object.fromEntries([['acao', ['Acao desconhecida.']]]));
  }

  const parsed = MAPA[acao as keyof typeof MAPA].safeParse(corpo.dados);
  if (!parsed.success) {
    return erro(400, 'Dados invalidos.', parsed.error.flatten().fieldErrors);
  }

  try {
    let resultado;
    if (acao === 'reservar') resultado = await reservarMontes(parsed.data as ReservaInput, sessao);
    else if (acao === 'cancelar-reserva') resultado = await cancelarReserva(parsed.data as CancelarReservaInput, sessao);
    else if (acao === 'mover-setor') resultado = await moverSetorMontes(parsed.data as MoverSetorInput, sessao);
    else resultado = await aplicarBaixaVenda(parsed.data as BaixaVendaInput, sessao);
    return Response.json(resultado);
  } catch (ex) {
    if (ex instanceof RegraError) return erro(ex.status, ex.message);
    return ERROS.erroInterno();
  }
}
