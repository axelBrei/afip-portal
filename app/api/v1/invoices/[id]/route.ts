import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rows = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, params.id))
      .limit(1)

    if (!rows[0]) {
      console.log(`[GET /api/v1/invoices/${params.id}] Not found`)
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(rows[0])
  } catch (err) {
    console.error(`[GET /api/v1/invoices/${params.id}] DB error:`, err)
    return NextResponse.json({ error: 'Failed to fetch invoice' }, { status: 500 })
  }
}
