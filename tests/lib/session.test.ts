import { describe, it, expect } from 'vitest'
import { sessionOptions } from '@/lib/session'

describe('sessionOptions', () => {
  it('uses the SESSION_SECRET env var', () => {
    expect(sessionOptions.password).toBe(process.env.SESSION_SECRET)
  })

  it('sets httpOnly cookie', () => {
    expect(sessionOptions.cookieOptions?.httpOnly).toBe(true)
  })

  it('uses afip-session cookie name', () => {
    expect(sessionOptions.cookieName).toBe('afip-session')
  })
})
