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

interface SettingsData {
  cuit: string
  env: string
  certStatus: { loaded: boolean; source: 'volume' | 'env' | null }
}

async function fetchSettings(): Promise<SettingsData> {
  const res = await fetch('/api/v1/settings')
  if (!res.ok) throw new Error(`Failed to fetch settings: ${res.status} ${res.statusText}`)
  return res.json()
}

export function SettingsForm() {
  const queryClient = useQueryClient()
  const { data } = useSuspenseQuery({ queryKey: ['settings'], queryFn: fetchSettings })
  const certRef = useRef<HTMLInputElement>(null)
  const keyRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function handleUpload() {
    const cert = certRef.current?.files?.[0]
    const key = keyRef.current?.files?.[0]
    if (!cert || !key) {
      setUploadResult({ ok: false, message: 'Seleccioná ambos archivos (cert y key)' })
      return
    }
    setUploading(true)
    setUploadResult(null)
    try {
      const fd = new FormData()
      fd.append('cert', cert)
      fd.append('key', key)
      const res = await fetch('/api/v1/settings/certificates', { method: 'PUT', body: fd })
      if (res.ok) {
        setUploadResult({ ok: true, message: 'Certificados actualizados correctamente' })
        queryClient.invalidateQueries({ queryKey: ['settings'] })
      } else {
        let message = 'Error al subir los certificados'
        try {
          const body = await res.json()
          if (body?.error) message = body.error
        } catch {
          // non-JSON error response
        }
        setUploadResult({ ok: false, message })
      }
    } finally {
      setUploading(false)
    }
  }

  const CertIcon = data.certStatus.loaded
    ? CheckCircle
    : XCircle

  return (
    <div className="space-y-6 max-w-xl">
      <Card>
        <CardHeader><CardTitle>Estado actual</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">CUIT</span>
            <span className="font-mono font-medium">{data.cuit}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Entorno</span>
            <Badge variant={data.env === 'production' ? 'default' : 'secondary'}>
              {data.env === 'production' ? 'Producción' : 'Homologación'}
            </Badge>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Certificado</span>
            <div className="flex items-center gap-1">
              <CertIcon
                className={`h-4 w-4 ${data.certStatus.loaded ? 'text-green-500' : 'text-destructive'}`}
              />
              <span>{data.certStatus.loaded ? `Cargado (${data.certStatus.source})` : 'No encontrado'}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Actualizar certificados</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="cert-file">Certificado (.crt)</Label>
            <Input id="cert-file" type="file" accept=".crt,.pem" ref={certRef} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="key-file">Clave privada (.key)</Label>
            <Input id="key-file" type="file" accept=".key,.pem" ref={keyRef} />
          </div>
          {uploadResult && (
            <div className={`flex items-center gap-2 text-sm ${uploadResult.ok ? 'text-green-600' : 'text-destructive'}`}>
              {uploadResult.ok ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {uploadResult.message}
            </div>
          )}
          <Button onClick={handleUpload} disabled={uploading}>
            <Upload className="h-4 w-4 mr-1" />
            {uploading ? 'Subiendo...' : 'Subir certificados'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
