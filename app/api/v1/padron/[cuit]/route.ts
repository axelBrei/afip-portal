import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { padronCache } from '@/lib/db/schema'
import { arcaService } from '@/lib/arca/service'
import { eq } from 'drizzle-orm'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export async function GET(
  _request: NextRequest,
  { params }: { params: { cuit: string } }
) {
  const { cuit } = params
  if (!/^\d{11}$/.test(cuit)) {
    return NextResponse.json({ error: 'CUIT must be 11 digits' }, { status: 400 })
  }

  try {
    const cached = await db
      .select()
      .from(padronCache)
      .where(eq(padronCache.cuit, cuit))
      .limit(1)

    if (cached[0] && new Date(cached[0].expiresAt) > new Date()) {
      console.log(`[GET /api/v1/padron/${cuit}] Cache hit`)
      return NextResponse.json({ data: cached[0].data, cached: true })
    }

    console.log(`[GET /api/v1/padron/${cuit}] Cache miss, fetching from ARCA ws_sr_constancia_inscripcion`)
    const arca = arcaService.getClient()
    const taxpayer = await arca.registerInscriptionProofService.getTaxpayerDetails(parseInt(cuit, 10))

    if (!taxpayer) {
      console.log(`[GET /api/v1/padron/${cuit}] Taxpayer not found in ARCA`)
      return NextResponse.json({ error: 'Taxpayer not found' }, { status: 404 })
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + CACHE_TTL_MS)

    await db
      .insert(padronCache)
      .values({ cuit, data: taxpayer, fetchedAt: now, expiresAt })
      .onConflictDoUpdate({
        target: padronCache.cuit,
        set: { data: taxpayer, fetchedAt: now, expiresAt },
      })

    console.log(`[GET /api/v1/padron/${cuit}] Fetched and cached`)
    return NextResponse.json({ data: taxpayer, cached: false })
  } catch (err) {
    console.error(`[GET /api/v1/padron/${cuit}] Error:`, err)
    return NextResponse.json({ error: 'Internal server error', details: String(err) }, { status: 500 })
  }
}
