import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockSelect, mockInsert, mockCreateNextVoucher, mockUploadPdf, mockGetPresignedUrl, mockGetPdfObject } =
  vi.hoisted(() => {
    const mockSelect = vi.fn()
    const mockInsert = vi.fn()
    const mockCreateNextVoucher = vi.fn()
    const mockUploadPdf = vi.fn().mockResolvedValue(undefined)
    const mockGetPresignedUrl = vi.fn().mockResolvedValue('https://r2.example.com/test.pdf')
    const mockGetPdfObject = vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 test'))
    return { mockSelect, mockInsert, mockCreateNextVoucher, mockUploadPdf, mockGetPresignedUrl, mockGetPdfObject }
  })

vi.mock('@/lib/db', () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
}))

vi.mock('@/lib/arca/service', () => ({
  arcaService: {
    getActiveEnv: vi.fn(() => 'sandbox'),
    getClient: vi.fn(() => ({
      electronicBillingService: { createNextVoucher: mockCreateNextVoucher },
    })),
  },
}))

vi.mock('@/lib/r2/client', () => ({
  uploadPdf: mockUploadPdf,
  getPresignedUrl: mockGetPresignedUrl,
  getPdfObject: mockGetPdfObject,
}))

vi.mock('@arcasdk/pdf', () => ({
  InvoicePdfGenerator: vi.fn().mockImplementation(() => ({
    generate: vi.fn().mockResolvedValue(Buffer.from('pdf')),
  })),
}))

import { GET, POST } from '@/app/api/v1/invoices/route'
import { GET as getById } from '@/app/api/v1/invoices/[id]/route'
import { GET as getPdf } from '@/app/api/v1/invoices/[id]/pdf/route'

const MOCK_INVOICE = {
  id: 'uuid-1',
  cuit: '20111111112',
  tipoCbte: 6,
  puntoVenta: 1,
  nroCbte: 1,
  cae: '12345678901234',
  caeFchVto: '2026-07-31',
  amountNet: '100.00',
  amountIva: '21.00',
  amountTotal: '121.00',
  receptorCuit: null,
  receptorName: null,
  pdfUrl: 'invoices/20111111112/2026/uuid-1.pdf',
  rawRequest: {},
  rawResponse: {},
  createdAt: new Date().toISOString(),
}

const VALID_PAYLOAD = {
  puntoVenta: 1,
  tipoCbte: 6,
  concepto: 1,
  docTipo: 99,
  docNro: 0,
  impNeto: 100,
  impIva: 21,
  impTotal: 121,
  iva: [{ Id: 5, BaseImp: 100, Importe: 21 }],
  items: [{ description: 'Service', quantity: 1, unitPrice: 100, ivaRate: 21 }],
}

const MOCK_ARCA_RESULT = {
  response: {
    FeCabResp: { Resultado: 'A' },
    FeDetResp: {
      FECAEDetResponse: [{ CbteDesde: 1, CbteHasta: 1 }],
    },
  },
  cae: '12345678901234',
  caeFchVto: '20260731',
}

describe('GET /api/v1/invoices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue([MOCK_INVOICE]),
          }),
        }),
      }),
    })
  })

  it('returns paginated invoices', async () => {
    const req = new NextRequest('http://localhost/api/v1/invoices')
    const res = await GET(req)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data).toHaveLength(1)
    expect(body.page).toBe(1)
  })
})

describe('POST /api/v1/invoices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateNextVoucher.mockResolvedValue(MOCK_ARCA_RESULT)
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([MOCK_INVOICE]),
      }),
    })
  })

  it('creates invoice and returns 201', async () => {
    const req = new NextRequest('http://localhost/api/v1/invoices', {
      method: 'POST',
      body: JSON.stringify(VALID_PAYLOAD),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(mockCreateNextVoucher).toHaveBeenCalledOnce()
    expect(mockUploadPdf).toHaveBeenCalledOnce()
    expect(mockUploadPdf).toHaveBeenCalledWith(expect.stringMatching(/^invoices\/\d+\/\d{4}\/[a-f0-9-]+\.pdf$/), expect.any(Buffer))
  })

  it('returns 422 when ARCA rejects', async () => {
    mockCreateNextVoucher.mockResolvedValue({
      response: { FeCabResp: { Resultado: 'R' } },
      cae: '',
      caeFchVto: '',
    })
    const req = new NextRequest('http://localhost/api/v1/invoices', {
      method: 'POST',
      body: JSON.stringify(VALID_PAYLOAD),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(422)
  })

  it('returns 422 on invalid payload', async () => {
    const req = new NextRequest('http://localhost/api/v1/invoices', {
      method: 'POST',
      body: JSON.stringify({ puntoVenta: 'bad' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(422)
  })
})

describe('GET /api/v1/invoices/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns invoice by id', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([MOCK_INVOICE]),
        }),
      }),
    })
    const req = new NextRequest('http://localhost/api/v1/invoices/uuid-1')
    const res = await getById(req, { params: { id: 'uuid-1' } })
    expect(res.status).toBe(200)
  })

  it('returns 404 when not found', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    })
    const req = new NextRequest('http://localhost/api/v1/invoices/missing')
    const res = await getById(req, { params: { id: 'missing' } })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/v1/invoices/:id/pdf', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const pdfRow = () =>
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ pdfUrl: 'invoices/20111111112/2026/uuid-1.pdf' }]),
        }),
      }),
    })

  it('streams the PDF through the portal by default', async () => {
    pdfRow()
    mockGetPdfObject.mockResolvedValue(Buffer.from('%PDF-1.4 test'))
    const req = new NextRequest('http://localhost/api/v1/invoices/uuid-1/pdf')
    const res = await getPdf(req, { params: { id: 'uuid-1' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(mockGetPdfObject).toHaveBeenCalledWith('invoices/20111111112/2026/uuid-1.pdf')
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('%PDF-1.4 test')
  })

  it('redirects to a presigned URL with ?redirect=1', async () => {
    pdfRow()
    const req = new NextRequest('http://localhost/api/v1/invoices/uuid-1/pdf?redirect=1')
    const res = await getPdf(req, { params: { id: 'uuid-1' } })
    expect(res.status).toBe(302)
    expect(mockGetPresignedUrl).toHaveBeenCalledWith('invoices/20111111112/2026/uuid-1.pdf', 900)
    expect(res.headers.get('Location')).toBe('https://r2.example.com/test.pdf')
  })

  it('returns 502 when R2 fetch fails', async () => {
    pdfRow()
    mockGetPdfObject.mockRejectedValueOnce(new Error('boom'))
    const req = new NextRequest('http://localhost/api/v1/invoices/uuid-1/pdf')
    const res = await getPdf(req, { params: { id: 'uuid-1' } })
    expect(res.status).toBe(502)
  })

  it('returns 404 when pdf not found', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    })
    const req = new NextRequest('http://localhost/api/v1/invoices/missing/pdf')
    const res = await getPdf(req, { params: { id: 'missing' } })
    expect(res.status).toBe(404)
  })
})
