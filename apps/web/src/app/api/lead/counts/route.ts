import { z } from 'zod';
import {
  apontamentoContagemSchema,
  edicaoApontamentoSchema,
  excluirApontamentoSchema,
  revisarContagemSchema,
  type ApontamentoContagemInput,
  type EdicaoApontamentoInput,
  type ExcluirApontamentoInput,
  type RevisarContagemInput,
} from '@komotors/shared';
import { exigirSessao } from '@/lib/auth/sessao';
import { respostaJson, ERROS, erro } from '@/lib/api/erros';
import {
  contagemDoDia,
  editarApontamento,
  excluirApontamento,
  RegraError,
  registrarApontamento,
  revisarContagem,
} from '@/lib/chumbo/servico';

const MAPA = {
  adicionar: apontamentoContagemSchema,
  editar: edicaoApontamentoSchema,
  excluir: excluirApontamentoSchema,
  revisar: revisarContagemSchema,
} satisfies Record<string, z.ZodTypeAny>;

const hojeISO = () => new Date().toISOString().slice(0, 10);

export async function GET(request: Request) {
  const sessao = await exigirSessao();
  if (!sessao) return ERROS.naoAutenticado();

  const url = new URL(request.url);
  const data = url.searchParams.get('data') ?? hojeISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return erro(400, 'Data invalida.', undefined, 'E_VALIDACAO');

  try {
    return respostaJson(await contagemDoDia(data));
  } catch (ex) {
    if (ex instanceof RegraError) return erro(ex.status, ex.message, undefined, 'E_REGLA');
    return ERROS.erroInterno(ex);
  }
}

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
  if (!parsed.success) return ERROS.erroValidacao(parsed.error.issues);

  try {
    let resultado;
    if (acao === 'adicionar') resultado = await registrarApontamento(parsed.data as ApontamentoContagemInput, sessao);
    else if (acao === 'editar') resultado = await editarApontamento(parsed.data as EdicaoApontamentoInput, sessao);
    else if (acao === 'excluir') resultado = await excluirApontamento(parsed.data as ExcluirApontamentoInput, sessao);
    else resultado = await revisarContagem(parsed.data as RevisarContagemInput, sessao);
    return respostaJson(resultado);
  } catch (ex) {
    if (ex instanceof RegraError) return erro(ex.status, ex.message, undefined, 'E_REGLA');
    return ERROS.erroInterno(ex);
  }
}
