import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('iron-session', () => ({
  getIronSession: vi.fn(),
  unsealData: vi.fn(),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({})),
}))

import { POST as login } from '@/app/api/v1/auth/login/route'
import { POST as logout } from '@/app/api/v1/auth/logout/route'
import { getIronSession } from 'iron-session'

describe('POST /api/v1/auth/login', () => {
  const mockSave = vi.fn()
  const mockDestroy = vi.fn()
  const mockSession = { user: undefined as unknown, save: mockSave, destroy: mockDestroy }

  beforeEach(() => {
    vi.mocked(getIronSession).mockResolvedValue(mockSession as never)
    mockSave.mockReset()
    mockDestroy.mockReset()
    mockSession.user = undefined
  })

  it('returns 200 and saves session on valid credentials', async () => {
    const req = new NextRequest('http://localhost/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'password' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await login(req)
    expect(res.status).toBe(200)
    expect(mockSave).toHaveBeenCalledOnce()
    expect(mockSession.user).toEqual({ username: 'admin' })
  })

  it('returns 401 on wrong password', async () => {
    const req = new NextRequest('http://localhost/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await login(req)
    expect(res.status).toBe(401)
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('returns 400 on missing fields', async () => {
    const req = new NextRequest('http://localhost/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await login(req)
    expect(res.status).toBe(400)
  })
})

describe('POST /api/v1/auth/logout', () => {
  beforeEach(() => {
    const mockSession = { destroy: vi.fn(), save: vi.fn() }
    vi.mocked(getIronSession).mockResolvedValue(mockSession as never)
  })

  it('returns 200', async () => {
    const req = new NextRequest('http://localhost/api/v1/auth/logout', { method: 'POST' })
    const res = await logout(req)
    expect(res.status).toBe(200)
  })
})
