'use client'

import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Invoice } from '@/lib/db/schema'

async function fetchInvoices(page: number): Promise<{ data: Invoice[]; page: number; limit: number }> {
  const res = await fetch(`/api/v1/invoices?page=${page}`)
  if (!res.ok) throw new Error('Failed to fetch invoices')
  return res.json()
}

const INVOICE_TYPE_LABELS: Record<number, string> = {
  1: 'A', 2: 'A NdD', 3: 'A NdC',
  6: 'B', 7: 'B NdD', 8: 'B NdC',
  11: 'C', 12: 'C NdD', 13: 'C NdC',
}

const SYNC_TYPES = [1, 2, 3, 6, 7, 8, 11, 12, 13].flatMap((tipoCbte) => [
  { tipoCbte, puntoVenta: 1 },
  { tipoCbte, puntoVenta: 2 },
])

export function InvoiceList({ page = 1 }: { page?: number }) {
  const queryClient = useQueryClient()
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const { data } = useSuspenseQuery({
    queryKey: ['invoices', page],
    queryFn: () => fetchInvoices(page),
  })

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    let totalSynced = 0
    try {
      for (const { tipoCbte, puntoVenta } of SYNC_TYPES) {
        const res = await fetch(
          `/api/v1/invoices/sync?tipoCbte=${tipoCbte}&puntoVenta=${puntoVenta}`,
          { method: 'POST' }
        )
        if (res.ok) {
          const body = await res.json()
          totalSynced += body.synced ?? 0
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['invoices'] })
      setSyncResult(
        totalSynced > 0
          ? `${totalSynced} factura${totalSynced !== 1 ? 's' : ''} importada${totalSynced !== 1 ? 's' : ''}`
          : 'Sin cambios'
      )
    } catch {
      setSyncResult('Error al sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={cn('h-4 w-4 mr-1.5', syncing && 'animate-spin')} />
          {syncing ? 'Sincronizando...' : 'Sincronizar con AFIP'}
        </Button>
        {syncResult && <span className="text-sm text-muted-foreground">{syncResult}</span>}
      </div>

      {data.data.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No hay facturas aún.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Pto. Venta</TableHead>
              <TableHead>Nro.</TableHead>
              <TableHead>Receptor</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>CAE vence</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline">
                      Fac. {INVOICE_TYPE_LABELS[invoice.tipoCbte] ?? invoice.tipoCbte}
                    </Badge>
                    {invoice.tipoCbte === 11 && invoice.creditNoteId && (
                      <Badge variant="outline" className="text-destructive border-destructive/40">
                        Anulada
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{invoice.puntoVenta.toString().padStart(5, '0')}</TableCell>
                <TableCell>{invoice.nroCbte.toString().padStart(8, '0')}</TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {invoice.receptorName ?? invoice.receptorCuit ?? '—'}
                </TableCell>
                <TableCell className="text-right font-mono">
                  ${Number(invoice.amountTotal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell>{invoice.caeFchVto}</TableCell>
                <TableCell>{new Date(invoice.createdAt).toLocaleDateString('es-AR')}</TableCell>
                <TableCell>
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
                  >
                    Ver
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
