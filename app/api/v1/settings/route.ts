import { NextResponse } from 'next/server'
import { arcaService } from '@/lib/arca/service'

export async function GET() {
  return NextResponse.json({
    cuit: process.env.ARCA_CUIT,
    env: process.env.ARCA_ENV ?? 'production',
    certStatus: arcaService.getCertStatus(),
  })
}
