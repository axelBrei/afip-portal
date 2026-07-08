import { NextResponse } from 'next/server'
import { arcaService } from '@/lib/arca/service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const arca = arcaService.getClient()
    const result = await arca.electronicBillingService.getDocumentTypes()
    const types = result?.resultGet?.docTipo ?? []
    return NextResponse.json({ data: types })
  } catch (err) {
    console.error('[GET /api/v1/invoices/document-types] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
