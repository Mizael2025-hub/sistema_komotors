import { redimensionarGradeSchema } from '@komotors/shared';
import { exigirSessao } from '@/lib/auth/sessao';
import { ERROS, erro } from '@/lib/api/erros';
import { RegraError, redimensionarLote } from '@/lib/chumbo/servico';

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

  const parsed = redimensionarGradeSchema.safeParse(corpo);
  if (!parsed.success) return erro(400, 'Dados invalidos.', parsed.error.flatten().fieldErrors);

  try {
    await redimensionarLote(id, parsed.data, sessao);
    return Response.json({ redimensionado: true });
  } catch (ex) {
    if (ex instanceof RegraError) return erro(ex.status, ex.message);
    return ERROS.erroInterno();
  }
}
