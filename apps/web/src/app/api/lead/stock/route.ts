import { exigirSessao } from '@/lib/auth/sessao';
import { ERROS, erro } from '@/lib/api/erros';
import { estoqueLiga, RegraError } from '@/lib/chumbo/servico';

export async function GET(request: Request) {
  const sessao = await exigirSessao();
  if (!sessao) return ERROS.naoAutenticado();

  const ligaId = Number(new URL(request.url).searchParams.get('liga_id'));
  if (!Number.isInteger(ligaId) || ligaId <= 0) return erro(400, 'Informe uma liga valida.');

  try {
    return Response.json(await estoqueLiga(ligaId));
  } catch (ex) {
    if (ex instanceof RegraError) return erro(ex.status, ex.message, undefined, 'E_REGLA');
    return ERROS.erroInterno(ex);;
  }
}
