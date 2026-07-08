import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { monotributoCategories } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

function parseArgentineNumber(s: string): number {
  // "10.277.988,13" → 10277988.13
  const clean = s.replace(/[^\d,]/g, '').replace(',', '.')
  return parseFloat(clean) || 0
}

function extractCells(rowHtml: string): string[] {
  const cells: string[] = []
  const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi
  let m
  while ((m = tdRe.exec(rowHtml)) !== null) {
    const text = m[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    cells.push(text)
  }
  return cells
}

async function scrape() {
  const res = await fetch('https://www.afip.gob.ar/monotributo/categorias.asp', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AFIP Portal scraper)' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`AFIP returned HTTP ${res.status}`)

  const html = await res.text()

  const categories: { categ: string; ingresosBrutos: number; cuotaMensual: number }[] = []
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let trMatch

  while ((trMatch = trRe.exec(html)) !== null) {
    const cells = extractCells(trMatch[1])
    // Data rows start with a single letter A–K and have at least 11 columns
    if (cells.length >= 11 && /^[A-K]$/.test(cells[0])) {
      const ingresosBrutos = parseArgentineNumber(cells[1])
      // Second-to-last column is "Total – Locaciones y prestaciones de servicios"
      const cuotaMensual = parseArgentineNumber(cells[cells.length - 2])
      if (ingresosBrutos > 0) {
        categories.push({ categ: cells[0], ingresosBrutos, cuotaMensual })
      }
    }
  }

  if (categories.length === 0) {
    throw new Error('No se encontraron categorías en la página de AFIP')
  }

  return categories
}

export async function POST() {
  try {
    const categories = await scrape()

    await db
      .insert(monotributoCategories)
      .values(
        categories.map((c) => ({
          categ: c.categ,
          ingresosBrutos: c.ingresosBrutos.toFixed(2),
          cuotaMensual: c.cuotaMensual.toFixed(2),
        }))
      )
      .onConflictDoUpdate({
        target: monotributoCategories.categ,
        set: {
          ingresosBrutos: sql`EXCLUDED.ingresos_brutos`,
          cuotaMensual: sql`EXCLUDED.cuota_mensual`,
          updatedAt: sql`now()`,
        },
      })

    return NextResponse.json({ categories, updated: categories.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function GET() {
  const rows = await db
    .select()
    .from(monotributoCategories)
    .orderBy(monotributoCategories.categ)

  return NextResponse.json({ categories: rows })
}
