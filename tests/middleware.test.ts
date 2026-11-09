import { describe, it, expect, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

describe('middleware auth gate', () => {
  afterEach(() => {
    delete process.env.AUTH_DISABLED
  })

  it('returns 401 for unauthenticated API requests by default', async () => {
    const res = await middleware(new NextRequest('http://localhost/api/v1/stats'))
    expect(res.status).toBe(401)
  })

  it('redirects unauthenticated pages to /login by default', async () => {
    const res = await middleware(new NextRequest('http://localhost/dashboard'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/login')
  })

  it('does not enable the bypass for values other than "true"', async () => {
    process.env.AUTH_DISABLED = '1'
    const res = await middleware(new NextRequest('http://localhost/api/v1/stats'))
    expect(res.status).toBe(401)
  })

  it('lets requests through when AUTH_DISABLED=true', async () => {
    process.env.AUTH_DISABLED = 'true'
    const api = await middleware(new NextRequest('http://localhost/api/v1/stats'))
    expect(api.status).toBe(200)
    const page = await middleware(new NextRequest('http://localhost/dashboard'))
    expect(page.status).toBe(200)
  })
})
