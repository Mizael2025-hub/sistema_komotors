import { NextResponse, type NextRequest } from 'next/server';

const COOKIE_ACCESS = 'komotors_access';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const logado = Boolean(request.cookies.get(COOKIE_ACCESS)?.value);

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
