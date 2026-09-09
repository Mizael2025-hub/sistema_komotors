import { limparCookiesSessao, revogarRefreshToken } from '@/lib/auth/sessao';

export async function POST() {
  await revogarRefreshToken().catch(() => false);
  await limparCookiesSessao();
  return Response.json({ saiu: true });
}
