import { z } from 'zod';
import {
  apontamentoContagemSchema,
  dataHojeLocal,
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
  resumoContagens,
  revisarContagem,
} from '@/lib/chumbo/servico';

const MAPA = {
  adicionar: apontamentoContagemSchema,
  editar: edicaoApontamentoSchema,
  excluir: excluirApontamentoSchema,
  revisar: revisarContagemSchema,
} satisfies Record<string, z.ZodTypeAny>;

export async function GET(request: Request) {
  const sessao = await exigirSessao();
  if (!sessao) return ERROS.naoAutenticado();

  const url = new URL(request.url);

  // resumo de dias com contagem — "Comparar com outro dia"
  if (url.searchParams.get('resumo') === '1') {
    const diasBruto = Number(url.searchParams.get('dias') ?? 30);
    const dias = Number.isFinite(diasBruto) ? Math.min(Math.max(Math.trunc(diasBruto), 1), 90) : 30;
    try {
      return respostaJson(await resumoContagens(dias));
    } catch (ex) {
      return ERROS.erroInterno(ex);
    }
  }

  const data = url.searchParams.get('data') ?? dataHojeLocal();
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
    if (acao === 'adicionar') return respostaJson(await registrarApontamento(parsed.data as ApontamentoContagemInput, sessao));
    if (acao === 'editar') return respostaJson(await editarApontamento(parsed.data as EdicaoApontamentoInput, sessao));
    if (acao === 'excluir') return respostaJson(await excluirApontamento(parsed.data as ExcluirApontamentoInput, sessao));
    return respostaJson(await revisarContagem(parsed.data as RevisarContagemInput, sessao));
  } catch (ex) {
    if (ex instanceof RegraError) return erro(ex.status, ex.message, undefined, 'E_REGLA');
    return ERROS.erroInterno(ex);
  }
}
