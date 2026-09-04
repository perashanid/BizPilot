import { NextRequest, NextResponse } from 'next/server';

/**
 * UX-only route guard: redirects based on the mere PRESENCE of the session cookie.
 * It cannot verify the JWT signature inside edge middleware without extra setup, so it never
 * makes an authorization decision — every API route still enforces real auth via
 * requireSession() in lib/auth.ts. This just avoids flashing a protected page before a
 * client-side redirect would kick in (or bouncing a signed-in user back to /login).
 */
const SESSION_COOKIE = 'sme_session';
const PUBLIC_PATHS = ['/login', '/register'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has(SESSION_COOKIE);
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (isPublicPath) {
    if (hasSession) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

// Matches every path except /api/*, Next internals, and static assets — /login and /register
// are matched here too (so the "already signed in" redirect above can run) but are treated as
// public inside the middleware function itself.
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
