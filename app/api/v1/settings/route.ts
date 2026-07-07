import { NextRequest, NextResponse } from 'next/server'
import { arcaService, type ArcaEnv } from '@/lib/arca/service'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET() {
  const activeEnv = arcaService.getActiveEnv()
  const certStatus = {
    production: arcaService.getCertStatus('production'),
    sandbox: arcaService.getCertStatus('sandbox'),
  }
  console.log(`[GET /api/v1/settings] cuit=${process.env.ARCA_CUIT ?? 'unset'} activeEnv=${activeEnv}`)
  return NextResponse.json({
    cuit: process.env.ARCA_CUIT,
    activeEnv,
    certStatus,
  })
}

const updateSchema = z.object({
  env: z.enum(['production', 'sandbox']),
})

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'env must be "production" or "sandbox"' }, { status: 400 })
  }

  const { env } = parsed.data
  arcaService.setEnv(env as ArcaEnv)
  console.log(`[PUT /api/v1/settings] switched to env=${env}`)
  return NextResponse.json({ ok: true, activeEnv: env })
}
