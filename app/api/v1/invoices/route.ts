import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { arcaService } from '@/lib/arca/service'
import { getEmisor } from '@/lib/arca/emisor'
import { getInvoicesTable } from '@/lib/db/invoices-table'
import { padronCache } from '@/lib/db/schema'
import { uploadPdf } from '@/lib/r2/client'
import { InvoicePdfGenerator } from '@arcasdk/pdf'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'

const CONDICION_IVA_MAP: Record<number, string> = {
  1: 'Responsable Inscripto',
  2: 'Responsable no Inscripto',
  3: 'IVA no Responsable',
  4: 'IVA Sujeto Exento',
  5: 'Consumidor Final',
  6: 'Monotributista',
  7: 'Sujeto no Categorizado',
  8: 'Importador del Exterior',
  9: 'Cliente del Exterior',
  10: 'IVA Liberado - Ley Nº 19.640',
  11: 'Responsable Inscripto - Agente de Percepción',
  12: 'Pequeño Contribuyente Eventual',
  13: 'Monotributista Social',
  14: 'Pequeño Contribuyente Eventual Social',
}

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

async function generateAndUploadPdf(opts: {
  id: string
  arcaCuit: string
  cbteLetra: string
  data: {
    receptorName?: string
    docTipo: number
    docNro: number
    tipoCbte: number
    puntoVenta: number
    concepto: number
    impNeto: number
    impIva: number
    impTotal: number
    items: { description: string; quantity: number; unitPrice: number; ivaRate: number }[]
  }
  nroCbte: number
  today: string
  cae: string
  caeFchVto: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoices: any
}) {
  const { id, arcaCuit, cbteLetra, data, nroCbte, today, cae, caeFchVto, invoices } = opts
  try {
    console.log(`[PDF bg] start id=${id}`)
    const pdfStart = Date.now()

    const t0 = Date.now()
    const emisor = await getEmisor()
    console.log(`[PDF bg] getEmisor ${Date.now() - t0}ms`)

    // Look up receptor domicilio from padron cache
    let receptorDomicilio: string | undefined
    const docNroStr = String(data.docNro)
    if (docNroStr.length === 11) {
      const env = arcaService.getActiveEnv()
      const cached = await db
        .select({ data: padronCache.data })
        .from(padronCache)
        .where(and(eq(padronCache.cuit, docNroStr), eq(padronCache.env, env)))
        .limit(1)
      if (cached[0]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dg = ((cached[0].data as any)?.datosGenerales ?? cached[0].data) as Record<string, unknown>
        const domFiscal = dg?.domicilioFiscal as Record<string, unknown> | undefined
        if (domFiscal) {
          receptorDomicilio = [domFiscal.direccion, domFiscal.localidad, domFiscal.descripcionProvincia]
            .filter(Boolean)
            .join(', ') || undefined
        }
      }
    }

    const receptorCondicionIva = CONDICION_IVA_MAP[data.docTipo === 80 ? 1 : 5]

    const t1 = Date.now()
    const pdfGen = new InvoicePdfGenerator({ includeQr: true })
    const pdfBuffer = await pdfGen.generate({
      emisor,
      receptor: {
        razonSocial: data.receptorName ?? 'Consumidor Final',
        domicilio: receptorDomicilio,
        condicionIva: receptorCondicionIva,
        documentoTipo: data.docTipo === 80 ? 'CUIT' : data.docTipo === 86 ? 'CUIL' : 'DNI',
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
    console.log(`[PDF bg] pdfGen.generate ${Date.now() - t1}ms size=${pdfBuffer.length}b`)

    const year = new Date().getFullYear()
    const pdfKey = `invoices/${arcaCuit}/${year}/${id}.pdf`
    const t2 = Date.now()
    await uploadPdf(pdfKey, pdfBuffer)
    console.log(`[PDF bg] uploadPdf ${Date.now() - t2}ms`)

    await db.update(invoices).set({ pdfUrl: pdfKey }).where(eq(invoices.id, id))
    console.log(`[PDF bg] done total=${Date.now() - pdfStart}ms key=${pdfKey}`)
  } catch (err) {
    console.error(`[PDF bg] error id=${id}:`, err)
  }
}

export async function GET(request: NextRequest) {
  console.log('[GET /api/v1/invoices] handler entered')
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
  const offset = (page - 1) * limit
  const invoices = getInvoicesTable()
  const activeEnv = arcaService.getActiveEnv()

  try {
    const rows = await db
      .select()
      .from(invoices)
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
  const invoices = getInvoicesTable()
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
      receptorCuit: data.receptorCuit,
      receptorName: data.receptorName,
      pdfUrl: null,
      rawRequest: { ...voucherPayload, _items: data.items },
      rawResponse: result.response,
    })
    .returning()
  console.log(`[POST /api/v1/invoices] Saved invoice id=${invoice.id}`)

  const cbteLetra = data.tipoCbte <= 3 ? 'A' : data.tipoCbte <= 8 ? 'B' : 'C'

  // Fire-and-forget: invoice is already persisted; PDF runs in background.
  // The client can download via GET /api/v1/invoices/[id]/pdf once ready.
  void generateAndUploadPdf({
    id,
    arcaCuit,
    cbteLetra,
    data,
    nroCbte,
    today,
    cae,
    caeFchVto,
    invoices,
  })

  return NextResponse.json({ ...invoice, pdfUrl: null }, { status: 201 })
}
