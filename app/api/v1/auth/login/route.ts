import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { getSessionOptions, type SessionData } from '@/lib/session'
import { z } from 'zod'

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { username, password } = parsed.data
  if (
    username !== process.env.PORTAL_USER ||
    password !== process.env.PORTAL_PASSWORD
  ) {
    console.warn(`[POST /api/v1/auth/login] Invalid credentials for user="${username}"`)
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  try {
    const session = await getIronSession<SessionData>(await cookies(), getSessionOptions())
    session.user = { username }
    await session.save()
    console.log(`[POST /api/v1/auth/login] Login successful user="${username}"`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/v1/auth/login] Session error:', err)
    return NextResponse.json({ error: 'Session error' }, { status: 500 })
  }
}
