import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import authConfig from '@/lib/auth.config';

// IMPORTANTE: aqui usamos `auth.config.ts` (edge-safe — sem bcrypt/drizzle)
// e NÃO `auth.ts` (que puxa Node-only modules para o bundle do Edge runtime).
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl, auth: session } = req;

  const isPublicPath =
    nextUrl.pathname === '/login' ||
    nextUrl.pathname === '/signup' ||
    nextUrl.pathname.startsWith('/api/auth') ||
    nextUrl.pathname.startsWith('/intake/') ||
    nextUrl.pathname.startsWith('/_next') ||
    nextUrl.pathname === '/favicon.ico' ||
    nextUrl.pathname === '/manifest.webmanifest' ||
    nextUrl.pathname === '/sw.js' ||
    nextUrl.pathname.startsWith('/icons/');

  if (isPublicPath) return NextResponse.next();

  if (!session) {
    const url = new URL('/login', nextUrl.origin);
    url.searchParams.set('callbackUrl', nextUrl.pathname + nextUrl.search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
