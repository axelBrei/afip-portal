import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { getSessionOptions, type SessionData } from '@/lib/session'
import { z } from 'zod'

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const portalUserConfigured = !!process.env.PORTAL_USER
  const portalPasswordConfigured = !!process.env.PORTAL_PASSWORD
  const sessionSecretConfigured = !!process.env.SESSION_SECRET
  console.log(`[POST /api/v1/auth/login] PORTAL_USER=${portalUserConfigured ? `"${process.env.PORTAL_USER}"` : 'UNSET'} PORTAL_PASSWORD=${portalPasswordConfigured ? 'SET' : 'UNSET'} SESSION_SECRET=${sessionSecretConfigured ? 'SET' : 'UNSET'}`)
  console.log(`[POST /api/v1/auth/login] headers: host=${request.headers.get('host')} x-forwarded-host=${request.headers.get('x-forwarded-host')} x-forwarded-proto=${request.headers.get('x-forwarded-proto')} origin=${request.headers.get('origin')}`)

  const body = await request.json().catch(() => null)
  if (!body) {
    console.warn('[POST /api/v1/auth/login] Empty or non-JSON body')
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    console.warn('[POST /api/v1/auth/login] Validation failed:', parsed.error.flatten())
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { username, password } = parsed.data
  console.log(`[POST /api/v1/auth/login] Attempt user="${username}"`)

  if (!portalUserConfigured || !portalPasswordConfigured) {
    console.error('[POST /api/v1/auth/login] PORTAL_USER or PORTAL_PASSWORD env vars not set — cannot authenticate')
    return NextResponse.json({ error: 'Auth not configured' }, { status: 503 })
  }

  if (username !== process.env.PORTAL_USER || password !== process.env.PORTAL_PASSWORD) {
    console.warn(`[POST /api/v1/auth/login] Invalid credentials for user="${username}" (expected user="${process.env.PORTAL_USER}")`)
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  try {
    const response = NextResponse.json({ ok: true })
    const session = await getIronSession<SessionData>(request, response, getSessionOptions())
    session.user = { username }
    await session.save()
    console.log(`[POST /api/v1/auth/login] Login successful user="${username}"`)
    return response
  } catch (err) {
    console.error('[POST /api/v1/auth/login] Session error:', err)
    return NextResponse.json({ error: 'Session error' }, { status: 500 })
  }
}
