import { exigirSessao } from '@/lib/auth/sessao';
import { prisma } from '@/lib/prisma';
import { respostaJson, ERROS, erro } from '@/lib/api/erros';

export async function GET() {
  const sessao = await exigirSessao();
  if (!sessao) return ERROS.naoAutenticado();

  const [itens, naoLidas] = await Promise.all([
    prisma.notificacao.findMany({
      where: { usuario_id: sessao.usuario_id },
      orderBy: { created_at: 'desc' },
      take: 30,
    }),
    prisma.notificacao.count({ where: { usuario_id: sessao.usuario_id, lida: false } }),
  ]);

  return respostaJson({ nao_lidas: naoLidas, itens: itens.map((n) => ({ id: n.id, titulo: n.titulo, mensagem: n.mensagem, url: n.url, lida: n.lida, created_at: n.created_at })) });
}

export async function POST(request: Request) {
  const sessao = await exigirSessao();
  if (!sessao) return ERROS.naoAutenticado();

  let corpo: { acao?: string; id?: number };
  try {
    corpo = await request.json();
  } catch {
    return erro(400, 'Corpo da requisicao invalido.');
  }
  if (corpo.acao !== 'marcar-lida' || typeof corpo.id !== 'number') return erro(400, 'Acao invalida.');

  const n = await prisma.notificacao.findUnique({ where: { id: corpo.id } });
  if (!n || n.usuario_id !== sessao.usuario_id) return erro(404, 'Notificacao nao encontrada.');

  await prisma.notificacao.update({ where: { id: n.id }, data: { lida: true } });
  return respostaJson({ tudo: true });
}
