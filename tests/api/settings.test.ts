import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/arca/service', () => ({
  arcaService: {
    getCertStatus: vi.fn(() => ({ loaded: true, source: 'env' })),
    reload: vi.fn(),
  },
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
})

import { GET } from '@/app/api/v1/settings/route'
import { PUT } from '@/app/api/v1/settings/certificates/route'
import { arcaService } from '@/lib/arca/service'

describe('GET /api/v1/settings', () => {
  it('returns cuit, env, and certStatus', async () => {
    const res = await GET()
    const body = await res.json()
    expect(body.cuit).toBe('20111111112')
    expect(body.certStatus.loaded).toBe(true)
  })
})

describe('PUT /api/v1/settings/certificates', () => {
  beforeEach(() => {
    vi.mocked(arcaService.reload).mockClear()
  })

  it('returns 400 when files are missing', async () => {
    const fd = new FormData()
    const req = new NextRequest('http://localhost/api/v1/settings/certificates', {
      method: 'PUT',
      body: fd,
    })
    const res = await PUT(req)
    expect(res.status).toBe(400)
  })

  it('saves cert files and calls reload', async () => {
    const fd = new FormData()
    fd.append('cert', new Blob(['-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----']), 'cert.crt')
    fd.append('key', new Blob(['-----BEGIN RSA PRIVATE KEY-----\nMOCK\n-----END RSA PRIVATE KEY-----']), 'cert.key')
    const req = new NextRequest('http://localhost/api/v1/settings/certificates', {
      method: 'PUT',
      body: fd,
    })
    const res = await PUT(req)
    expect(res.status).toBe(200)
    expect(arcaService.reload).toHaveBeenCalledOnce()
  })
})
