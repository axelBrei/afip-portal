import { describe, it, expect } from 'vitest'
import { getSessionOptions } from '@/lib/session'

describe('getSessionOptions', () => {
  it('uses the SESSION_SECRET env var', () => {
    expect(getSessionOptions().password).toBe(process.env.SESSION_SECRET)
  })

  it('sets httpOnly cookie', () => {
    expect(getSessionOptions().cookieOptions?.httpOnly).toBe(true)
  })

  it('uses afip-session cookie name', () => {
    expect(getSessionOptions().cookieName).toBe('afip-session')
  })
})
