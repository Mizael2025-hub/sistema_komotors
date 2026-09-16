import { NextResponse, type NextRequest } from 'next/server';
import { verificarAccessToken } from '@/lib/auth/jwt';

const COOKIE_ACCESS = 'komotors_access';

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

  if (pathname !== '/login' && !logado) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webmanifest|txt)$).*)',
  ],
};
