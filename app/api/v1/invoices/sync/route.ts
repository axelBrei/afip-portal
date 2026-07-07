import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { arcaService } from '@/lib/arca/service'
import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

function caeDateToIso(arcaDate: string): string {
  if (arcaDate.includes('-')) return arcaDate
  return `${arcaDate.slice(0, 4)}-${arcaDate.slice(4, 6)}-${arcaDate.slice(6, 8)}`
}

export async function POST(request: NextRequest) {
  const arcaCuit = process.env.ARCA_CUIT
  if (!arcaCuit) return NextResponse.json({ error: 'ARCA_CUIT not configured' }, { status: 503 })

  const { searchParams } = new URL(request.url)
  const tipoCbte = parseInt(searchParams.get('tipoCbte') ?? '11', 10)
  const puntoVenta = parseInt(searchParams.get('puntoVenta') ?? '1', 10)

  const arca = arcaService.getClient()

  let lastNro: number
  try {
    const lastResult = await arca.electronicBillingService.getLastVoucher(puntoVenta, tipoCbte)
    lastNro = lastResult.cbteNro ?? 0
  } catch (err) {
    console.error('[sync] getLastVoucher error:', err)
    return NextResponse.json({ error: 'Failed to query AFIP', details: String(err) }, { status: 502 })
  }

  if (lastNro === 0) {
    return NextResponse.json({ lastNro: 0, missing: 0, synced: 0 })
  }

  const existing = await db
    .select({ nroCbte: invoices.nroCbte })
    .from(invoices)
    .where(and(eq(invoices.tipoCbte, tipoCbte), eq(invoices.puntoVenta, puntoVenta), eq(invoices.cuit, arcaCuit)))

  const existingSet = new Set(existing.map((r) => r.nroCbte))

  const missing: number[] = []
  for (let i = 1; i <= lastNro; i++) {
    if (!existingSet.has(i)) missing.push(i)
  }

  let synced = 0
  const errors: { nro: number; error: string }[] = []

  for (const nro of missing) {
    try {
      const info = await arca.electronicBillingService.getVoucherInfo(nro, puntoVenta, tipoCbte)
      if (!info || info.resultado !== 'A') continue

      const cae = info.codAutorizacion ?? ''
      const caeFchVto = info.fchVto ? caeDateToIso(info.fchVto) : ''
      if (!cae || !caeFchVto) continue

      await db.insert(invoices).values({
        id: randomUUID(),
        cuit: arcaCuit,
        tipoCbte,
        puntoVenta,
        nroCbte: nro,
        cae,
        caeFchVto,
        amountNet: String(info.impNeto ?? 0),
        amountIva: String(info.impIVA ?? 0),
        amountTotal: String(info.impTotal ?? 0),
        receptorCuit: info.docTipo === 80 ? String(info.docNro).padStart(11, '0') : null,
        receptorName: null,
        pdfUrl: null,
        rawRequest: {},
        rawResponse: info as unknown as Record<string, unknown>,
      })
      synced++
    } catch (err) {
      console.error(`[sync] nro=${nro} error:`, err)
      errors.push({ nro, error: String(err) })
    }
  }

  console.log(`[sync] tipoCbte=${tipoCbte} puntoVenta=${puntoVenta} lastNro=${lastNro} missing=${missing.length} synced=${synced}`)
  return NextResponse.json({ lastNro, missing: missing.length, synced, errors: errors.length > 0 ? errors : undefined })
}
