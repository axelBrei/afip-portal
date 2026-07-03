import { describe, it, expect } from 'vitest'
import { invoices, padronCache } from '@/lib/db/schema'

describe('database schema', () => {
  it('invoices table has required columns', () => {
    const cols = Object.keys(invoices)
    expect(cols).toContain('id')
    expect(cols).toContain('cae')
    expect(cols).toContain('rawRequest')
    expect(cols).toContain('rawResponse')
  })

  it('padronCache table has cuit as primary key', () => {
    const cols = Object.keys(padronCache)
    expect(cols).toContain('cuit')
    expect(cols).toContain('expiresAt')
  })
})
