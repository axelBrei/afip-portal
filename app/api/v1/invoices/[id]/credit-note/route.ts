import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { arcaService } from '@/lib/arca/service'
import { getInvoicesTable } from '@/lib/db/invoices-table'
import { uploadPdf } from '@/lib/r2/client'
import { getEmisor } from '@/lib/arca/emisor'
import { InvoicePdfGenerator } from '@arcasdk/pdf'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'

function toArcaDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

function caeDateToIso(arcaDate: string): string {
  if (arcaDate.includes('-')) return arcaDate
  return `${arcaDate.slice(0, 4)}-${arcaDate.slice(4, 6)}-${arcaDate.slice(6, 8)}`
}

async function generateCreditNotePdf(opts: {
  id: string
  arcaCuit: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  original: any
  nroCbte: number
  today: string
  cae: string
  caeFchVto: string
  items: { description: string; quantity: number; unitPrice: number; ivaRate: number }[]
  totalStr: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoices: any
}) {
  const { id, arcaCuit, original, nroCbte, today, cae, caeFchVto, items, totalStr, invoices } = opts
  try {
    console.log(`[PDF bg credit-note] start id=${id}`)
    const pdfStart = Date.now()

    const t0 = Date.now()
    const emisor = await getEmisor()
    console.log(`[PDF bg credit-note] getEmisor ${Date.now() - t0}ms`)

    const t1 = Date.now()
    const pdfGen = new InvoicePdfGenerator({ includeQr: true })
    const pdfBuffer = await pdfGen.generate({
      emisor,
      receptor: {
        razonSocial: original.receptorName ?? 'Consumidor Final',
        condicionIva: original.receptorCuit ? 'Responsable Inscripto' : 'Consumidor Final',
        documentoTipo: original.receptorCuit ? 'CUIT' : 'DNI',
        documentoNro: original.receptorCuit ?? '0',
      },
      cbteTipo: 13,
      cbteLetra: 'C',
      puntoVenta: original.puntoVenta,
      cbteDesde: nroCbte,
      cbteHasta: nroCbte,
      cbteFecha: today,
      concepto: 2,
      items: items.map((item) => ({
        descripcion: item.description,
        cantidad: item.quantity,
        precioUnitario: item.unitPrice,
        unidadMedida: 'u',
        subtotal: item.quantity * item.unitPrice,
        alicuotaIva: item.ivaRate,
      })),
      importeNetoGravado: Number(totalStr),
      importeIva: 0,
      importeTotal: Number(totalStr),
      cae,
      caeFechaVencimiento: caeFchVto,
    })
    console.log(`[PDF bg credit-note] pdfGen.generate ${Date.now() - t1}ms size=${pdfBuffer.length}b`)

    const year = new Date().getFullYear()
    const pdfKey = `invoices/${arcaCuit}/${year}/${id}.pdf`
    const t2 = Date.now()
    await uploadPdf(pdfKey, pdfBuffer)
    console.log(`[PDF bg credit-note] uploadPdf ${Date.now() - t2}ms`)

    await db.update(invoices).set({ pdfUrl: pdfKey }).where(eq(invoices.id, id))
    console.log(`[PDF bg credit-note] done total=${Date.now() - pdfStart}ms key=${pdfKey}`)
  } catch (err) {
    console.error(`[PDF bg credit-note] error id=${id}:`, err)
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const arcaCuit = process.env.ARCA_CUIT
  if (!arcaCuit) return NextResponse.json({ error: 'ARCA_CUIT not configured' }, { status: 503 })

  const invoices = getInvoicesTable()
  const rows = await db.select().from(invoices).where(eq(invoices.id, params.id)).limit(1)
  const original = rows[0]
  if (!original) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  if (original.tipoCbte !== 11) {
    return NextResponse.json(
      { error: 'Solo se puede anular una Factura C (tipo 11)' },
      { status: 422 }
    )
  }

  if (original.creditNoteId) {
    return NextResponse.json(
      { error: 'Esta factura ya tiene una nota de crédito', creditNoteId: original.creditNoteId },
      { status: 409 }
    )
  }

  const arca = arcaService.getClient()
  const today = toArcaDate(new Date())
  const totalStr = String(original.amountTotal)
  const originalDate = toArcaDate(new Date(original.createdAt))

  const rawReq = original.rawRequest as Record<string, unknown>
  const concepto = typeof rawReq.Concepto === 'number' ? rawReq.Concepto : 2

  const voucherPayload: Record<string, unknown> = {
    CantReg: 1,
    PtoVta: original.puntoVenta,
    CbteTipo: 13,
    Concepto: concepto,
    DocTipo: original.receptorCuit ? 80 : 99,
    DocNro: original.receptorCuit ? parseInt(original.receptorCuit, 10) : 0,
    CbteFch: today,
    ImpTotal: Number(totalStr),
    ImpTotConc: 0,
    ImpNeto: Number(totalStr),
    ImpIVA: 0,
    ImpTrib: 0,
    ImpOpEx: 0,
    MonId: 'PES',
    MonCotiz: 1,
    CondicionIVAReceptorId: original.receptorCuit ? 1 : 5,
    CbtesAsoc: [
      {
        Tipo: original.tipoCbte,
        PtoVta: original.puntoVenta,
        Nro: original.nroCbte,
        Cuit: arcaCuit,
        CbteFch: originalDate,
      },
    ],
  }

  if (concepto !== 1) {
    voucherPayload.FchServDesde = typeof rawReq.FchServDesde === 'string' ? rawReq.FchServDesde : today
    voucherPayload.FchServHasta = typeof rawReq.FchServHasta === 'string' ? rawReq.FchServHasta : today
    voucherPayload.FchVtoPago   = today
  }

  let result
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = await arca.electronicBillingService.createNextVoucher(voucherPayload as any)
  } catch (err) {
    console.error('[POST credit-note] ARCA error:', err)
    return NextResponse.json({ error: 'ARCA service error', details: String(err) }, { status: 502 })
  }

  const cabResultado = result.response.FeCabResp?.Resultado
  if (cabResultado !== 'A') {
    console.error('[POST credit-note] ARCA rejected:', JSON.stringify(result.response, null, 2))
    return NextResponse.json({ error: 'ARCA rejected the credit note', details: result.response }, { status: 422 })
  }

  const detResp = result.response.FeDetResp?.FECAEDetResponse?.[0]
  const nroCbte = detResp?.CbteDesde ?? detResp?.CbteHasta ?? 0
  const cae = result.cae
  const caeFchVto = result.caeFchVto

  const id = randomUUID()
  const [creditNote] = await db
    .insert(invoices)
    .values({
      id,
      cuit: arcaCuit,
      tipoCbte: 13,
      puntoVenta: original.puntoVenta,
      nroCbte,
      cae,
      caeFchVto: caeDateToIso(caeFchVto),
      amountNet: totalStr,
      amountIva: '0',
      amountTotal: totalStr,
      originalInvoiceId: params.id,
      receptorCuit: original.receptorCuit,
      receptorName: original.receptorName,
      pdfUrl: null,
      rawRequest: voucherPayload as unknown as Record<string, unknown>,
      rawResponse: result.response,
    })
    .returning()

  await db.update(invoices).set({ creditNoteId: id }).where(eq(invoices.id, params.id))

  const items: { description: string; quantity: number; unitPrice: number; ivaRate: number }[] =
    Array.isArray(rawReq._items)
      ? (rawReq._items as { description: string; quantity: number; unitPrice: number; ivaRate: number }[])
      : [{ description: 'Anulación de factura', quantity: 1, unitPrice: Number(totalStr), ivaRate: 0 }]

  // Fire-and-forget: credit note already persisted; PDF runs in background.
  void generateCreditNotePdf({
    id,
    arcaCuit,
    original,
    nroCbte,
    today,
    cae,
    caeFchVto,
    items,
    totalStr,
    invoices,
  })

  return NextResponse.json({ ...creditNote, pdfUrl: null }, { status: 201 })
}
