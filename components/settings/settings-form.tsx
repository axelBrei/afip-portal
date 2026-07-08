'use client'

import { useSuspenseQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { CheckCircle, XCircle, AlertTriangle, Upload, RefreshCw } from 'lucide-react'
import type { MonotributoCategory } from '@/lib/db/schema'

type ArcaEnv = 'production' | 'sandbox'

interface CertStatus {
  loaded: boolean
  source: 'volume' | 'env' | null
}

interface SettingsData {
  cuit: string
  portalUser: string | null
  activeEnv: ArcaEnv
  certStatus: { production: CertStatus; sandbox: CertStatus }
}

async function fetchSettings(): Promise<SettingsData> {
  const res = await fetch('/api/v1/settings')
  if (!res.ok) throw new Error(`Failed to fetch settings: ${res.status} ${res.statusText}`)
  return res.json()
}

function CertStatusRow({ status }: { status: CertStatus }) {
  const Icon = status.loaded ? CheckCircle : XCircle
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <Icon className={`h-4 w-4 shrink-0 ${status.loaded ? 'text-[#27a644]' : 'text-muted-foreground'}`} />
      <span>{status.loaded ? `Cargado (${status.source})` : 'No cargado'}</span>
    </div>
  )
}

interface UploadSectionProps {
  env: ArcaEnv
  onSuccess: () => void
}

function UploadSection({ env, onSuccess }: UploadSectionProps) {
  const certRef = useRef<HTMLInputElement>(null)
  const keyRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function handleUpload() {
    const cert = certRef.current?.files?.[0]
    const key = keyRef.current?.files?.[0]
    if (!cert || !key) {
      setResult({ ok: false, message: 'Seleccioná ambos archivos (cert y key)' })
      return
    }
    setUploading(true)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('cert', cert)
      fd.append('key', key)
      const res = await fetch(`/api/v1/settings/certificates?env=${env}`, { method: 'PUT', body: fd })
      if (res.ok) {
        setResult({ ok: true, message: 'Certificados actualizados correctamente' })
        if (certRef.current) certRef.current.value = ''
        if (keyRef.current) keyRef.current.value = ''
        onSuccess()
      } else {
        let message = 'Error al subir los certificados'
        try {
          const body = await res.json()
          if (body?.error) message = body.error
        } catch { /* non-JSON */ }
        setResult({ ok: false, message })
      }
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={`cert-file-${env}`}>Certificado (.crt)</Label>
        <Input id={`cert-file-${env}`} type="file" accept=".crt,.pem" ref={certRef} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`key-file-${env}`}>Clave privada (.key)</Label>
        <Input id={`key-file-${env}`} type="file" accept=".key,.pem" ref={keyRef} />
      </div>
      {result && (
        <div className={`flex items-center gap-2 text-sm ${result.ok ? 'text-[#27a644]' : 'text-destructive'}`}>
          {result.ok ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {result.message}
        </div>
      )}
      <Button onClick={handleUpload} disabled={uploading}>
        <Upload className="h-4 w-4 mr-1" />
        {uploading ? 'Subiendo...' : 'Subir certificados'}
      </Button>
    </div>
  )
}

function fmtARS(n: number | string) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(Number(n))
}

const DEFAULT_SCRAPE_URL = 'https://www.afip.gob.ar/monotributo/categorias.asp'

