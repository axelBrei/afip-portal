import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { arcaService } from '@/lib/arca/service'
import { padronCache, monotributoCategories } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const yearParam = parseInt(req.nextUrl.searchParams.get('year') ?? '', 10)
  const year = isNaN(yearParam) || yearParam < 2000 || yearParam > 2100
    ? new Date().getFullYear()
    : yearParam

  const env = arcaService.getActiveEnv()
  const tableName = env === 'production' ? 'invoices_production' : 'invoices_sandbox'

  const monthlyRows = await db.execute(sql`
    SELECT
      EXTRACT(MONTH FROM cae_fch_vto)::int AS month,
      SUM(
        CASE WHEN tipo_cbte = ANY(ARRAY[3, 8, 13])
          THEN -amount_total::numeric
          ELSE amount_total::numeric
        END
      ) AS net_revenue,
      COUNT(*) FILTER (WHERE tipo_cbte != ALL(ARRAY[3, 8, 13]))::int AS invoice_count
    FROM ${sql.identifier(tableName)}
    WHERE EXTRACT(YEAR FROM cae_fch_vto) = ${year}
    GROUP BY month
    ORDER BY month
  `) as unknown as Array<{ month: number; net_revenue: string; invoice_count: string }>

  const totalsRow = (await db.execute(sql`
    SELECT
      SUM(
        CASE WHEN tipo_cbte = ANY(ARRAY[3, 8, 13])
          THEN -amount_total::numeric
          ELSE amount_total::numeric
        END
      ) AS net_revenue,
      COUNT(*) FILTER (WHERE tipo_cbte != ALL(ARRAY[3, 8, 13]))::int AS invoice_count,
      SUM(amount_total::numeric) FILTER (WHERE tipo_cbte != ALL(ARRAY[3, 8, 13])) AS gross_revenue,
      COUNT(*) FILTER (WHERE tipo_cbte = ANY(ARRAY[3, 8, 13]))::int AS credit_note_count,
      SUM(amount_total::numeric) FILTER (WHERE tipo_cbte = ANY(ARRAY[3, 8, 13])) AS credit_note_total
    FROM ${sql.identifier(tableName)}
    WHERE EXTRACT(YEAR FROM cae_fch_vto) = ${year}
  `) as unknown as Array<{
    net_revenue: string | null
    invoice_count: string
    gross_revenue: string | null
    credit_note_count: string
    credit_note_total: string | null
  }>)[0]

  const monthly = Array.from({ length: 12 }, (_, i) => {
    const monthNum = i + 1
    const row = Array.from(monthlyRows).find((r) => Number(r.month) === monthNum)
    return {
      month: monthNum,
      netRevenue: parseFloat(row?.net_revenue ?? '0'),
      invoiceCount: parseInt(row?.invoice_count ?? '0', 10),
    }
  })

  // Resolve user's monotributo category from padron cache
  const arcaCuit = process.env.ARCA_CUIT ?? ''
  let myCategory: string | null = null
  let categoryLimit: { ingresosBrutos: number; cuotaMensual: number } | null = null

  if (arcaCuit) {
    const padronRow = await db
      .select({ data: padronCache.data })
      .from(padronCache)
      .where(and(eq(padronCache.cuit, arcaCuit), eq(padronCache.env, env)))
      .limit(1)

    const pd = padronRow[0]?.data as Record<string, unknown> | undefined
    const descripcion = (
      (pd?.datosMonotributo as Record<string, unknown>)
        ?.categoriaMonotributo as Record<string, unknown>
    )?.descripcionCategoria as string | undefined

    if (descripcion) {
      myCategory = descripcion.trim().split(/\s+/)[0] ?? null
    }

    if (myCategory) {
      const catRow = await db
        .select()
        .from(monotributoCategories)
        .where(eq(monotributoCategories.categ, myCategory))
        .limit(1)

      if (catRow[0]) {
        categoryLimit = {
          ingresosBrutos: parseFloat(catRow[0].ingresosBrutos),
          cuotaMensual: parseFloat(catRow[0].cuotaMensual),
        }
      }
    }
  }

  return NextResponse.json({
    year,
    monthly,
    totals: {
      netRevenue: parseFloat(totalsRow?.net_revenue ?? '0'),
      invoiceCount: parseInt(totalsRow?.invoice_count ?? '0', 10),
      grossRevenue: parseFloat(totalsRow?.gross_revenue ?? '0'),
      creditNoteCount: parseInt(totalsRow?.credit_note_count ?? '0', 10),
      creditNoteTotal: parseFloat(totalsRow?.credit_note_total ?? '0'),
    },
    myCategory,
    categoryLimit,
  })
}
