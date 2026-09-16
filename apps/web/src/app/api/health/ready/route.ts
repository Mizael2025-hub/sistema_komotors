import { respostaJson } from '@/lib/api/erros';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return respostaJson({ status: 'ok', banco: 'conectado' });
  } catch {
    return respostaJson({ status: 'erro', banco: 'indisponivel' }, { status: 503 });
  }
}
