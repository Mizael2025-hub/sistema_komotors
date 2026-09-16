import { prisma } from '@/lib/prisma';

export async function criarNotificacao(dados: { usuario_id: number; titulo: string; mensagem: string; url?: string }) {
  return prisma.notificacao.create({
    data: { usuario_id: dados.usuario_id, titulo: dados.titulo, mensagem: dados.mensagem, url: dados.url ?? null },
  });
}
