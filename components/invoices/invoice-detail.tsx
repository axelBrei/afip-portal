'use client'

import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Download, FileText, RotateCcw, CheckCircle2, ArrowLeft, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Invoice } from '@/lib/db/schema'

const TIPO_LABEL: Record<number, string> = {
  1: 'Factura A', 2: 'Nota de Débito A', 3: 'Nota de Crédito A',
  6: 'Factura B', 7: 'Nota de Débito B', 8: 'Nota de Crédito B',
  11: 'Factura C', 12: 'Nota de Débito C', 13: 'Nota de Crédito C',
}

async function fetchInvoice(id: string): Promise<Invoice> {
  const res = await fetch(`/api/v1/invoices/${id}`)
  if (!res.ok) throw new Error('Invoice not found')
  return res.json()
}

function fmt(n: number | string) {
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })
}

function voucherRef(inv: Invoice) {
  return `${inv.puntoVenta.toString().padStart(5, '0')}-${inv.nroCbte.toString().padStart(8, '0')}`
}

function RelatedBanner({
  label,
  href,
  icon,
}: {
  label: string
  href: string
  icon: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-muted/40 hover:bg-muted transition-colors text-sm"
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  )
}

export function InvoiceDetail({ id }: { id: string }) {
  const queryClient = useQueryClient()
  const { data: invoice } = useSuspenseQuery({
    queryKey: ['invoice', id],
    queryFn: () => fetchInvoice(id),
  })

  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [crediting, setCrediting] = useState(false)
  const [creditError, setCreditError] = useState<string | null>(null)
  const [freshCreditNote, setFreshCreditNote] = useState<Invoice | null>(null)

  async function handleGeneratePdf() {
    setGenerating(true)
    setGenError(null)
    try {
      const res = await fetch(`/api/v1/invoices/${id}/pdf`, { method: 'POST' })
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ['invoice', id] })
      } else {
        const body = await res.json().catch(() => ({}))
        setGenError(body.error ?? 'Error al generar PDF')
      }
    } catch {
      setGenError('Error de red')
    } finally {
      setGenerating(false)
    }
  }

  async function handleCreditNote() {
    setCrediting(true)
    setCreditError(null)
    try {
      const res = await fetch(`/api/v1/invoices/${id}/credit-note`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        setFreshCreditNote(body)
        await queryClient.invalidateQueries({ queryKey: ['invoices'] })
        await queryClient.invalidateQueries({ queryKey: ['invoice', id] })
      } else {
        setCreditError(body.error ?? 'Error al crear nota de crédito')
      }
    } catch {
      setCreditError('Error de red')
    } finally {
      setCrediting(false)
    }
  }

  const isFacC = invoice.tipoCbte === 11
  const isNC = invoice.tipoCbte === 13
  const tipoLabel = TIPO_LABEL[invoice.tipoCbte] ?? `Tipo ${invoice.tipoCbte}`
  const creditNoteId = invoice.creditNoteId ?? freshCreditNote?.id ?? null

  return (
    <div className="max-w-2xl mx-auto space-y-3">

      {/* Relation banners */}
      {isNC && invoice.originalInvoiceId && (
        <RelatedBanner
          label="Anula Factura C"
          href={`/invoices/${invoice.originalInvoiceId}`}
          icon={<ArrowLeft className="h-4 w-4" />}
        />
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">{tipoLabel}</p>
            <CardTitle>{voucherRef(invoice)}</CardTitle>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {invoice.pdfUrl ? (
              <a
                href={`/api/v1/invoices/${invoice.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                <Download className="h-4 w-4 mr-1.5" />
                PDF
              </a>
            ) : (
              <Button size="sm" variant="outline" onClick={handleGeneratePdf} disabled={generating}>
                <FileText className="h-4 w-4 mr-1.5" />
                {generating ? 'Generando...' : 'Generar PDF'}
              </Button>
            )}
            {isFacC && !creditNoteId && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleCreditNote}
                disabled={crediting}
                className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              >
                <RotateCcw className="h-4 w-4 mr-1.5" />
                {crediting ? 'Anulando...' : 'Crear NC'}
              </Button>
            )}
          </div>
        </CardHeader>

        {genError && <p className="px-6 pb-2 text-sm text-destructive">{genError}</p>}
        {creditError && <p className="px-6 pb-2 text-sm text-destructive">{creditError}</p>}

        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground">Receptor</p>
              <p className="font-medium">{invoice.receptorName ?? '—'}</p>
              {invoice.receptorCuit && (
                <p className="text-muted-foreground font-mono text-xs">{invoice.receptorCuit}</p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">Fecha</p>
              <p className="font-medium">
                {new Date(invoice.createdAt).toLocaleDateString('es-AR')}
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Neto gravado</span>
              <span className="font-mono">${fmt(invoice.amountNet)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA</span>
              <span className="font-mono">${fmt(invoice.amountIva)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span className="font-mono">${fmt(invoice.amountTotal)}</span>
            </div>
          </div>

          <Separator />

          <div className="flex items-start justify-between">
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">CAE</p>
              <p className="font-mono text-sm">{invoice.cae}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Vence {invoice.caeFchVto}</p>
            </div>
            <Badge variant="outline">{tipoLabel}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* NC relation — existing from DB or just created */}
      {isFacC && creditNoteId && !freshCreditNote && (
        <RelatedBanner
          label={`Nota de Crédito emitida`}
          href={`/invoices/${creditNoteId}`}
          icon={<RotateCcw className="h-4 w-4" />}
        />
      )}

      {freshCreditNote && (
        <Card className="border-primary/30">
          <CardContent className="pt-5 pb-5 px-6 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              <p className="font-medium text-sm">Nota de Crédito autorizada</p>
            </div>
            <div className="bg-muted rounded-md px-4 py-3 space-y-0.5">
              <p className="text-xs text-muted-foreground">NC {voucherRef(freshCreditNote)}</p>
              <p className="font-mono text-sm">{freshCreditNote.cae}</p>
              <p className="text-xs text-muted-foreground">Vence {freshCreditNote.caeFchVto}</p>
            </div>
            <div className="flex gap-2">
              {freshCreditNote.pdfUrl && (
                <a
                  href={`/api/v1/invoices/${freshCreditNote.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(buttonVariants({ size: 'sm' }))}
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  PDF
                </a>
              )}
              <Link
                href={`/invoices/${freshCreditNote.id}`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                Ver NC
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
