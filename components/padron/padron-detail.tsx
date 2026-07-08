'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { PersonaServiceA5PortTypes } from '@arcasdk/core/lib/application/dto/register/persona-service-inscription-proof.types'

// SOAP responses come back with PascalCase keys; normalize to camelCase so we
// can use the SDK's TypeScript interfaces for field access.
function normalizeKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(normalizeKeys)
  if (typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        k.charAt(0).toLowerCase() + k.slice(1),
        normalizeKeys(v),
      ])
    )
  }
  return obj
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-AR')
}

function formatCuit(cuit: string | number): string {
  const s = String(cuit)
  if (s.length !== 11) return s
  return `${s.slice(0, 2)}-${s.slice(2, 10)}-${s.slice(10)}`
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-3">
      {children}
    </p>
  )
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  if (!value && value !== 0) return null
  return (
    <div className="grid grid-cols-[180px_1fr] gap-2 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  )
}

function StatusBadge({ estado }: { estado?: string }) {
  if (!estado) return null
  const isActive = estado === 'AC' || estado === 'ACTIVO'
  return (
    <Badge
      variant={isActive ? 'default' : 'secondary'}
      className={isActive ? 'bg-[#5e6ad2]/15 text-[#5e6ad2] border-[#5e6ad2]/30 border' : ''}
    >
      {isActive ? 'Activo' : estado}
    </Badge>
  )
}

