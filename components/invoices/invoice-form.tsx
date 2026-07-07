'use client'

import { useState, useEffect } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { useMutation } from '@tanstack/react-query'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Trash2, Plus, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

const IVA_RATES = [
  { id: 3, label: '0%', rate: 0 },
  { id: 4, label: '10.5%', rate: 10.5 },
  { id: 5, label: '21%', rate: 21 },
  { id: 6, label: '27%', rate: 27 },
]

const CBTE_TYPES = [
  { id: 1, label: 'Factura A' },
  { id: 6, label: 'Factura B' },
  { id: 11, label: 'Factura C' },
]

const lineItemSchema = z.object({
  description: z.string().min(1, 'Requerido'),
  quantity: z.coerce.number().positive('Debe ser > 0'),
  unitPrice: z.coerce.number().positive('Debe ser > 0'),
  ivaRateId: z.coerce.number(),
})

const formSchema = z.object({
  tipoCbte: z.coerce.number().int(),
  puntoVenta: z.coerce.number().int().min(1).max(9999),
  receptorCuit: z.string().optional(),
  fchServDesde: z.string().min(1, 'Requerido'),
  fchServHasta: z.string().min(1, 'Requerido'),
  fchVtoPago: z.string().min(1, 'Requerido'),
  items: z.array(lineItemSchema).min(1, 'Al menos un ítem'),
})

type FormData = z.infer<typeof formSchema>

