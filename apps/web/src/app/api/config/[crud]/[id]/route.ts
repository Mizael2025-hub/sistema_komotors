import { atualizar, alterarAtivo, type DadosEntrada } from '@/lib/configuracoes/servico';
import { lerCorpo, validaCrud, autorizarAdmin, SCHEMAS, type CrudValido } from '@/lib/configuracoes/rotas';
import { ERROS, erro } from '@/lib/api/erros';

export async function PATCH(request: Request, { params }: { params: Promise<{ crud: string; id: string }> }) {
  const { crud, id: idTexto } = await params;
  if (!validaCrud(crud)) return ERROS.naoEncontrado('Modulo');
  const { sessao, resposta } = await autorizarAdmin();
  if (!sessao) return resposta!;

  const id = Number(idTexto);
  if (!Number.isInteger(id) || id <= 0) return erro(400, 'Identificador invalido.');

  const corpo = (await lerCorpo(request)) as Record<string, unknown> | undefined;
  if (!corpo || typeof corpo !== 'object') return erro(400, 'Corpo da requisicao invalido.');

  const somenteAtivo = Object.keys(corpo).length === 1 && 'ativo' in corpo;
  if (somenteAtivo) {
    if (typeof corpo.ativo !== 'boolean') return erro(400, 'Valor "ativo" invalido.');
    const resultado = await alterarAtivo(crud as CrudValido, id, corpo.ativo, sessao);
    if (resultado instanceof Response) return resultado;
    return Response.json({ item: resultado });
  }

  const parsed = SCHEMAS[crud as CrudValido].safeParse(corpo);
  if (!parsed.success) {
    return ERROS.erroValidacao(parsed.error.issues);
  }

  const resultado = await atualizar(crud as CrudValido, id, parsed.data as DadosEntrada, sessao);
  if (resultado instanceof Response) return resultado;
  return Response.json({ item: resultado });
}
