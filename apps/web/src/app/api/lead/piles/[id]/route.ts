import { edicaoMonteSchema, recorteMonteSchema } from '@komotors/shared';
import { exigirSessao } from '@/lib/auth/sessao';
import { ERROS, erro } from '@/lib/api/erros';
import { editarMonte, historicoMonte, RegraError, reposicionarMonte } from '@/lib/chumbo/servico';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirSessao();
  if (!sessao) return ERROS.naoAutenticado();

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return erro(400, 'Identificador invalido.');

  try {
    return Response.json(await historicoMonte(id));
  } catch (ex) {
    if (ex instanceof RegraError) return erro(ex.status, ex.message, undefined, 'E_REGLA');
    return ERROS.erroInterno(ex);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirSessao();
  if (!sessao) return ERROS.naoAutenticado();
  if (sessao.perfil !== 'ADMIN') return ERROS.semPermissao();

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return erro(400, 'Identificador invalido.');

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return erro(400, 'Corpo da requisicao invalido.');
  }

  try {
    if (typeof corpo === 'object' && corpo !== null && 'linha' in corpo) {
      const parsed = recorteMonteSchema.safeParse({ ...(corpo as Record<string, unknown>), monte_id: id });
      if (!parsed.success) return ERROS.erroValidacao(parsed.error.issues);
      await reposicionarMonte(parsed.data, sessao);
      return Response.json({ reposicionado: true });
    }

    const parsed = edicaoMonteSchema.safeParse({ ...(corpo as Record<string, unknown>), monte_id: id });
    if (!parsed.success) return ERROS.erroValidacao(parsed.error.issues);
    await editarMonte(parsed.data, sessao);
    return Response.json({ editado: true });
  } catch (ex) {
    if (ex instanceof RegraError) return erro(ex.status, ex.message, undefined, 'E_REGLA');
    return ERROS.erroInterno(ex);
  }
}
