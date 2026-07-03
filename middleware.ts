import { NextRequest, NextResponse } from 'next/server'
import { unsealData } from 'iron-session'
import type { SessionData } from '@/lib/session'

const PUBLIC_PATHS = ['/login', '/api/v1/auth/login', '/api/v1/auth/logout']

function isAllowedOrigin(origin: string | null, requestUrl: string): boolean {
  if (!origin) return true
  const sameOrigin = new URL(requestUrl).origin === origin
  if (sameOrigin) return true
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
    if (!isAllowedOrigin(origin, request.url)) {
      return new NextResponse('Forbidden', { status: 403 })
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
      return new NextResponse('Unauthorized', { status: 401 })
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
