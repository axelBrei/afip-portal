import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockSelect, mockInsert, mockGetTaxpayerDetails } = vi.hoisted(() => {
  const mockSelect = vi.fn()
  const mockInsert = vi.fn()
  const mockGetTaxpayerDetails = vi.fn()
  return { mockSelect, mockInsert, mockGetTaxpayerDetails }
})

vi.mock('@/lib/db', () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
}))

vi.mock('@/lib/arca/service', () => ({
  arcaService: {
    getClient: vi.fn(() => ({
      registerScopeTenService: { getTaxpayerDetails: mockGetTaxpayerDetails },
      registerScopeFourService: { getTaxpayerDetails: mockGetTaxpayerDetails },
      registerScopeFiveService: { getTaxpayerDetails: mockGetTaxpayerDetails },
      registerScopeThirteenService: { getTaxpayerDetails: mockGetTaxpayerDetails },
    })),
  },
}))

import { GET } from '@/app/api/v1/padron/[cuit]/route'

const FAKE_TAXPAYER = { persona: { idPersona: 20111111112, tipoPersona: 'FISICA' } }
const FUTURE = new Date(Date.now() + 1000 * 60 * 60).toISOString()

describe('GET /api/v1/padron/:cuit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    })
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue([]),
      }),
    })
    mockGetTaxpayerDetails.mockResolvedValue(FAKE_TAXPAYER)
  })

  it('returns 400 for invalid CUIT', async () => {
    const req = new NextRequest('http://localhost/api/v1/padron/123')
    const res = await GET(req, { params: { cuit: '123' } })
    expect(res.status).toBe(400)
  })

  it('returns cached data when cache is fresh', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            { cuit: '20111111112', data: FAKE_TAXPAYER, expiresAt: FUTURE },
          ]),
        }),
      }),
    })
    const req = new NextRequest('http://localhost/api/v1/padron/20111111112')
    const res = await GET(req, { params: { cuit: '20111111112' } })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.cached).toBe(true)
    expect(mockGetTaxpayerDetails).not.toHaveBeenCalled()
  })

  it('calls ARCA and caches when no cache', async () => {
    const req = new NextRequest('http://localhost/api/v1/padron/20111111112')
    const res = await GET(req, { params: { cuit: '20111111112' } })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.cached).toBe(false)
    expect(mockGetTaxpayerDetails).toHaveBeenCalledWith('20111111112')
  })

  it('returns 404 when ARCA returns null', async () => {
    mockGetTaxpayerDetails.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/v1/padron/20111111112')
    const res = await GET(req, { params: { cuit: '20111111112' } })
    expect(res.status).toBe(404)
  })

  it('returns 500 with error message when getTaxpayerDetails throws', async () => {
    mockGetTaxpayerDetails.mockRejectedValue(new Error('ARCA service unavailable'))
    const req = new NextRequest('http://localhost/api/v1/padron/20111111112')
    const res = await GET(req, { params: { cuit: '20111111112' } })
    const body = await res.json()
    expect(res.status).toBe(500)
    expect(body).toEqual({ error: 'Internal server error' })
  })
})
