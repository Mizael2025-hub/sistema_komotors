import { cookies } from 'next/headers';
import { COOKIE_ACCESS, COOKIE_REFRESH, renovarSessao } from '@/lib/auth/sessao';

export async function POST() {
  const resultado = await renovarSessao();
  if (!resultado) {
    return Response.json({ erro: 'Sessao expirada. Faca login novamente.' }, { status: 401 });
  }

  const loja = await cookies();
  const cfg = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };
  loja.set(COOKIE_ACCESS, resultado.access, { ...cfg, maxAge: 60 * 15 });
  loja.set(COOKIE_REFRESH, resultado.refresh, { ...cfg, maxAge: 30 * 24 * 60 * 60 });

  return Response.json({ renovado: true });
}