async function fetchPadron(cuit: string) {
  const res = await fetch(`/api/v1/padron/${cuit}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const error = new Error(err.error ?? 'Error al consultar el padrón') as Error & { status: number }
    error.status = res.status
    throw error
  }
  return res.json() as Promise<{ data: unknown; cached: boolean }>
}

export function PadronDetail({ cuit }: { cuit: string }) {
  const router = useRouter()
  const { data: response, isLoading, error } = useQuery({
    queryKey: ['padron', cuit],
    queryFn: () => fetchPadron(cuit),
    retry: false,
  })

  useEffect(() => {
    if (!error) return
    const status = (error as Error & { status?: number }).status
    if (status === 404) {
      toast.error('CUIT no encontrado en el padrón')
    } else {
      toast.error(error.message)
    }
    router.replace('/padron')
  }, [error, router])

  if (isLoading) {
    return <Skeleton className="h-64 max-w-2xl mx-auto" />
  }

  if (!response) return null

  const raw = normalizeKeys(response.data) as PersonaServiceA5PortTypes.IpersonaReturn
  const dg = raw?.datosGenerales
  const drg = raw?.datosRegimenGeneral
  const dm = raw?.datosMonotributo

  const name = dg?.razonSocial || [dg?.nombre, dg?.apellido].filter(Boolean).join(' ') || cuit
  const domFiscal = dg?.domicilioFiscal
  const domAddress = [domFiscal?.direccion, domFiscal?.localidad, domFiscal?.descripcionProvincia]
    .filter(Boolean)
    .join(', ')

  const actividades = toArray(drg?.actividad)
  const impuestos   = toArray(drg?.impuesto)
  const regimenes   = toArray(drg?.regimen)

  const actividadesMono = toArray(dm?.actividad)

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <Card className="border-border">
        <CardContent className="px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <h1 className="text-xl font-semibold tracking-tight truncate">{name}</h1>
              <p className="text-sm text-muted-foreground font-mono">{formatCuit(cuit)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {response.cached && (
                <Badge variant="secondary" className="text-[10px]">Caché</Badge>
              )}
              <StatusBadge estado={dg?.estadoClave ?? (raw as unknown as Record<string, string>)?.estadoClave} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {dg?.tipoClave && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded-md text-muted-foreground">
                {dg.tipoClave}
              </span>
            )}
            {dg?.tipoPersona && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded-md text-muted-foreground">
                {dg.tipoPersona === 'JURIDICA' ? 'Persona Jurídica' : 'Persona Física'}
              </span>
            )}
            {dm?.categoriaMonotributo && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded-md text-muted-foreground">
                Monotributista
              </span>
            )}
            {!dm?.categoriaMonotributo && impuestos.some(i => i.idImpuesto === 30 && i.estadoImpuesto === 'AC') && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded-md text-muted-foreground">
                Responsable Inscripto
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Datos Generales */}
      {dg && (
        <Card className="border-border">
          <CardContent className="px-6 pt-6 pb-5">
            <Eyebrow>Datos Generales</Eyebrow>
            <div className="divide-y divide-border/50">
              <Field label="Mes de cierre" value={dg.mesCierre ? MONTHS[(dg.mesCierre as number) - 1] : undefined} />
              <Field
                label="Fecha constitución"
                value={dg.fechaContratoSocial ? formatDate(dg.fechaContratoSocial as string) : undefined}
              />
              <Field
                label="Fecha fallecimiento"
                value={dg.fechaFallecimiento ? formatDate(dg.fechaFallecimiento as string) : undefined}
              />
              <Field label="Es sucesión" value={dg.esSucesion === 'SI' || dg.esSucesion === 'S' ? 'Sí' : dg.esSucesion === 'NO' || dg.esSucesion === 'N' ? 'No' : dg.esSucesion} />
            </div>

            {domFiscal && (
              <div className="mt-5">
                <Eyebrow>Domicilio Fiscal</Eyebrow>
                <div className="space-y-0.5">
                  {domFiscal.direccion && (
                    <p className="text-sm text-foreground">{domFiscal.direccion}</p>
                  )}
                  {(domFiscal.localidad || domFiscal.descripcionProvincia) && (
                    <p className="text-sm text-muted-foreground">
                      {[domFiscal.localidad, domFiscal.descripcionProvincia].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {domFiscal.codPostal && (
                    <p className="text-sm text-muted-foreground">CP {domFiscal.codPostal}</p>
                  )}
                  {domFiscal.datoAdicional && (
                    <p className="text-sm text-muted-foreground">{domFiscal.datoAdicional}</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Régimen General */}
      {drg && (impuestos.length > 0 || actividades.length > 0 || regimenes.length > 0) && (
        <Card className="border-border">
          <CardContent className="px-6 pt-6 pb-5 space-y-5">
            <Eyebrow>Régimen General</Eyebrow>

            {impuestos.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Impuestos</p>
                <div className="space-y-1">
                  {impuestos.map((imp, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                      <div>
                        <span className="text-sm">{imp.descripcionImpuesto || `Impuesto ${imp.idImpuesto}`}</span>
                        {imp.idImpuesto && (
                          <span className="ml-2 text-xs text-muted-foreground">({imp.idImpuesto})</span>
                        )}
                      </div>
                      <StatusBadge estado={imp.estadoImpuesto} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {actividades.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Actividades</p>
                <div className="space-y-1">
                  {actividades.map((act, i) => (
                    <div key={i} className="flex items-start gap-3 py-1 text-sm">
                      {act.idActividad && (
                        <span className="text-muted-foreground font-mono text-xs mt-0.5 shrink-0">{act.idActividad}</span>
                      )}
                      <span>{act.descripcionActividad || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {regimenes.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Regímenes</p>
                <div className="space-y-1">
                  {regimenes.map((reg, i) => (
                    <div key={i} className="flex items-start gap-3 py-1 text-sm">
                      {reg.idRegimen && (
                        <span className="text-muted-foreground font-mono text-xs mt-0.5 shrink-0">{reg.idRegimen}</span>
                      )}
                      <span>{reg.descripcionRegimen || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Monotributo */}
      {dm && (
        <Card className="border-border">
          <CardContent className="px-6 pt-6 pb-5 space-y-4">
            <Eyebrow>Monotributo</Eyebrow>

            {dm.categoriaMonotributo && (
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm text-muted-foreground">Categoría</span>
                <span className="text-sm font-medium">
                  {dm.categoriaMonotributo.descripcionCategoria || `Cat. ${dm.categoriaMonotributo.idCategoria}`}
                </span>
              </div>
            )}

            {actividadesMono.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Actividades</p>
                <div className="space-y-1">
                  {actividadesMono.map((act, i) => (
                    <div key={i} className="flex items-start gap-3 py-1 text-sm">
                      {act.idActividad && (
                        <span className="text-muted-foreground font-mono text-xs mt-0.5 shrink-0">{act.idActividad}</span>
                      )}
                      <span>{act.descripcionActividad || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
