import { NextRequest, NextResponse } from 'next/server'
import { unsealData } from 'iron-session'
import type { SessionData } from '@/lib/session'

const PUBLIC_PATHS = ['/login', '/api/v1/auth/login', '/api/v1/auth/logout', '/api/v1/health']

function isAllowedOrigin(origin: string | null, request: NextRequest): boolean {
  if (!origin) return true
  // Use forwarded headers so this works correctly behind a reverse proxy (Coolify/nginx)
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '')
  const serverOrigin = host ? `${proto}://${host}` : new URL(request.url).origin
  if (serverOrigin === origin) return true
  const allowed = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  return allowed.includes(origin)
}

async function getSession(request: NextRequest): Promise<SessionData | null> {
  const cookie = request.cookies.get('afip-session')?.value
  if (!cookie) return null
  try {
    return await unsealData<SessionData>(cookie, {
      password: process.env.SESSION_SECRET!,
    })
  } catch {
    return null
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const origin = request.headers.get('origin')

  if (pathname.startsWith('/api/')) {
    if (!isAllowedOrigin(origin, request)) {
      return new NextResponse('Forbidden', {
        status: 403,
        headers: {
          'Access-Control-Allow-Origin': origin ?? '*',
          'Access-Control-Allow-Credentials': 'true',
        },
      })
    }

    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin ?? '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '86400',
        },
      })
    }
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
  if (isPublic) {
    const res = NextResponse.next()
    if (pathname.startsWith('/api/') && origin) {
      res.headers.set('Access-Control-Allow-Origin', origin)
      res.headers.set('Access-Control-Allow-Credentials', 'true')
    }
    return res
  }

  const session = await getSession(request)
  if (!session?.user) {
    if (pathname.startsWith('/api/')) {
      return new NextResponse('Unauthorized', {
        status: 401,
        headers: {
          'Access-Control-Allow-Origin': origin ?? '*',
          'Access-Control-Allow-Credentials': 'true',
        },
      })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const res = NextResponse.next()
  if (pathname.startsWith('/api/') && origin) {
    res.headers.set('Access-Control-Allow-Origin', origin)
    res.headers.set('Access-Control-Allow-Credentials', 'true')
  }
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
