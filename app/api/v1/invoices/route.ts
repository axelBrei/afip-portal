import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { arcaService } from '@/lib/arca/service'
import { uploadPdf } from '@/lib/r2/client'
import { InvoicePdfGenerator } from '@arcasdk/pdf'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'

console.log('[invoices/route] module loaded')

const ivaItemSchema = z.object({
  Id: z.number().int(),
  BaseImp: z.number(),
  Importe: z.number(),
})

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
  ivaRate: z.number(),
})

const createSchema = z.object({
  puntoVenta: z.number().int().min(1).max(9999),
  tipoCbte: z.number().int().min(1),
  concepto: z.number().int().min(1).max(3),
  docTipo: z.number().int(),
  docNro: z.number().int(),
  receptorCuit: z.string().length(11).optional(),
  receptorName: z.string().max(255).optional(),
  impNeto: z.number().nonnegative(),
  impIva: z.number().nonnegative(),
  impTotal: z.number().positive(),
  monId: z.string().default('PES'),
  monCotiz: z.number().default(1),
  iva: z.array(ivaItemSchema),
  items: z.array(lineItemSchema).min(1),
  fchServDesde: z.string().optional(),
  fchServHasta: z.string().optional(),
  fchVtoPago: z.string().optional(),
})

function toArcaDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

function caeDateToIso(arcaDate: string): string {
  return `${arcaDate.slice(0, 4)}-${arcaDate.slice(4, 6)}-${arcaDate.slice(6, 8)}`
}

