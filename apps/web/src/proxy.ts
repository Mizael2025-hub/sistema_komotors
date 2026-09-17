import { NextResponse, type NextRequest } from 'next/server';
import { verificarAccessToken } from '@/lib/auth/jwt';

const COOKIE_ACCESS = 'komotors_access';
const COOKIE_REFRESH = 'komotors_refresh';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_ACCESS)?.value;
  let logado = false;
  if (token) {
    try {
      logado = (await verificarAccessToken(token)) !== null;
    } catch {
      logado = false;
    }
  }

  if (pathname === '/login' && logado) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  /* Sem access válido mas com cookie de refresh: deixa passar — a página faz
     chamadas de API e o cliente renova a sessão (lib/api/cliente). Se o refresh
     também estiver inválido, a renovação falha e o cliente cai no /login.
     Isso evita o "logout falso" quando só o access (15min) expirou. */
  const temRefresh = request.cookies.get(COOKIE_REFRESH)?.value != null;
  if (pathname !== '/login' && !logado && !temRefresh) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webmanifest|txt)$).*)',
  ],
};
