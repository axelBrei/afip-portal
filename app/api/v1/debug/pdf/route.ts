import { NextResponse } from 'next/server'
import fs from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { InvoicePdfGenerator } from '@arcasdk/pdf'

const execFileAsync = promisify(execFile)

export const dynamic = 'force-dynamic'

export async function GET() {
  const info: Record<string, unknown> = {}

  info.NODE_ENV = process.env.NODE_ENV
  info.PUPPETEER_EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH ?? '(not set)'
  info.PUPPETEER_SKIP_DOWNLOAD = process.env.PUPPETEER_SKIP_DOWNLOAD ?? '(not set)'

  const knownPaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/local/bin/chromium-docker',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean) as string[]

  info.binaries = Object.fromEntries(
    knownPaths.map((p) => {
      try {
        fs.accessSync(p, fs.constants.X_OK)
        return [p, 'executable']
      } catch (e) {
        return [p, `not accessible: ${String(e)}`]
      }
    })
  )

  const chromiumPath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    knownPaths.find((p) => {
      try { fs.accessSync(p, fs.constants.X_OK); return true } catch { return false }
    })

  if (chromiumPath) {
    try {
      const { stdout, stderr } = await execFileAsync(chromiumPath, ['--version'], { timeout: 5000 })
      info.chromiumVersion = stdout.trim() || stderr.trim()
    } catch (e) {
      info.chromiumVersionError = String(e)
    }
  } else {
    info.chromiumVersion = 'no accessible binary found'
  }

  // Show running Chromium processes — leftover zombies cause second-launch hangs
  try {
    const { stdout } = await execFileAsync('sh', ['-c', 'ps aux | grep -i chrom | grep -v grep || true'], { timeout: 3000 })
    info.chromiumProcesses = stdout.trim() || '(none)'
  } catch (e) {
    info.chromiumProcesses = `ps failed: ${String(e)}`
  }

  // Disk space in /tmp — Chrome writes large temp files per launch
  try {
    const { stdout } = await execFileAsync('df', ['-h', '/tmp'], { timeout: 3000 })
    info.tmpDiskUsage = stdout.trim()
  } catch {
    // ignore
  }

  const t = Date.now()
  try {
    const gen = new InvoicePdfGenerator({ includeQr: false })
    await gen.generate({
      emisor: {
        razonSocial: 'DEBUG TEST',
        domicilioComercial: 'Calle Falsa 123',
        condicionIva: 'Responsable Inscripto',
        cuit: '20000000001',
        iibb: '123',
        fechaInicioActividades: '2020-01-01',
      },
      receptor: {
        razonSocial: 'DEBUG RECEPTOR',
        documentoTipo: 'DNI',
        documentoNro: '12345678',
        condicionIva: 'Consumidor Final',
      },
      cbteTipo: 6,
      cbteLetra: 'B',
      puntoVenta: 1,
      cbteDesde: 1,
      cbteHasta: 1,
      cbteFecha: '20240101',
      concepto: 1,
      items: [{ descripcion: 'Debug item', cantidad: 1, precioUnitario: 100, unidadMedida: 'u', subtotal: 100 }],
      importeNetoGravado: 100,
      importeIva: 0,
      importeTotal: 100,
      cae: '12345678901234',
      caeFechaVencimiento: '20240110',
    })
    info.pdfGeneration = `OK (${Date.now() - t}ms)`
  } catch (e) {
    info.pdfGeneration = 'FAILED'
    info.pdfGenerationError = e instanceof Error ? e.message : String(e)
    info.pdfGenerationStack = e instanceof Error ? e.stack : undefined
    info.pdfGenerationElapsed = `${Date.now() - t}ms`
  }

  return NextResponse.json(info, { status: 200 })
}
