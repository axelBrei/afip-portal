import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getInvoicesTable } from '@/lib/db/invoices-table'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

function stripQuotes(s: string): string {
  return s.replace(/^"|"$/g, '').trim()
}

function parseRow(line: string): string[] {
  return line.split(';').map(stripQuotes)
}

function parseNum(s: string): string {
  const clean = s.replace(',', '.').trim()
  return clean === '' ? '0' : clean
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function POST(request: NextRequest) {
  const arcaCuit = process.env.ARCA_CUIT
  if (!arcaCuit) return NextResponse.json({ error: 'ARCA_CUIT not configured' }, { status: 503 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const text = await file.text()
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return NextResponse.json({ error: 'CSV has no data rows' }, { status: 400 })

  const headers = parseRow(lines[0])
  const col = (name: string) => headers.indexOf(name)

  const COL = {
    fecha:      col('Fecha de Emisión'),
    tipo:       col('Tipo de Comprobante'),
    ptoVta:     col('Punto de Venta'),
    nroDesde:   col('Número Desde'),
    cae:        col('Cód. Autorización'),
    tipoDoc:    col('Tipo Doc. Receptor'),
    nroDoc:     col('Nro. Doc. Receptor'),
    nombre:     col('Denominación Receptor'),
    netTotal:   col('Imp. Neto Gravado Total'),
    totalIva:   col('Total IVA'),
    impTotal:   col('Imp. Total'),
  }

  const missing = Object.entries(COL).filter(([, i]) => i === -1).map(([k]) => k)
  if (missing.length > 0) {
    return NextResponse.json({ error: `Missing columns: ${missing.join(', ')}` }, { status: 400 })
  }

  const invoices = getInvoicesTable()

  const existing = await db
    .select({ tipoCbte: invoices.tipoCbte, puntoVenta: invoices.puntoVenta, nroCbte: invoices.nroCbte })
    .from(invoices)
    .where(eq(invoices.cuit, arcaCuit))

  const existingSet = new Set(existing.map(r => `${r.tipoCbte}-${r.puntoVenta}-${r.nroCbte}`))

  let imported = 0
  let skipped = 0

  for (let i = 1; i < lines.length; i++) {
    const cells = parseRow(lines[i])
    const cae = cells[COL.cae]
    if (!cae) continue

    const tipoCbte   = parseInt(cells[COL.tipo], 10)
    const puntoVenta = parseInt(cells[COL.ptoVta], 10)
    const nroCbte    = parseInt(cells[COL.nroDesde], 10)

    if (existingSet.has(`${tipoCbte}-${puntoVenta}-${nroCbte}`)) {
      skipped++
      continue
    }

    const tipoDoc = parseInt(cells[COL.tipoDoc], 10) || 99
    const fecha   = cells[COL.fecha]

    await db.insert(invoices).values({
      id:           randomUUID(),
      cuit:         arcaCuit,
      tipoCbte,
      puntoVenta,
      nroCbte,
      cae,
      caeFchVto:    addDays(fecha, 10),
      amountNet:    parseNum(cells[COL.netTotal]),
      amountIva:    parseNum(cells[COL.totalIva]),
      amountTotal:  parseNum(cells[COL.impTotal]),
      receptorCuit: tipoDoc === 80 ? cells[COL.nroDoc].padStart(11, '0') : null,
      receptorName: cells[COL.nombre] || null,
      pdfUrl:       null,
      rawRequest:   { source: 'csv', fecha },
      rawResponse:  {},
    })

    existingSet.add(`${tipoCbte}-${puntoVenta}-${nroCbte}`)
    imported++
  }

  return NextResponse.json({ imported, skipped })
}
