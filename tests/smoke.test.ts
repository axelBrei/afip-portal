import { describe, it, expect } from 'vitest'

describe('project setup', () => {
  it('environment variables are set in test', () => {
    expect(process.env.SESSION_SECRET).toBeDefined()
    expect(process.env.PORTAL_USER).toBe('admin')
  })
})