type InvoicePayload = {
  puntoVenta: number
  tipoCbte: number
  concepto: number
  docTipo: number
  docNro: number
  receptorCuit?: string
  receptorName?: string
  impNeto: number
  impIva: number
  impTotal: number
  monId: string
  monCotiz: number
  iva: { Id: number; BaseImp: number; Importe: number }[]
  items: { description: string; quantity: number; unitPrice: number; ivaRate: number }[]
  fchServDesde?: string
  fchServHasta?: string
  fchVtoPago?: string
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function firstDayOfMonthIso() {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

function thirtyDaysFromNowIso() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

function calcTotals(items: FormData['items']) {
  let net = 0
  let iva = 0
  const ivaMap: Record<number, { BaseImp: number; Importe: number }> = {}

  for (const item of items) {
    const rate = IVA_RATES.find((r) => r.id === item.ivaRateId)
    const lineNet = item.quantity * item.unitPrice
    const lineIva = lineNet * ((rate?.rate ?? 0) / 100)
    net += lineNet
    iva += lineIva
    if (!ivaMap[item.ivaRateId]) ivaMap[item.ivaRateId] = { BaseImp: 0, Importe: 0 }
    ivaMap[item.ivaRateId].BaseImp += lineNet
    ivaMap[item.ivaRateId].Importe += lineIva
  }

  return {
    impNeto: Math.round(net * 100) / 100,
    impIva: Math.round(iva * 100) / 100,
    impTotal: Math.round((net + iva) * 100) / 100,
    ivaBreakdown: Object.entries(ivaMap).map(([id, v]) => ({
      Id: parseInt(id, 10),
      BaseImp: Math.round(v.BaseImp * 100) / 100,
      Importe: Math.round(v.Importe * 100) / 100,
    })),
  }
}

export function InvoiceForm() {
  const [receptorName, setReceptorName] = useState<string | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createdInvoice, setCreatedInvoice] = useState<any>(null)

  const {
    register, control, handleSubmit, watch, setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tipoCbte: 11,
      puntoVenta: 1,
      receptorCuit: '30715446142',
      fchServDesde: firstDayOfMonthIso(),
      fchServHasta: todayIso(),
      fchVtoPago: thirtyDaysFromNowIso(),
      items: [{ description: 'Honorarios', quantity: 1, unitPrice: 0, ivaRateId: 3 }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchedItems = watch('items')
  const watchedCuit = watch('receptorCuit')
  const watchedTipoCbte = watch('tipoCbte')
  const totals = calcTotals(watchedItems ?? [])

  useEffect(() => {
    if (/^\d{11}$/.test(watchedCuit ?? '')) lookupCuit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedCuit])

  async function lookupCuit() {
    const cuit = (watchedCuit ?? '').replace(/\D/g, '')
    if (cuit.length !== 11) return
    setLookingUp(true)
    try {
      const res = await fetch(`/api/v1/padron/${cuit}`)
      if (res.ok) {
        const body = await res.json()
        setReceptorName(body.data?.persona?.denominacion ?? body.data?.persona?.apellido ?? null)
      }
    } finally {
      setLookingUp(false)
    }
  }

  const createInvoice = useMutation({
    mutationFn: async (payload: InvoicePayload) => {
      const res = await fetch('/api/v1/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: (invoice) => setCreatedInvoice(invoice),
    onError: (err) => setSubmitError(err instanceof Error ? err.message : 'Error al crear factura'),
  })

  function onSubmit(data: FormData) {
    setSubmitError(null)
    const t = calcTotals(data.items)
    createInvoice.mutate({
      puntoVenta: data.puntoVenta,
      tipoCbte: data.tipoCbte,
      concepto: 2,
      docTipo: data.receptorCuit ? 80 : 99,
      docNro: (() => {
        if (!data.receptorCuit) return 0
        const n = parseInt(data.receptorCuit.replace(/\D/g, ''), 10)
        return Number.isFinite(n) ? n : 0
      })(),
      receptorCuit: data.receptorCuit,
      receptorName: receptorName ?? undefined,
      impNeto: t.impNeto,
      impIva: t.impIva,
      impTotal: t.impTotal,
      monId: 'PES',
      monCotiz: 1,
      iva: t.ivaBreakdown,
      fchServDesde: data.fchServDesde.replace(/-/g, ''),
      fchServHasta: data.fchServHasta.replace(/-/g, ''),
      fchVtoPago: data.fchVtoPago.replace(/-/g, ''),
      items: data.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        ivaRate: IVA_RATES.find((r) => r.id === i.ivaRateId)?.rate ?? 0,
      })),
    })
  }

  if (createdInvoice) {
    return (
      <Card className="max-w-lg">
        <CardContent className="pt-6 space-y-3">
          <p className="text-sm text-muted-foreground">Factura autorizada</p>
          <p className="font-mono text-lg font-semibold">{createdInvoice.cae}</p>
          <p className="text-sm text-muted-foreground">Vence {createdInvoice.caeFchVto}</p>
        </CardContent>
        <CardFooter className="gap-2">
          {createdInvoice.pdfUrl && (
            <a
              href={`/api/v1/invoices/${createdInvoice.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ size: 'sm' }))}
            >
              <Download className="h-4 w-4 mr-1.5" />
              Descargar PDF
            </a>
          )}
          <Link href="/invoices" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            Ver facturas
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
      {/* Comprobante */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Tipo de comprobante</Label>
          <Select
            value={watchedTipoCbte?.toString() ?? '11'}
            onValueChange={(v) => v && setValue('tipoCbte', parseInt(v, 10))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CBTE_TYPES.map((t) => (
                <SelectItem key={t.id} value={t.id.toString()}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Punto de venta</Label>
          <Input type="number" {...register('puntoVenta')} />
          {errors.puntoVenta && <p className="text-xs text-destructive">{errors.puntoVenta.message}</p>}
        </div>
      </div>

      {/* Receptor */}
      <div className="space-y-1.5">
        <Label>CUIT receptor <span className="text-muted-foreground font-normal">(opcional)</span></Label>
        <div className="flex gap-2">
          <Input {...register('receptorCuit')} placeholder="20111111112" maxLength={11} />
          <Button type="button" variant="outline" onClick={lookupCuit} disabled={lookingUp}>
            {lookingUp ? 'Buscando...' : 'Buscar'}
          </Button>
        </div>
        {receptorName && <p className="text-sm text-muted-foreground">{receptorName}</p>}
      </div>

      {/* Período */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Período desde</Label>
          <Input type="date" {...register('fchServDesde')} />
          {errors.fchServDesde && <p className="text-xs text-destructive">{errors.fchServDesde.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Período hasta</Label>
          <Input type="date" {...register('fchServHasta')} />
          {errors.fchServHasta && <p className="text-xs text-destructive">{errors.fchServHasta.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Vto. pago</Label>
          <Input type="date" {...register('fchVtoPago')} />
          {errors.fchVtoPago && <p className="text-xs text-destructive">{errors.fchVtoPago.message}</p>}
        </div>
      </div>

      <Separator />

      {/* Ítems */}
      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground px-1">
          <span className="col-span-5">Descripción</span>
          <span className="col-span-2">Cantidad</span>
          <span className="col-span-2">Precio unit.</span>
          <span className="col-span-2">IVA</span>
        </div>
        {fields.map((field, idx) => {
          const ivaRateId = watch(`items.${idx}.ivaRateId`)
          return (
            <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-5">
                <Input {...register(`items.${idx}.description`)} placeholder="Descripción" />
              </div>
              <div className="col-span-2">
                <Input type="number" step="0.01" {...register(`items.${idx}.quantity`)} />
              </div>
              <div className="col-span-2">
                <Input type="number" step="0.01" {...register(`items.${idx}.unitPrice`)} />
              </div>
              <div className="col-span-2">
                <Select
                  value={String(ivaRateId ?? 3)}
                  onValueChange={(v) => v && setValue(`items.${idx}.ivaRateId`, parseInt(v, 10))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IVA_RATES.map((r) => (
                      <SelectItem key={r.id} value={r.id.toString()}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1 flex justify-center">
                {fields.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )
        })}
        {errors.items && <p className="text-xs text-destructive">{errors.items.message}</p>}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => append({ description: '', quantity: 1, unitPrice: 0, ivaRateId: 3 })}
        >
          <Plus className="h-4 w-4 mr-1" />
          Agregar ítem
        </Button>
      </div>

      <Separator />

      {/* Totales */}
      <div className="space-y-1 text-sm max-w-xs ml-auto">
        <div className="flex justify-between text-muted-foreground">
          <span>Neto gravado</span>
          <span className="font-mono">${totals.impNeto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>IVA</span>
          <span className="font-mono">${totals.impIva.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
        </div>
        <Separator />
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span className="font-mono">${totals.impTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      {submitError && <p className="text-sm text-destructive">{submitError}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={createInvoice.isPending}>
          {createInvoice.isPending ? 'Autorizando...' : 'Autorizar factura'}
        </Button>
        <Link href="/invoices" className={cn(buttonVariants({ variant: 'outline' }))}>
          Cancelar
        </Link>
      </div>
    </form>
  )
}
