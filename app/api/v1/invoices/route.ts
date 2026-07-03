import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { arcaService } from '@/lib/arca/service'
import { uploadPdf } from '@/lib/r2/client'
import { InvoicePdfGenerator } from '@arcasdk/pdf'
import { z } from 'zod'
import { desc } from 'drizzle-orm'
import { randomUUID } from 'crypto'

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
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
  const offset = (page - 1) * limit

  const rows = await db
    .select()
    .from(invoices)
    .orderBy(desc(invoices.createdAt))
    .limit(limit)
    .offset(offset)

  return NextResponse.json({ data: rows, page, limit })
}

export async function POST(request: NextRequest) {
  const arcaCuit = process.env.ARCA_CUIT
  if (!arcaCuit) {
    return NextResponse.json({ error: 'ARCA_CUIT not configured' }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const data = parsed.data
  const arca = arcaService.getClient()
  const today = toArcaDate(new Date())

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
    ImpNeto: data.impNeto,
    ImpIVA: data.impIva,
    ImpTrib: 0,
    ImpOpEx: 0,
    MonId: data.monId,
    MonCotiz: data.monCotiz,
    CondicionIVAReceptorId: data.docTipo === 80 ? 1 : 5,
    Iva: data.iva,
    ...(data.concepto !== 1 && {
      FchServDesde: data.fchServDesde ?? today,
      FchServHasta: data.fchServHasta ?? today,
      FchVtoPago: data.fchVtoPago ?? today,
    }),
  }

  const result = await arca.electronicBillingService.createNextVoucher(voucherPayload)

  const cabResultado = result.response.FeCabResp?.Resultado
  if (cabResultado !== 'A') {
    return NextResponse.json(
      { error: 'ARCA rejected the invoice', details: result.response },
      { status: 422 }
    )
  }

  const detResp = result.response.FeDetResp?.FECAEDetResponse?.[0]
  const nroCbte = detResp?.CbteDesde ?? detResp?.CbteHasta ?? 0
  const cae = result.cae
  const caeFchVto = result.caeFchVto

  const cbteLetra = data.tipoCbte <= 3 ? 'A' : data.tipoCbte <= 8 ? 'B' : 'C'
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

  const id = randomUUID()
  const year = new Date().getFullYear()
  const pdfKey = `invoices/${arcaCuit}/${year}/${id}.pdf`
  await uploadPdf(pdfKey, pdfBuffer)

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
      pdfUrl: pdfKey,
      rawRequest: voucherPayload,
      rawResponse: result.response,
    })
    .returning()

  return NextResponse.json(invoice, { status: 201 })
}
