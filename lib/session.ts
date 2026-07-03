import type { SessionOptions } from 'iron-session'

export interface SessionData {
  user?: { username: string }
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? (() => { throw new Error('SESSION_SECRET is not set') })(),
  cookieName: 'afip-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
  },
}