export async function GET(request: NextRequest) {
  console.log('[GET /api/v1/invoices] handler entered')
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
  const offset = (page - 1) * limit
  const activeEnv = arcaService.getActiveEnv()

  try {
    const rows = await db
      .select()
      .from(invoices)
      .where(eq(invoices.arcaEnv, activeEnv))
      .orderBy(desc(invoices.createdAt))
      .limit(limit)
      .offset(offset)

    console.log(`[GET /api/v1/invoices] env=${activeEnv} page=${page} limit=${limit} returned=${rows.length}`)
    return NextResponse.json({ data: rows, page, limit })
  } catch (err) {
    console.error('[GET /api/v1/invoices] DB error:', err)
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const arcaCuit = process.env.ARCA_CUIT
  if (!arcaCuit) {
    console.error('[POST /api/v1/invoices] ARCA_CUIT not configured')
    return NextResponse.json({ error: 'ARCA_CUIT not configured' }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    console.error('[POST /api/v1/invoices] Validation error:', parsed.error.flatten())
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const data = parsed.data
  console.log(`[POST /api/v1/invoices] tipoCbte=${data.tipoCbte} puntoVenta=${data.puntoVenta} impTotal=${data.impTotal}`)
  const arca = arcaService.getClient()
  const today = toArcaDate(new Date())

  // Factura C types (11=C, 12=ND C, 13=NC C): no Iva array, ImpNeto = total
  const isTipoC = data.tipoCbte >= 11 && data.tipoCbte <= 13

  const voucherPayload = {
    CantReg: 1,
    PtoVta: data.puntoVenta,
    CbteTipo: data.tipoCbte,
    Concepto: data.concepto,
    DocTipo: data.docTipo,
    DocNro: data.docNro,
    CbteFch: today,
    ImpTotal: data.impTotal,
    ImpTotConc: 0,
    ImpNeto: isTipoC ? data.impTotal : data.impNeto,
    ImpIVA: isTipoC ? 0 : data.impIva,
    ImpTrib: 0,
    ImpOpEx: 0,
    MonId: data.monId,
    MonCotiz: data.monCotiz,
    CondicionIVAReceptorId: data.docTipo === 80 ? 1 : 5,
    ...(!isTipoC && { Iva: data.iva }),
    ...(data.concepto !== 1 && {
      FchServDesde: data.fchServDesde ?? today,
      FchServHasta: data.fchServHasta ?? today,
      FchVtoPago: data.fchVtoPago ?? today,
    }),
  }

  let result
  try {
    result = await arca.electronicBillingService.createNextVoucher(voucherPayload)
  } catch (err) {
    console.error('[POST /api/v1/invoices] ARCA createNextVoucher error:', err)
    return NextResponse.json({ error: 'ARCA service error', details: String(err) }, { status: 502 })
  }

  const cabResultado = result.response.FeCabResp?.Resultado
  if (cabResultado !== 'A') {
    console.error('[POST /api/v1/invoices] ARCA rejected:', result.response)
    return NextResponse.json(
      { error: 'ARCA rejected the invoice', details: result.response },
      { status: 422 }
    )
  }

  const detResp = result.response.FeDetResp?.FECAEDetResponse?.[0]
  const nroCbte = detResp?.CbteDesde ?? detResp?.CbteHasta ?? 0
  const cae = result.cae
  const caeFchVto = result.caeFchVto
  console.log(`[POST /api/v1/invoices] ARCA approved nroCbte=${nroCbte} cae=${cae}`)

  // Save to DB immediately so the invoice is not lost if PDF generation fails
  const id = randomUUID()
  const [invoice] = await db
    .insert(invoices)
    .values({
      id,
      cuit: arcaCuit,
      tipoCbte: data.tipoCbte,
      puntoVenta: data.puntoVenta,
      nroCbte,
      cae,
      caeFchVto: caeFchVto.includes('-') ? caeFchVto : caeDateToIso(caeFchVto),
      amountNet: data.impNeto.toString(),
      amountIva: data.impIva.toString(),
      amountTotal: data.impTotal.toString(),
      arcaEnv: arcaService.getActiveEnv(),
      receptorCuit: data.receptorCuit,
      receptorName: data.receptorName,
      pdfUrl: null,
      rawRequest: { ...voucherPayload, _items: data.items },
      rawResponse: result.response,
    })
    .returning()
  console.log(`[POST /api/v1/invoices] Saved invoice id=${invoice.id}`)

  const cbteLetra = data.tipoCbte <= 3 ? 'A' : data.tipoCbte <= 8 ? 'B' : 'C'
  let pdfKey: string | null = null
  try {
    const pdfGen = new InvoicePdfGenerator({ includeQr: true })
    const pdfBuffer = await pdfGen.generate({
      emisor: {
        cuit: arcaCuit,
        razonSocial: process.env.ARCA_RAZON_SOCIAL ?? '',
        domicilioComercial: process.env.ARCA_DOMICILIO ?? '',
        condicionIva: process.env.ARCA_CONDICION_IVA ?? 'Responsable Inscripto',
        iibb: process.env.ARCA_IIBB ?? '',
        fechaInicioActividades: process.env.ARCA_INICIO_ACTIVIDADES ?? '',
      },
      receptor: {
        razonSocial: data.receptorName ?? 'Consumidor Final',
        condicionIva: data.docTipo === 80 ? 'Responsable Inscripto' : 'Consumidor Final',
        documentoTipo: data.docTipo === 80 ? 'CUIT' : 'DNI',
        documentoNro: String(data.docNro),
      },
      cbteTipo: data.tipoCbte,
      cbteLetra,
      puntoVenta: data.puntoVenta,
      cbteDesde: nroCbte,
      cbteHasta: nroCbte,
      cbteFecha: today,
      concepto: data.concepto,
      items: data.items.map((item) => ({
        descripcion: item.description,
        cantidad: item.quantity,
        precioUnitario: item.unitPrice,
        unidadMedida: 'u',
        subtotal: item.quantity * item.unitPrice,
        alicuotaIva: item.ivaRate,
      })),
      importeNetoGravado: data.impNeto,
      importeIva: data.impIva,
      importeTotal: data.impTotal,
      cae,
      caeFechaVencimiento: caeFchVto,
    })
    const year = new Date().getFullYear()
    pdfKey = `invoices/${arcaCuit}/${year}/${id}.pdf`
    await uploadPdf(pdfKey, pdfBuffer)
    console.log(`[POST /api/v1/invoices] PDF uploaded to ${pdfKey}`)
    await db.update(invoices).set({ pdfUrl: pdfKey }).where(eq(invoices.id, id))
  } catch (err) {
    console.error('[POST /api/v1/invoices] PDF generation/upload error (invoice already saved):', err)
  }

  return NextResponse.json({ ...invoice, pdfUrl: pdfKey }, { status: 201 })
}
