import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { monotributoCategories } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

const DEFAULT_URL = 'https://www.afip.gob.ar/monotributo/categorias.asp'

function parseArgentineNumber(s: string): number {
  // "10.277.988,13" → 10277988.13
  const clean = s.replace(/[^\d,]/g, '').replace(',', '.')
  return parseFloat(clean) || 0
}

function extractCells(rowHtml: string): string[] {
  const cells: string[] = []
  // Match both <th> and <td> — AFIP uses <th scope="row"> for the category letter
  const tdRe = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi
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

async function scrape(url: string) {
  console.log(`[scrape-monotributo] fetching: ${url}`)

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AFIP Portal scraper)' },
    cache: 'no-store',
  })

  console.log(`[scrape-monotributo] response: ${res.status} ${res.statusText}`)
  console.log(`[scrape-monotributo] content-type: ${res.headers.get('content-type')}`)

  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)

  const html = await res.text()
  console.log(`[scrape-monotributo] html length: ${html.length} chars`)

  // Count total <tr> tags to understand the page structure
  const allTrMatches = html.match(/<tr[^>]*>/gi) ?? []
  console.log(`[scrape-monotributo] total <tr> tags found: ${allTrMatches.length}`)

  // Use a Map to deduplicate — AFIP embeds multiple period tables; first occurrence = current period
  const categoriesMap = new Map<string, { categ: string; ingresosBrutos: number; cuotaMensual: number }>()
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let trMatch
  let rowsScanned = 0

  while ((trMatch = trRe.exec(html)) !== null) {
    const cells = extractCells(trMatch[1])
    rowsScanned++

    if (cells.length === 0) continue

    if (/^[A-Z]$/.test(cells[0])) {
      console.log(`[scrape-monotributo] candidate row — first cell: "${cells[0]}", cols: ${cells.length}, first4: ${JSON.stringify(cells.slice(0, 4))}`)
    }

    // Data rows: first cell is a single letter A–K, at least 11 total cells
    if (cells.length >= 11 && /^[A-K]$/.test(cells[0])) {
      const ingresosBrutos = parseArgentineNumber(cells[1])
      const cuotaMensual = parseArgentineNumber(cells[cells.length - 2])

      console.log(`[scrape-monotributo] matched cat ${cells[0]}: ingresosBrutos=${ingresosBrutos}, cuotaMensual=${cuotaMensual}`)

      // Keep first occurrence only (current period)
      if (ingresosBrutos > 0 && !categoriesMap.has(cells[0])) {
        categoriesMap.set(cells[0], { categ: cells[0], ingresosBrutos, cuotaMensual })
      }
    }
  }

  const categories = Array.from(categoriesMap.values()).sort((a, b) => a.categ.localeCompare(b.categ))
  console.log(`[scrape-monotributo] rows scanned: ${rowsScanned}, unique categories: ${categories.length}`)

  if (categories.length === 0) {
    console.error(`[scrape-monotributo] no categories found. HTML snippet:\n${html.slice(0, 3000)}`)
    throw new Error('No se encontraron categorías en la página')
  }

  return categories
}

export async function POST(req: NextRequest) {
  try {
    let url = DEFAULT_URL
    try {
      const body = await req.json()
      if (typeof body?.url === 'string' && body.url.trim()) {
        url = body.url.trim()
      }
    } catch { /* no body or non-JSON — use default */ }

    console.log(`[scrape-monotributo] POST start, url: ${url}`)

    const categories = await scrape(url)

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

    console.log(`[scrape-monotributo] upserted ${categories.length} categories`)
    return NextResponse.json({ categories, updated: categories.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error(`[scrape-monotributo] failed:`, err)
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
