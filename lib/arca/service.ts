import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { Arca } from '@arcasdk/core'

export type ArcaEnv = 'production' | 'sandbox'

const DATA_DIR = '/data'
const CERTS_DIR = '/data/certs'
const SETTINGS_PATH = '/data/settings.json'

function certDir(env: ArcaEnv) {
  return `${CERTS_DIR}/${env}`
}

function resolveCert(env: ArcaEnv): string {
  const envPath = `${certDir(env)}/cert.crt`
  if (existsSync(envPath)) return readFileSync(envPath, 'utf-8')
  // legacy flat layout (pre-env-switcher)
  if (env === 'production' && existsSync(`${CERTS_DIR}/cert.crt`))
    return readFileSync(`${CERTS_DIR}/cert.crt`, 'utf-8')
  const p = process.env.ARCA_CERT_PATH
  if (p && existsSync(p)) return readFileSync(p, 'utf-8')
  throw new Error(`ARCA certificate not found for env "${env}". Upload via Settings.`)
}

function resolveKey(env: ArcaEnv): string {
  const envPath = `${certDir(env)}/cert.key`
  if (existsSync(envPath)) return readFileSync(envPath, 'utf-8')
  if (env === 'production' && existsSync(`${CERTS_DIR}/cert.key`))
    return readFileSync(`${CERTS_DIR}/cert.key`, 'utf-8')
  const p = process.env.ARCA_KEY_PATH
  if (p && existsSync(p)) return readFileSync(p, 'utf-8')
  throw new Error(`ARCA private key not found for env "${env}". Upload via Settings.`)
}

function loadPersistedEnv(): ArcaEnv {
  try {
    if (existsSync(SETTINGS_PATH)) {
      const data = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'))
      if (data.env === 'production' || data.env === 'sandbox') return data.env
    }
  } catch {
    // fall through to default
  }
  const fromEnvVar = process.env.ARCA_ENV
  return fromEnvVar === 'sandbox' ? 'sandbox' : 'production'
}

function persistEnv(env: ArcaEnv) {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(SETTINGS_PATH, JSON.stringify({ env }))
  } catch (err) {
    console.error('[arcaService] Failed to persist env setting:', err)
  }
}

class ArcaServiceSingleton {
  private client: Arca | null = null
  private activeEnv: ArcaEnv = loadPersistedEnv()

  private initialize(): Arca {
    const cert = resolveCert(this.activeEnv)
    const key = resolveKey(this.activeEnv)
    const cuit = parseInt(process.env.ARCA_CUIT!, 10)
    this.client = new Arca({ cuit, cert, key, production: this.activeEnv === 'production' })
    return this.client
  }

  getClient(): Arca {
    return this.client ?? this.initialize()
  }

  reload(): void {
    this.client = null
    this.initialize()
  }

  getActiveEnv(): ArcaEnv {
    return this.activeEnv
  }

  setEnv(env: ArcaEnv): void {
    this.activeEnv = env
    this.client = null
    persistEnv(env)
  }

  getCertStatus(env: ArcaEnv): { loaded: boolean; source: 'volume' | 'env' | null } {
    if (existsSync(`${certDir(env)}/cert.crt`)) return { loaded: true, source: 'volume' }
    if (env === 'production' && existsSync(`${CERTS_DIR}/cert.crt`))
      return { loaded: true, source: 'volume' }
    const p = process.env.ARCA_CERT_PATH
    if (p && existsSync(p)) return { loaded: true, source: 'env' }
    return { loaded: false, source: null }
  }
}

export const arcaService = new ArcaServiceSingleton()
