'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { Invoice } from '@/lib/db/schema'

async function fetchInvoices(page: number): Promise<{ data: Invoice[]; page: number; limit: number }> {
  const res = await fetch(`/api/v1/invoices?page=${page}`)
  if (!res.ok) throw new Error('Failed to fetch invoices')
  return res.json()
}

const INVOICE_TYPE_LABELS: Record<number, string> = {
  1: 'A', 2: 'A NdC', 3: 'A NdD',
  6: 'B', 7: 'B NdC', 8: 'B NdD',
  11: 'C', 12: 'C NdC', 13: 'C NdD',
}

export function InvoiceList({ page = 1 }: { page?: number }) {
  const { data } = useSuspenseQuery({
    queryKey: ['invoices', page],
    queryFn: () => fetchInvoices(page),
  })

  if (data.data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No hay facturas aún.
      </div>
    )
  }

  return (
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
              <Badge variant="outline">
                Fac. {INVOICE_TYPE_LABELS[invoice.tipoCbte] ?? invoice.tipoCbte}
              </Badge>
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
  )
}
