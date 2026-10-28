import { type NextRequest, NextResponse } from 'next/server';

// In the public preview there is no API, identity provider or database behind the site, so pages that need them
// (demo funnel, sign-in, signed-in app, status) send visitors home instead of failing, and /api answers 404.
const BACKEND_ONLY = ['/demo', '/office', '/admin', '/signin', '/signed-out', '/account', '/invitations', '/status'];

export function proxy(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_PUBLIC_PREVIEW !== 'true') return NextResponse.next();
  const { pathname } = request.nextUrl;
  // The lite demo backend (leads, email verification, simulated office) is the only API in the preview build.
  if (pathname.startsWith('/api/lite/')) return NextResponse.next();
  if (pathname.startsWith('/api/')) return new NextResponse(null, { status: 404 });
  if (BACKEND_ONLY.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/|city/|fonts/|favicon|og-).*)'] };
