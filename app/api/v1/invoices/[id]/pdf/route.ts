import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { getPresignedUrl } from '@/lib/r2/client'
import { eq } from 'drizzle-orm'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const rows = await db
    .select({ pdfUrl: invoices.pdfUrl })
    .from(invoices)
    .where(eq(invoices.id, params.id))
    .limit(1)

  if (!rows[0]?.pdfUrl) {
    return NextResponse.json({ error: 'PDF not found' }, { status: 404 })
  }

  const url = await getPresignedUrl(rows[0].pdfUrl, 900)
  return NextResponse.redirect(url, { status: 302 })
}
