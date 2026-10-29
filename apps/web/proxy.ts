import { type NextRequest, NextResponse } from 'next/server';

// In the public preview there is no API, identity provider or database behind the site, so pages that need them
// (demo funnel, sign-in, signed-in app, status) send visitors home instead of failing, and /api answers 404.
const BACKEND_ONLY = ['/demo', '/office', '/admin', '/signin', '/signed-out', '/account', '/invitations', '/status'];

// With the lite demo on, the demo funnel and its small API (served by this app itself) are the only exceptions.
const LITE_OPEN = ['/demo', '/api/lite'];
const inside = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

export function proxy(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_PUBLIC_PREVIEW !== 'true') return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (process.env.NEXT_PUBLIC_LITE_DEMO === 'true' && LITE_OPEN.some(p => inside(pathname, p))) {
    return NextResponse.next();
  }
  if (pathname.startsWith('/api/')) return new NextResponse(null, { status: 404 });
  if (BACKEND_ONLY.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/|city/|fonts/|asc/|favicon|og-).*)'] };