function MonotributoCard() {
  const queryClient = useQueryClient()
  const [scraping, setScraping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scrapeUrl, setScrapeUrl] = useState(DEFAULT_SCRAPE_URL)

  const { data } = useQuery<{ categories: MonotributoCategory[] }>({
    queryKey: ['monotributo-categories'],
    queryFn: () => fetch('/api/v1/settings/scrape-monotributo').then((r) => r.json()),
    staleTime: 60_000,
  })

  async function handleScrape() {
    setScraping(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/settings/scrape-monotributo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: scrapeUrl }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Error al obtener datos')
      } else {
        await queryClient.invalidateQueries({ queryKey: ['monotributo-categories'] })
      }
    } catch {
      setError('Error de red')
    } finally {
      setScraping(false)
    }
  }

  const categories = data?.categories ?? []
  const lastUpdated = categories[0]?.updatedAt
    ? new Date(categories[0].updatedAt).toLocaleDateString('es-AR', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Límites Monotributo</CardTitle>
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">Actualizado {lastUpdated}</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Categorías vigentes de AFIP, incluyendo ingreso bruto anual máximo y cuota mensual
          (Locaciones y prestaciones de servicios).
        </p>

        {categories.length > 0 && (
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Cat.</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Ing. Brutos anuales</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Cuota mensual</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c, i) => (
                  <tr key={c.categ} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                    <td className="px-3 py-2 font-semibold text-foreground">{c.categ}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtARS(c.ingresosBrutos)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtARS(c.cuotaMensual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="scrape-url">URL de origen</Label>
          <Input
            id="scrape-url"
            value={scrapeUrl}
            onChange={(e) => setScrapeUrl(e.target.value)}
            placeholder={DEFAULT_SCRAPE_URL}
            className="font-mono text-xs"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <Button variant="outline" onClick={handleScrape} disabled={scraping}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${scraping ? 'animate-spin' : ''}`} />
          {scraping ? 'Consultando AFIP…' : 'Actualizar desde AFIP'}
        </Button>
      </CardContent>
    </Card>
  )
}

export function SettingsForm() {
  const queryClient = useQueryClient()
  const { data } = useSuspenseQuery({ queryKey: ['settings'], queryFn: fetchSettings })
  const [switching, setSwitching] = useState(false)
  const [uploadEnv, setUploadEnv] = useState<ArcaEnv>(data.activeEnv)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['settings'] })
  }

  async function handleEnvSwitch(env: ArcaEnv) {
    if (env === data.activeEnv || switching) return
    setSwitching(true)
    try {
      await fetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env }),
      })
      invalidate()
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      {/* Status */}
      <Card>
        <CardHeader><CardTitle>Estado actual</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">CUIT</span>
            <span className="font-mono font-medium">{data.cuit ?? <span className="text-destructive">No configurado</span>}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Usuario portal</span>
            {data.portalUser
              ? <span className="font-mono font-medium">{data.portalUser}</span>
              : <span className="text-destructive text-sm flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />PORTAL_USER no configurado</span>
            }
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Entorno activo</span>
            <div className="flex gap-2">
              <button
                onClick={() => handleEnvSwitch('production')}
                disabled={switching}
                className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                  data.activeEnv === 'production'
                    ? 'bg-[#5e6ad2] border-[#5e6ad2] text-white'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
                }`}
              >
                Producción
              </button>
              <button
                onClick={() => handleEnvSwitch('sandbox')}
                disabled={switching}
                className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                  data.activeEnv === 'sandbox'
                    ? 'bg-[#5e6ad2] border-[#5e6ad2] text-white'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
                }`}
              >
                Homologación
              </button>
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Cert. Producción</span>
            <CertStatusRow status={data.certStatus.production} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Cert. Homologación</span>
            <CertStatusRow status={data.certStatus.sandbox} />
          </div>
        </CardContent>
      </Card>

      <MonotributoCard />

      {/* Certificate upload */}
      <Card>
        <CardHeader><CardTitle>Actualizar certificados</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {(['production', 'sandbox'] as ArcaEnv[]).map((env) => (
              <button
                key={env}
                onClick={() => setUploadEnv(env)}
                className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                  uploadEnv === env
                    ? 'bg-[#5e6ad2] border-[#5e6ad2] text-white'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
                }`}
              >
                {env === 'production' ? 'Producción' : 'Homologación'}
              </button>
            ))}
          </div>
          <UploadSection key={uploadEnv} env={uploadEnv} onSuccess={invalidate} />
        </CardContent>
      </Card>
    </div>
  )
}
