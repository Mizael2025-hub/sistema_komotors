import { redirect } from 'next/navigation';
import { obterSessao } from '@/lib/auth/sessao';

export default async function Raiz() {
  const sessao = await obterSessao();
  redirect(sessao ? '/dashboard' : '/login');
}
