import { entradaLoteSchema } from '@komotors/shared';
import { exigirSessao } from '@/lib/auth/sessao';
import { ERROS, erro } from '@/lib/api/erros';
import { criarEntrada, RegraError } from '@/lib/chumbo/servico';
import { registrarAuditoria } from '@/lib/auditoria';

export async function POST(request: Request) {
  const sessao = await exigirSessao();
  if (!sessao) return ERROS.naoAutenticado();
  if (sessao.perfil !== 'ADMIN') return ERROS.semPermissao();

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return erro(400, 'Corpo da requisicao invalido.');
  }

  const parsed = entradaLoteSchema.safeParse(corpo);
  if (!parsed.success) {
    return ERROS.erroValidacao(parsed.error.issues);
  }

  try {
    const lote = await criarEntrada(parsed.data, sessao);
    await registrarAuditoria({
      entidade: 'lote_chumbo',
      entidade_id: lote.id,
      acao: 'CRIACAO',
      dados_novos: { codigo: lote.codigo, total_barras: lote.total_barras, total_montes: lote.total_montes, liga_id: lote.liga_id, data_chegada: lote.data_chegada },
      usuario_id: sessao.usuario_id,
    });
    return Response.json({ lote: { id: lote.id, codigo: lote.codigo } }, { status: 201 });
  } catch (ex) {
    if (ex instanceof RegraError) return erro(ex.status, ex.message, undefined, 'E_REGLA');
    return ERROS.erroInterno(ex);
  }
}
