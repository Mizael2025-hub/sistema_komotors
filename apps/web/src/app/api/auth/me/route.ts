import { exigirSessao } from '@/lib/auth/sessao';
import { respostaJson, ERROS } from '@/lib/api/erros';

export async function GET() {
  const sessao = await exigirSessao();
  if (!sessao) return ERROS.naoAutenticado();
  return respostaJson({
    usuario: {
      id: sessao.usuario_id,
      email: sessao.email,
      nome_completo: sessao.nome,
      perfil: sessao.perfil,
    },
  });
}
