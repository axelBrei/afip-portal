import { readFileSync, existsSync } from 'fs'
import { Arca } from '@arcasdk/core'

const VOLUME_CERT = '/data/certs/cert.crt'
const VOLUME_KEY = '/data/certs/cert.key'

function resolveCert(): string {
  if (existsSync(VOLUME_CERT)) return readFileSync(VOLUME_CERT, 'utf-8')
  const p = process.env.ARCA_CERT_PATH
  if (p && existsSync(p)) return readFileSync(p, 'utf-8')
  throw new Error('ARCA certificate not found. Set ARCA_CERT_PATH or upload via settings.')
}

function resolveKey(): string {
  if (existsSync(VOLUME_KEY)) return readFileSync(VOLUME_KEY, 'utf-8')
  const p = process.env.ARCA_KEY_PATH
  if (p && existsSync(p)) return readFileSync(p, 'utf-8')
  throw new Error('ARCA private key not found. Set ARCA_KEY_PATH or upload via settings.')
}

class ArcaServiceSingleton {
  private client: Arca | null = null

  private initialize(): Arca {
    const cert = resolveCert()
    const key = resolveKey()
    const cuit = parseInt(process.env.ARCA_CUIT!, 10)
    this.client = new Arca({ cuit, cert, key })
    return this.client
  }

  getClient(): Arca {
    return this.client ?? this.initialize()
  }

  reload(): void {
    this.client = null
    this.initialize()
  }

  getCertStatus(): { loaded: boolean; source: 'volume' | 'env' | null } {
    if (existsSync(VOLUME_CERT)) return { loaded: true, source: 'volume' }
    const p = process.env.ARCA_CERT_PATH
    if (p && existsSync(p)) return { loaded: true, source: 'env' }
    return { loaded: false, source: null }
  }
}

export const arcaService = new ArcaServiceSingleton()
