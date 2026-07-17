'use client'

import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Download, FileText, RotateCcw, CheckCircle2, ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Invoice } from '@/lib/db/schema'
import { api } from '@/lib/api-path'

const TIPO_LABEL: Record<number, string> = {
  1: 'Factura A', 2: 'Nota de Débito A', 3: 'Nota de Crédito A',
  6: 'Factura B', 7: 'Nota de Débito B', 8: 'Nota de Crédito B',
  11: 'Factura C', 12: 'Nota de Débito C', 13: 'Nota de Crédito C',
}

async function fetchInvoice(id: string): Promise<Invoice> {
  const res = await fetch(api(`/api/v1/invoices/${id}`))
  if (!res.ok) throw new Error('Invoice not found')
  return res.json()
}

function fmt(n: number | string) {
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })
}

function voucherRef(inv: Invoice) {
  return `${inv.puntoVenta.toString().padStart(5, '0')}-${inv.nroCbte.toString().padStart(8, '0')}`
}

function afipCheckerUrl(inv: Invoice) {
  const fecha = new Date(inv.createdAt).toISOString().slice(0, 10)
  const payload = {
    ver:        1,
    fecha,
    cuit:       parseInt(inv.cuit, 10),
    ptoVta:     inv.puntoVenta,
    tipoCmp:    inv.tipoCbte,
    nroCmp:     inv.nroCbte,
    importe:    parseFloat(inv.amountTotal),
    moneda:     'PES',
    ctz:        1,
    tipoDocRec: inv.receptorCuit ? 80 : 99,
    nroDocRec:  inv.receptorCuit ? parseInt(inv.receptorCuit, 10) : 0,
    tipoCodAut: 'E',
    codAut:     parseInt(inv.cae, 10),
  }
  const p = btoa(JSON.stringify(payload))
  return `https://servicioscf.afip.gob.ar/publico/comprobantes/cae.aspx?p=${p}`
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </p>
  )
}

function RelatedBanner({
  label,
  sublabel,
  href,
  icon,
  accent = false,
  external = false,
}: {
  label: string
  sublabel?: string
  href: string
  icon: React.ReactNode
  accent?: boolean
  external?: boolean
}) {
  const className = cn(
    'flex items-center justify-between px-4 py-3 rounded-lg border bg-card transition-colors text-sm group',
    accent
      ? 'border-primary/40 hover:border-primary/60 hover:bg-accent'
      : 'border-border hover:bg-accent'
  )
  const inner = (
    <>
      <div className="flex items-center gap-2.5">
        <span className={cn('shrink-0', accent ? 'text-primary' : 'text-muted-foreground')}>
          {icon}
        </span>
        <div>
          <span className="text-foreground">{label}</span>
          {sublabel && <span className="text-muted-foreground ml-2 text-xs">{sublabel}</span>}
        </div>
      </div>
      {external
        ? <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
        : <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
      }
    </>
  )
  if (external) {
    return <a href={href} target="_blank" rel="noreferrer" className={className}>{inner}</a>
  }
  return <Link href={href} className={className}>{inner}</Link>
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
      const res = await fetch(api(`/api/v1/invoices/${id}/pdf`), { method: 'POST' })
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
      const res = await fetch(api(`/api/v1/invoices/${id}/credit-note`), { method: 'POST' })
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
  const invoiceDate = new Date(invoice.createdAt).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="max-w-2xl mx-auto space-y-3">

      {/* NC → anulled invoice banner */}
      {isNC && invoice.originalInvoiceId && (
        <RelatedBanner
          label="Anula Factura C"
          href={`/invoices/${invoice.originalInvoiceId}`}
          icon={<ArrowLeft className="h-4 w-4" />}
        />
      )}

      {/* Main card */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-5">
          <Eyebrow>{tipoLabel}</Eyebrow>
          <h1 className="mt-1.5 text-xl sm:text-[2rem] font-semibold tracking-tight text-foreground font-mono leading-none">
            {voucherRef(invoice)}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{invoiceDate}</p>
          <div className="flex items-center gap-2 mt-4">
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
                {generating ? 'Generando…' : 'Generar PDF'}
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
                {crediting ? 'Anulando…' : 'Crear NC'}
              </Button>
            )}
          </div>
          {(genError || creditError) && (
            <p className="mt-3 text-sm text-destructive">{genError ?? creditError}</p>
          )}
        </div>

        <div className="border-t border-border" />

        {/* Body */}
        <div className="px-6 py-5 space-y-6">

          {/* Receptor */}
          <div>
            <Eyebrow>Receptor</Eyebrow>
            <div className="mt-2 space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                {invoice.receptorName ?? 'Consumidor Final'}
              </p>
              {invoice.receptorCuit && (
                <p className="font-mono text-xs text-muted-foreground">
                  CUIT {invoice.receptorCuit}
                </p>
              )}
            </div>
          </div>

          {/* Amounts */}
          <div>
            <Eyebrow>Importes</Eyebrow>
            <div className="mt-3 space-y-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Neto gravado</span>
                <span className="font-mono tabular-nums">${fmt(invoice.amountNet)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">IVA</span>
                <span className="font-mono tabular-nums">${fmt(invoice.amountIva)}</span>
              </div>
              <div className="border-t border-border" />
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Total</span>
                <span className="font-mono text-2xl font-semibold text-foreground tabular-nums tracking-tight">
                  ${fmt(invoice.amountTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* CAE */}
          <div className="rounded-md bg-muted/50 border border-border/60 px-4 py-3.5">
            <div className="flex items-center justify-between mb-2">
              <Eyebrow>CAE</Eyebrow>
              <span className="text-[11px] text-muted-foreground">Vence {invoice.caeFchVto}</span>
            </div>
            <p className="font-mono text-sm text-foreground tracking-wide">{invoice.cae}</p>
          </div>

        </div>
      </div>

      {/* AFIP CAE checker */}
      <RelatedBanner
        label="Verificar comprobante en AFIP"
        href={afipCheckerUrl(invoice)}
        icon={<ExternalLink className="h-4 w-4" />}
        external
      />

      {/* Factura C → NC link */}
      {isFacC && creditNoteId && !freshCreditNote && (
        <RelatedBanner
          label="Nota de Crédito emitida"
          sublabel={`→ ver NC`}
          href={`/invoices/${creditNoteId}`}
          icon={<RotateCcw className="h-4 w-4" />}
          accent
        />
      )}

      {/* Fresh NC success */}
      {freshCreditNote && (
        <div className="rounded-lg border border-primary/30 bg-card overflow-hidden">
          <div className="px-5 py-4 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm font-medium">Nota de Crédito autorizada</p>
            </div>
            <div className="rounded-md bg-muted/50 border border-border/60 px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">
                NC {voucherRef(freshCreditNote)}
              </p>
              <p className="font-mono text-sm text-foreground">{freshCreditNote.cae}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Vence {freshCreditNote.caeFchVto}</p>
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
          </div>
        </div>
      )}

    </div>
  )
}
