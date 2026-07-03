'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { buttonVariants } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Invoice } from '@/lib/db/schema'

async function fetchInvoice(id: string): Promise<Invoice> {
  const res = await fetch(`/api/v1/invoices/${id}`)
  if (!res.ok) throw new Error('Invoice not found')
  return res.json()
}

export function InvoiceDetail({ id }: { id: string }) {
  const { data: invoice } = useSuspenseQuery({
    queryKey: ['invoice', id],
    queryFn: () => fetchInvoice(id),
  })

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          Factura {invoice.puntoVenta.toString().padStart(5, '0')}-
          {invoice.nroCbte.toString().padStart(8, '0')}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge>CAE: {invoice.cae}</Badge>
          {invoice.pdfUrl && (
            <a
              href={`/api/v1/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ size: 'sm' }))}
            >
              <Download className="h-4 w-4 mr-1" />
              PDF
            </a>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-muted-foreground">Receptor</p>
            <p className="font-medium">{invoice.receptorName ?? '—'}</p>
            {invoice.receptorCuit && <p className="text-muted-foreground">{invoice.receptorCuit}</p>}
          </div>
          <div>
            <p className="text-muted-foreground">Fecha</p>
            <p className="font-medium">{new Date(invoice.createdAt).toLocaleDateString('es-AR')}</p>
          </div>
        </div>
        <Separator />
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Neto gravado</span>
            <span className="font-mono">${Number(invoice.amountNet).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">IVA</span>
            <span className="font-mono">${Number(invoice.amountIva).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="font-mono">${Number(invoice.amountTotal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
        <Separator />
        <div>
          <p className="text-muted-foreground mb-1">CAE vence</p>
          <p>{invoice.caeFchVto}</p>
        </div>
      </CardContent>
    </Card>
  )
}
