import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { db } from '@/lib/db'
import { padronCache } from '@/lib/db/schema'
import { arcaService } from '@/lib/arca/service'
import { eq, desc } from 'drizzle-orm'

function extractName(data: unknown): string {
  const d = data as Record<string, unknown>
  const dg = (d?.datosGenerales ?? d) as Record<string, unknown>
  return (
    (dg?.razonSocial as string) ||
    [(dg?.nombre as string), (dg?.apellido as string)].filter(Boolean).join(' ') ||
    ((d?.persona as Record<string, unknown>)?.denominacion as string) ||
    ((d?.persona as Record<string, unknown>)?.apellido as string) ||
    ''
  )
}

function extractTipoPersona(data: unknown): string | null {
  const d = data as Record<string, unknown>
  const dg = (d?.datosGenerales ?? d) as Record<string, unknown>
  return (dg?.tipoPersona as string) || null
}

export async function GET() {
  const env = arcaService.getActiveEnv()
  const rows = await db
    .select()
    .from(padronCache)
    .where(eq(padronCache.env, env))
    .orderBy(desc(padronCache.fetchedAt))

  return NextResponse.json({
    data: rows.map((r) => ({
      cuit: r.cuit,
      name: extractName(r.data),
      tipoPersona: extractTipoPersona(r.data),
      fetchedAt: r.fetchedAt,
      expiresAt: r.expiresAt,
    })),
  })
}
