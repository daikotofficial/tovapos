import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0].toLowerCase();
  if (host === 'admin.tovapos.com.ng' && request.nextUrl.pathname === '/') {
    return NextResponse.rewrite(new URL('/admin', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/'],
};
