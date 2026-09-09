import { exigirSessao } from '@/lib/auth/sessao';
import { ERROS } from '@/lib/api/erros';

export async function GET() {
  const sessao = await exigirSessao();
  if (!sessao) return ERROS.naoAutenticado();
  return Response.json({
    usuario: {
      id: sessao.usuario_id,
      email: sessao.email,
      nome_completo: sessao.nome,
      perfil: sessao.perfil,
    },
  });
}
