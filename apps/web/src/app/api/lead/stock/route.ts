import { exigirSessao } from '@/lib/auth/sessao';
import { respostaJson, ERROS, erro } from '@/lib/api/erros';
import { estoqueCompleto, estoqueLiga, RegraError } from '@/lib/chumbo/servico';

export async function GET(request: Request) {
  const sessao = await exigirSessao();
  if (!sessao) return ERROS.naoAutenticado();

  const ligaParam = new URL(request.url).searchParams.get('liga_id');

  try {
    /* Passo A — sem liga_id devolve TODAS as ligas numa única viagem ao banco. */
    if (!ligaParam) return respostaJson(await estoqueCompleto());

    const ligaId = Number(ligaParam);
    if (!Number.isInteger(ligaId) || ligaId <= 0) return erro(400, 'Informe uma liga valida.');
    return respostaJson(await estoqueLiga(ligaId));
  } catch (ex) {
    if (ex instanceof RegraError) return erro(ex.status, ex.message, undefined, 'E_REGLA');
    return ERROS.erroInterno(ex);
  }
}
