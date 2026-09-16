import { respostaJson } from '@/lib/api/erros';
export async function GET() {
  return respostaJson({ status: 'ok', servico: 'sistema-komotors', timestamp: new Date().toISOString() });
}
