import { describe, it, expect, vi, beforeEach } from 'vitest'

// Global mocks to track calls
let mockSendCalls: any[] = []

const { mockGetSignedUrl } = vi.hoisted(() => {
  return {
    mockGetSignedUrl: vi.fn(async () => {
      return 'https://r2.example.com/signed-url'
    }),
  }
})

vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: vi.fn(() => ({
      send: vi.fn(async () => {
        mockSendCalls.push({ timestamp: Date.now() })
        return {}
      }),
    })),
    PutObjectCommand: vi.fn((input) => ({ input })),
    GetObjectCommand: vi.fn((input) => ({ input })),
  }
})

vi.mock('@aws-sdk/s3-request-presigner', () => {
  return {
    getSignedUrl: mockGetSignedUrl,
  }
})

import { uploadPdf, getPresignedUrl } from '@/lib/r2/client'

describe('R2 client', () => {
  beforeEach(() => {
    mockSendCalls = []
    mockGetSignedUrl.mockClear()
  })

  it('uploadPdf calls S3Client.send with PutObjectCommand', async () => {
    const buf = Buffer.from('pdf-content')
    await uploadPdf('invoices/20111111112/2026/uuid.pdf', buf)
    expect(mockSendCalls.length).toBe(1)
  })

  it('getPresignedUrl returns a signed URL string', async () => {
    const url = await getPresignedUrl('invoices/20111111112/2026/uuid.pdf')
    expect(url).toBe('https://r2.example.com/signed-url')
    expect(mockGetSignedUrl).toHaveBeenCalledOnce()
  })

  it('getPresignedUrl uses 900s TTL by default', async () => {
    await getPresignedUrl('some/key.pdf')
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { expiresIn: 900 }
    )
  })
})
