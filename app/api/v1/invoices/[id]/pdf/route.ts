import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { getPresignedUrl } from '@/lib/r2/client'
import { eq } from 'drizzle-orm'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rows = await db
      .select({ pdfUrl: invoices.pdfUrl })
      .from(invoices)
      .where(eq(invoices.id, params.id))
      .limit(1)

    if (!rows[0]?.pdfUrl) {
      console.log(`[GET /api/v1/invoices/${params.id}/pdf] PDF not found`)
      return NextResponse.json({ error: 'PDF not found' }, { status: 404 })
    }

    try {
      const url = await getPresignedUrl(rows[0].pdfUrl, 900)
      return NextResponse.redirect(url, { status: 302 })
    } catch (err) {
      console.error(`[GET /api/v1/invoices/${params.id}/pdf] R2 presign error:`, err)
      return NextResponse.json({ error: 'Failed to generate PDF URL', details: String(err) }, { status: 500 })
    }
  } catch (err) {
    console.error(`[GET /api/v1/invoices/${params.id}/pdf] DB error:`, err)
    return NextResponse.json({ error: 'Failed to fetch invoice' }, { status: 500 })
  }
}
