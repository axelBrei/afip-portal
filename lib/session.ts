import type { SessionOptions } from 'iron-session'

export interface SessionData {
  user?: { username: string }
}

export function getSessionOptions(): SessionOptions {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return {
    password: secret,
    cookieName: 'afip-session',
    cookieOptions: {
      secure: process.env.COOKIE_SECURE === 'true',
      httpOnly: true,
      sameSite: 'lax',
    },
  }
}
