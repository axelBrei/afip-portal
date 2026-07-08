import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { arcaService } from '@/lib/arca/service'
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
      EXTRACT(MONTH FROM created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::int AS month,
      SUM(
        CASE WHEN tipo_cbte = ANY(ARRAY[3, 8, 13])
          THEN -amount_total::numeric
          ELSE amount_total::numeric
        END
      ) AS net_revenue,
      COUNT(*) FILTER (WHERE tipo_cbte != ALL(ARRAY[3, 8, 13]))::int AS invoice_count
    FROM ${sql.identifier(tableName)}
    WHERE EXTRACT(YEAR FROM created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') = ${year}
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
      COUNT(*) FILTER (WHERE tipo_cbte != ALL(ARRAY[3, 8, 13]))::int AS invoice_count
    FROM ${sql.identifier(tableName)}
    WHERE EXTRACT(YEAR FROM created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') = ${year}
  `) as unknown as Array<{ net_revenue: string | null; invoice_count: string }>)[0]

  const monthly = Array.from({ length: 12 }, (_, i) => {
    const monthNum = i + 1
    const row = Array.from(monthlyRows).find((r) => Number(r.month) === monthNum)
    return {
      month: monthNum,
      netRevenue: parseFloat(row?.net_revenue ?? '0'),
      invoiceCount: parseInt(row?.invoice_count ?? '0', 10),
    }
  })

  return NextResponse.json({
    year,
    monthly,
    totals: {
      netRevenue: parseFloat(totalsRow?.net_revenue ?? '0'),
      invoiceCount: parseInt(totalsRow?.invoice_count ?? '0', 10),
    },
  })
}
