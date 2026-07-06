import { NextResponse } from 'next/server'
import { arcaService } from '@/lib/arca/service'

export async function GET() {
  const certStatus = arcaService.getCertStatus()
  console.log(`[GET /api/v1/settings] cuit=${process.env.ARCA_CUIT ?? 'unset'} certLoaded=${certStatus.loaded} certSource=${certStatus.source}`)
  return NextResponse.json({
    cuit: process.env.ARCA_CUIT,
    env: process.env.ARCA_ENV ?? 'production',
    certStatus,
  })
}
