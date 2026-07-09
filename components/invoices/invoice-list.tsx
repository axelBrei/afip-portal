'use client'

import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ChevronLeft, ChevronRight, RefreshCw, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Invoice } from '@/lib/db/schema'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'

type Filters = {
  dateFrom:   string
  dateTo:     string
  puntoVenta: string
  nroCbte:    string
  receptor:   string
  tipoCbte:   string
}

const EMPTY_FILTERS: Filters = { dateFrom: '', dateTo: '', puntoVenta: '', nroCbte: '', receptor: '', tipoCbte: '' }

async function fetchInvoices(page: number, filters: Filters): Promise<{ data: Invoice[]; page: number; limit: number; total: number }> {
  const params = new URLSearchParams({ page: String(page) })
  if (filters.dateFrom)   params.set('dateFrom', filters.dateFrom)
  if (filters.dateTo)     params.set('dateTo', filters.dateTo)
  if (filters.puntoVenta) params.set('puntoVenta', filters.puntoVenta)
  if (filters.nroCbte)    params.set('nroCbte', filters.nroCbte)
  if (filters.receptor)   params.set('receptor', filters.receptor)
  if (filters.tipoCbte)   params.set('tipoCbte', filters.tipoCbte)
  const base = typeof window !== 'undefined' ? '' : 'http://localhost:3000'
  const res = await fetch(`${base}/api/v1/invoices?${params}`)
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

export function InvoiceList() {
  const queryClient = useQueryClient()
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)

  const { data } = useSuspenseQuery({
    queryKey: ['invoices', page, filters],
    queryFn: () => fetchInvoices(page, filters),
  })

  function setFilter(key: keyof Filters, value: string) {
    setPage(1)
    setFilters(prev => ({ ...prev, [key]: value }))
  }


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

  const activeCount = Object.values(filters).filter(Boolean).length

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={cn('h-4 w-4 mr-1.5', syncing && 'animate-spin')} />
          {syncing ? 'Sincronizando...' : 'Sincronizar con AFIP'}
        </Button>
        <Popover>
          <PopoverTrigger className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            <SlidersHorizontal className="h-4 w-4 mr-1.5" />
            Filtrar
            {activeCount > 0 && (
              <span className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                {activeCount}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Fecha desde</Label>
                  <DatePicker
                    value={filters.dateFrom}
                    onChange={v => setFilter('dateFrom', v)}
                    placeholder="Desde"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Fecha hasta</Label>
                  <DatePicker
                    value={filters.dateTo}
                    onChange={v => setFilter('dateTo', v)}
                    placeholder="Hasta"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="filter-pto-venta">Pto. de Venta</Label>
                  <Input
                    id="filter-pto-venta"
                    type="number"
                    min={1}
                    value={filters.puntoVenta}
                    onChange={e => setFilter('puntoVenta', e.target.value)}
                    placeholder="Ej: 1"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="filter-nro">Número</Label>
                  <Input
                    id="filter-nro"
                    type="number"
                    min={1}
                    value={filters.nroCbte}
                    onChange={e => setFilter('nroCbte', e.target.value)}
                    placeholder="Ej: 42"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filter-receptor">Receptor</Label>
                <Input
                  id="filter-receptor"
                  type="text"
                  value={filters.receptor}
                  onChange={e => setFilter('receptor', e.target.value)}
                  placeholder="Nombre o CUIT"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filter-tipo">Tipo</Label>
                <select
                  id="filter-tipo"
                  value={filters.tipoCbte}
                  onChange={e => setFilter('tipoCbte', e.target.value)}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 cursor-pointer"
                >
                  <option value="">Todos los tipos</option>
                  <option value="1">Factura A</option>
                  <option value="6">Factura B</option>
                  <option value="11">Factura C</option>
                  <option value="2">Nota Débito A</option>
                  <option value="7">Nota Débito B</option>
                  <option value="12">Nota Débito C</option>
                  <option value="3">Nota Crédito A</option>
                  <option value="8">Nota Crédito B</option>
                  <option value="13">Nota Crédito C</option>
                </select>
              </div>
              {activeCount > 0 && (
                <button
                  onClick={() => { setFilters(EMPTY_FILTERS); setPage(1) }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>
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
              <TableHead className="sm:hidden"></TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Pto. Venta</TableHead>
              <TableHead>Nro.</TableHead>
              <TableHead>Receptor</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="hidden sm:table-cell"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="sm:hidden">
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
                  >
                    Ver
                  </Link>
                </TableCell>
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
                <TableCell className="hidden sm:table-cell">
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

      {data.total > data.limit && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            {(page - 1) * data.limit + 1}–{Math.min(page * data.limit, data.total)} de {data.total}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p - 1)}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 text-sm tabular-nums">
              {page} / {Math.ceil(data.total / data.limit)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={page * data.limit >= data.total}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
