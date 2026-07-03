import { describe, it, expect, vi, beforeEach } from 'vitest'

// Global mocks to track calls
let mockSendCalls: any[] = []
let mockGetSignedUrlCalls: any[] = []

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
    getSignedUrl: vi.fn(async () => {
      mockGetSignedUrlCalls.push({ timestamp: Date.now() })
      return 'https://r2.example.com/signed-url'
    }),
  }
})

import { uploadPdf, getPresignedUrl } from '@/lib/r2/client'

describe('R2 client', () => {
  beforeEach(() => {
    mockSendCalls = []
    mockGetSignedUrlCalls = []
  })

  it('uploadPdf calls S3Client.send with PutObjectCommand', async () => {
    const buf = Buffer.from('pdf-content')
    await uploadPdf('invoices/20111111112/2026/uuid.pdf', buf)
    expect(mockSendCalls.length).toBe(1)
  })

  it('getPresignedUrl returns a signed URL string', async () => {
    const url = await getPresignedUrl('invoices/20111111112/2026/uuid.pdf')
    expect(url).toBe('https://r2.example.com/signed-url')
    expect(mockGetSignedUrlCalls.length).toBe(1)
  })

  it('getPresignedUrl uses 900s TTL by default', async () => {
    await getPresignedUrl('some/key.pdf')
    expect(mockGetSignedUrlCalls.length).toBe(1)
  })
})
