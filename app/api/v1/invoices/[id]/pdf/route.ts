import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getInvoicesTable } from '@/lib/db/invoices-table'
import { getPresignedUrl, uploadPdf } from '@/lib/r2/client'
import { getEmisor } from '@/lib/arca/emisor'
import { InvoicePdfGenerator } from '@arcasdk/pdf'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const arcaCuit = process.env.ARCA_CUIT
  if (!arcaCuit) return NextResponse.json({ error: 'ARCA_CUIT not configured' }, { status: 503 })

  const invoices = getInvoicesTable()
  const rows = await db.select().from(invoices).where(eq(invoices.id, params.id)).limit(1)
  const invoice = rows[0]
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (invoice.pdfUrl) return NextResponse.json({ error: 'PDF already exists' }, { status: 409 })

  const raw = invoice.rawRequest as Record<string, any>
  // Fall back to receptorCuit from DB when rawRequest lacks DocTipo (e.g. synced invoices)
  const docTipo: number = raw.DocTipo ?? (invoice.receptorCuit ? 80 : 99)
  const docNro: number = raw.DocNro ?? (invoice.receptorCuit ? parseInt(invoice.receptorCuit, 10) : 0)
  const storedItems: { description: string; quantity: number; unitPrice: number; ivaRate: number }[] =
    raw._items ?? [{ description: 'Honorarios', quantity: 1, unitPrice: Number(invoice.amountTotal), ivaRate: 0 }]

  const cbteLetra = invoice.tipoCbte <= 3 ? 'A' : invoice.tipoCbte <= 8 ? 'B' : 'C'
  const cbteFecha = invoice.createdAt.toISOString().slice(0, 10).replace(/-/g, '')

  try {
    const pdfStart = Date.now()
    console.log(`[POST /api/v1/invoices/${invoice.id}/pdf] PDF start`)

    const t0 = Date.now()
    const emisor = await getEmisor()
    console.log(`[POST /api/v1/invoices/${invoice.id}/pdf] getEmisor ${Date.now() - t0}ms`)

    const t1 = Date.now()
    const pdfGen = new InvoicePdfGenerator({ includeQr: true })
    const pdfBuffer = await pdfGen.generate({
      emisor,
      receptor: {
        razonSocial: invoice.receptorName ?? 'Consumidor Final',
        condicionIva: docTipo === 80 ? 'Responsable Inscripto' : 'Consumidor Final',
        documentoTipo: docTipo === 80 ? 'CUIT' : 'DNI',
        documentoNro: String(docNro),
      },
      cbteTipo: invoice.tipoCbte,
      cbteLetra,
      puntoVenta: invoice.puntoVenta,
      cbteDesde: invoice.nroCbte,
      cbteHasta: invoice.nroCbte,
      cbteFecha,
      concepto: raw.Concepto ?? 2,
      items: storedItems.map((item) => ({
        descripcion: item.description,
        cantidad: item.quantity,
        precioUnitario: item.unitPrice,
        unidadMedida: 'u',
        subtotal: item.quantity * item.unitPrice,
        alicuotaIva: item.ivaRate,
      })),
      importeNetoGravado: Number(invoice.amountNet),
      importeIva: Number(invoice.amountIva),
      importeTotal: Number(invoice.amountTotal),
      cae: invoice.cae,
      caeFechaVencimiento: invoice.caeFchVto,
    })
    console.log(`[POST /api/v1/invoices/${invoice.id}/pdf] pdfGen.generate ${Date.now() - t1}ms size=${pdfBuffer.length}b`)

    const year = invoice.createdAt.getFullYear()
    const pdfKey = `invoices/${arcaCuit}/${year}/${invoice.id}.pdf`
    const t2 = Date.now()
    await uploadPdf(pdfKey, pdfBuffer)
    console.log(`[POST /api/v1/invoices/${invoice.id}/pdf] uploadPdf ${Date.now() - t2}ms`)

    await db.update(invoices).set({ pdfUrl: pdfKey }).where(eq(invoices.id, invoice.id))
    console.log(`[POST /api/v1/invoices/${invoice.id}/pdf] done total=${Date.now() - pdfStart}ms key=${pdfKey}`)
    return NextResponse.json({ ok: true, pdfUrl: pdfKey })
  } catch (err) {
    console.error(`[POST /api/v1/invoices/${invoice.id}/pdf] Error:`, err)
    return NextResponse.json({ error: 'PDF generation failed', details: String(err) }, { status: 500 })
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const invoices = getInvoicesTable()
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
