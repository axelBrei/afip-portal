'use client'

import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { CheckCircle, XCircle, AlertTriangle, Upload } from 'lucide-react'

type ArcaEnv = 'production' | 'sandbox'

interface CertStatus {
  loaded: boolean
  source: 'volume' | 'env' | null
}

interface SettingsData {
  cuit: string
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
            <span className="font-mono font-medium">{data.cuit}</span>
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
