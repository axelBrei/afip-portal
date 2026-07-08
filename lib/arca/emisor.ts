import { arcaService } from './service'

export interface EmisorData {
  cuit: string
  razonSocial: string
  domicilioComercial: string
  condicionIva: string
  iibb: string
  fechaInicioActividades: string
}

// Process-lifetime cache — resets on container restart, cheap to refetch
let cached: EmisorData | null = null

export async function getEmisor(): Promise<EmisorData> {
  if (cached) return cached

  const arcaCuit = process.env.ARCA_CUIT
  if (!arcaCuit) throw new Error('ARCA_CUIT not configured')

  const arca = arcaService.getClient()
  console.log(`[getEmisor] fetching from ws_sr_constancia_inscripcion cuit=${arcaCuit}`)
  const t0 = Date.now()
  let taxpayer = null
  try {
    taxpayer = await arca.registerInscriptionProofService.getTaxpayerDetails(
      parseInt(arcaCuit, 10)
    )
  } catch (err) {
    // Sandbox may return SOAP faults not matched by isAfipNotFoundError — fall through to env var fallback
    console.warn(`[getEmisor] getTaxpayerDetails threw for CUIT ${arcaCuit}:`, err)
  }
  console.log(`[getEmisor] ws_sr_constancia_inscripcion ${Date.now() - t0}ms`)

  if (!taxpayer) {
    // ARCA sandbox doesn't have all CUITs registered — fall back to env vars
    console.warn(`[getEmisor] CUIT ${arcaCuit} not found in ARCA registry, falling back to env vars`)
    cached = {
      cuit: arcaCuit,
      razonSocial: process.env.ARCA_RAZON_SOCIAL || '',
      domicilioComercial: process.env.ARCA_DOMICILIO || '',
      condicionIva: process.env.ARCA_CONDICION_IVA || 'Responsable Inscripto',
      iibb: process.env.ARCA_IIBB ?? '',
      fechaInicioActividades: process.env.ARCA_INICIO_ACTIVIDADES ?? '',
    }
    return cached
  }

  // TaxpayerDetailsDto types a subset — runtime has the full SOAP IdatosGenerales
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dg = (taxpayer.datosGenerales ?? taxpayer) as any
  const domFiscal = dg?.domicilioFiscal ?? {}

  const razonSocial =
    dg?.razonSocial ||
    [dg?.nombre, dg?.apellido].filter(Boolean).join(' ') ||
    process.env.ARCA_RAZON_SOCIAL ||
    ''

  const domicilioComercial =
    [domFiscal.direccion, domFiscal.localidad, domFiscal.descripcionProvincia]
      .filter(Boolean)
      .join(', ') ||
    process.env.ARCA_DOMICILIO ||
    ''

  // Derive condicionIva from tax regime data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawTp = taxpayer as any
  const hasMonotributo = !!rawTp.datosMonotributo?.categoriaMonotributo
  const impuestos: Array<{ idImpuesto?: number; estadoImpuesto?: string }> =
    rawTp.datosRegimenGeneral?.impuesto ?? []
  // idImpuesto 30 = IVA (Responsable Inscripto)
  const isRespInscripto = impuestos.some(
    (imp) => imp.idImpuesto === 30 && imp.estadoImpuesto === 'AC'
  )

  const condicionIva = hasMonotributo
    ? 'Monotributista'
    : isRespInscripto
      ? 'Responsable Inscripto'
      : process.env.ARCA_CONDICION_IVA || 'Responsable Inscripto'

  cached = {
    cuit: arcaCuit,
    razonSocial,
    domicilioComercial,
    condicionIva,
    // These fields are not returned by ws_sr_constancia_inscripcion
    iibb: process.env.ARCA_IIBB ?? '',
    fechaInicioActividades: process.env.ARCA_INICIO_ACTIVIDADES ?? '',
  }

  return cached
}
