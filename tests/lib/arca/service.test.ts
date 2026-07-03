import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

vi.mock('@arcasdk/core', () => ({
  Arca: vi.fn().mockImplementation(() => ({ electronicBillingService: {} })),
}))

import { existsSync, readFileSync } from 'fs'
import { Arca } from '@arcasdk/core'

describe('ArcaService', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(readFileSync).mockReturnValue('mock-content')
    process.env.ARCA_CERT_PATH = '/fake/cert.crt'
    process.env.ARCA_KEY_PATH = '/fake/cert.key'
  })

  it('throws when no cert is found', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const { arcaService } = await import('@/lib/arca/service')
    expect(() => arcaService.getClient()).toThrow('ARCA certificate not found')
  })

  it('initializes Arca with cert from env path', async () => {
    vi.mocked(existsSync).mockImplementation((p) =>
      p === '/fake/cert.crt' || p === '/fake/cert.key'
    )
    const { arcaService } = await import('@/lib/arca/service')
    const client = arcaService.getClient()
    expect(Arca).toHaveBeenCalledWith({
      cuit: 20111111112,
      cert: 'mock-content',
      key: 'mock-content',
    })
    expect(client).toBeDefined()
  })

  it('returns same instance on repeated getClient() calls', async () => {
    vi.mocked(existsSync).mockImplementation((p) =>
      p === '/fake/cert.crt' || p === '/fake/cert.key'
    )
    const { arcaService } = await import('@/lib/arca/service')
    vi.mocked(Arca).mockClear()
    const a = arcaService.getClient()
    const b = arcaService.getClient()
    expect(a).toBe(b)
    expect(Arca).toHaveBeenCalledTimes(1)
  })

  it('getCertStatus returns loaded:false when no cert', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const { arcaService } = await import('@/lib/arca/service')
    expect(arcaService.getCertStatus()).toEqual({ loaded: false, source: null })
  })

  it('reload() clears client so next getClient() creates a new instance', async () => {
    vi.mocked(existsSync).mockImplementation((p) =>
      p === '/fake/cert.crt' || p === '/fake/cert.key'
    )
    const { arcaService } = await import('@/lib/arca/service')
    const first = arcaService.getClient()
    vi.mocked(Arca).mockClear()
    arcaService.reload()
    // After reload, Arca should be constructed again
    expect(Arca).toHaveBeenCalledTimes(1)
  })

  it('getCertStatus returns loaded:true source:volume when volume cert exists', async () => {
    vi.mocked(existsSync).mockImplementation((p) => p === '/data/certs/cert.crt')
    const { arcaService } = await import('@/lib/arca/service')
    expect(arcaService.getCertStatus()).toEqual({ loaded: true, source: 'volume' })
  })

  it('getCertStatus returns loaded:true source:env when env cert exists', async () => {
    vi.mocked(existsSync).mockImplementation((p) =>
      p === '/fake/cert.crt' // matches ARCA_CERT_PATH
    )
    const { arcaService } = await import('@/lib/arca/service')
    expect(arcaService.getCertStatus()).toEqual({ loaded: true, source: 'env' })
  })
})
