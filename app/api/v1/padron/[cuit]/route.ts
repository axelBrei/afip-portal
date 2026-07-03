import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { padronCache } from '@/lib/db/schema'
import { arcaService } from '@/lib/arca/service'
import { eq } from 'drizzle-orm'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

const VALID_SCOPES = ['4', '5', '10', '13'] as const
type Scope = (typeof VALID_SCOPES)[number]

function getService(arca: ReturnType<typeof arcaService.getClient>, scope: Scope) {
  const map = {
    '4': arca.registerScopeFourService,
    '5': arca.registerScopeFiveService,
    '10': arca.registerScopeTenService,
    '13': arca.registerScopeThirteenService,
  } as const
  return map[scope]
}

export async function GET(
  request: NextRequest,
  { params }: { params: { cuit: string } }
) {
  const { cuit } = params
  if (!/^\d{11}$/.test(cuit)) {
    return NextResponse.json({ error: 'CUIT must be 11 digits' }, { status: 400 })
  }

  const scope = (request.nextUrl.searchParams.get('scope') ?? '10') as Scope
  if (!VALID_SCOPES.includes(scope)) {
    return NextResponse.json({ error: `scope must be one of ${VALID_SCOPES.join(', ')}` }, { status: 400 })
  }

  try {
    const cached = await db
      .select()
      .from(padronCache)
      .where(eq(padronCache.cuit, cuit))
      .limit(1)

    if (cached[0] && new Date(cached[0].expiresAt) > new Date()) {
      return NextResponse.json({ data: cached[0].data, cached: true })
    }

    const arca = arcaService.getClient()
    const service = getService(arca, scope)
    // The SDK type declares number but the service accepts string CUITs at runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const taxpayer = await (service.getTaxpayerDetails as unknown as (id: string) => ReturnType<typeof service.getTaxpayerDetails>)(cuit)

    if (!taxpayer) {
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

    return NextResponse.json({ data: taxpayer, cached: false })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
