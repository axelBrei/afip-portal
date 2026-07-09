'use client'

import { useState } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { DatePicker } from '@/components/ui/date-picker'
import { Trash2, Plus, Download, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ReceptorPicker } from './receptor-picker'

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
  quantity: z.coerce.number().positive('> 0'),
  unitPrice: z.coerce.number().positive('> 0'),
  ivaRateId: z.coerce.number(),
})

const formSchema = z.object({
  tipoCbte: z.coerce.number().int(),
  puntoVenta: z.coerce.number().int().min(1).max(9999),
  docTipo: z.coerce.number().int(),
  docNro: z.coerce.number().int().optional(),
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-4">
      {children}
    </p>
  )
}

type DocumentType = { id: number; desc: string }

export function InvoiceForm() {
  const queryClient = useQueryClient()
  const [receptorName, setReceptorName] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createdInvoice, setCreatedInvoice] = useState<any>(null)

  const { data: docTypesData } = useQuery<{ data: DocumentType[] }>({
    queryKey: ['document-types'],
    queryFn: () => fetch('/api/v1/invoices/document-types').then((r) => r.json()),
    staleTime: Infinity,
  })
  const docTypes = docTypesData?.data ?? []

  const {
    register, control, handleSubmit, watch, setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tipoCbte: 11,
      puntoVenta: 2,
      docTipo: 80,
      docNro: undefined,
      receptorCuit: '',
      fchServDesde: firstDayOfMonthIso(),
      fchServHasta: todayIso(),
      fchVtoPago: thirtyDaysFromNowIso(),
      items: [{ description: 'Honorarios', quantity: 1, unitPrice: 0, ivaRateId: 3 }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchedItems = watch('items')
  const watchedTipoCbte = watch('tipoCbte')
  const watchedDocTipo = watch('docTipo')
  const totals = calcTotals(watchedItems ?? [])

  const isCuit = watchedDocTipo === 80
  const isConsumidorFinal = watchedDocTipo === 99

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
    onSuccess: (invoice) => {
      setCreatedInvoice(invoice)
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (err) => setSubmitError(err instanceof Error ? err.message : 'Error al crear factura'),
  })

  function onSubmit(data: FormData) {
    setSubmitError(null)
    const t = calcTotals(data.items)
    const docNro = (() => {
      if (data.docTipo === 80) {
        const n = parseInt((data.receptorCuit ?? '').replace(/\D/g, ''), 10)
        return Number.isFinite(n) ? n : 0
      }
      if (data.docTipo === 99) return 0
      return data.docNro ?? 0
    })()
    createInvoice.mutate({
      puntoVenta: data.puntoVenta,
      tipoCbte: data.tipoCbte,
      concepto: 2,
      docTipo: data.docTipo,
      docNro,
      receptorCuit: data.docTipo === 80 ? data.receptorCuit : undefined,
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
      <Card className="max-w-md border-border">
        <CardContent className="pt-8 pb-6 px-8 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
            <p className="font-medium">Factura autorizada</p>
          </div>
          <div className="bg-muted rounded-lg px-4 py-3 space-y-1">
            <p className="text-xs text-muted-foreground">CAE</p>
            <p className="font-mono text-sm font-medium">{createdInvoice.cae}</p>
            <p className="text-xs text-muted-foreground">Vence {createdInvoice.caeFchVto}</p>
          </div>
        </CardContent>
        <CardFooter className="px-8 pb-8 gap-3">
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-2xl">

      {/* overflow-visible + z-10: receptor picker dropdown escapes card and paints above sibling cards */}
      <Card className="border-border overflow-visible z-10">
        <CardContent className="px-6 pt-6 pb-6 space-y-5">
          <SectionLabel>Comprobante</SectionLabel>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Tipo</Label>
              <Select
                value={watchedTipoCbte?.toString() ?? '11'}
                onValueChange={(v) => v && setValue('tipoCbte', parseInt(v, 10))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {CBTE_TYPES.find((t) => t.id === watchedTipoCbte)?.label ?? 'Seleccionar'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CBTE_TYPES.map((t) => (
                    <SelectItem key={t.id} value={t.id.toString()}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Punto de venta</Label>
              <Input type="number" {...register('puntoVenta')} />
              {errors.puntoVenta && <p className="text-xs text-destructive">{errors.puntoVenta.message}</p>}
            </div>
          </div>

          <Separator />
          <SectionLabel>Receptor</SectionLabel>

          <div className="sm:flex sm:gap-4">
              <div className="space-y-1.5 sm:flex-none sm:w-40">
                <Label className="text-sm text-muted-foreground">Tipo de documento</Label>
                <Select
                  value={watchedDocTipo?.toString() ?? '99'}
                  onValueChange={(v) => {
                    if (!v) return
                    setValue('docTipo', parseInt(v, 10))
                    setValue('receptorCuit', '')
                    setValue('docNro', undefined)
                    setReceptorName(null)
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {docTypes.find((d) => d.id === watchedDocTipo)?.desc ?? 'Sin identificar'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {docTypes.length > 0
                      ? docTypes.map((d) => (
                          <SelectItem key={d.id} value={d.id.toString()}>{d.desc}</SelectItem>
                        ))
                      : (
                          <>
                            <SelectItem value="80">CUIT</SelectItem>
                            <SelectItem value="96">DNI</SelectItem>
                            <SelectItem value="99">Sin identificar</SelectItem>
                          </>
                        )}
                  </SelectContent>
                </Select>
              </div>

              {!isCuit && (
                <div className="space-y-1.5 mt-4 sm:mt-0 sm:flex-1">
                  <Label className="text-sm text-muted-foreground">Número de documento</Label>
                  <Input
                    type="number"
                    placeholder="Ej: 12345678"
                    {...register('docNro')}
                  />
                  {errors.docNro && <p className="text-xs text-destructive">{errors.docNro.message}</p>}
                </div>
              )}

              {isCuit && (
                <div className="space-y-1.5 mt-4 sm:mt-0 sm:flex-1">
                  <Label className="text-sm text-muted-foreground">Empresa o persona</Label>
                  <ReceptorPicker
                    onSelect={(cuit, name, tipoPersona, tipoClave) => {
                      setValue('receptorCuit', cuit)
                      setReceptorName(name)
                      if (tipoPersona === 'JURIDICA' || tipoClave === 'CUIT') {
                        setValue('docTipo', 80)
                        setValue('docNro', parseInt(cuit.replace(/\D/g, ''), 10))
                      } else if (tipoPersona === 'FISICA') {
                        setValue('docTipo', 86)
                        setValue('docNro', parseInt(cuit.replace(/\D/g, ''), 10))
                      }
                    }}
                    onClear={() => {
                      setValue('receptorCuit', '')
                      setReceptorName(null)
                    }}
                  />
                </div>
              )}
          </div>
        </CardContent>
      </Card>

      {/* Período */}
      <Card className="border-border">
        <CardContent className="px-6 pt-6 pb-6">
          <SectionLabel>Período del servicio</SectionLabel>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Desde</Label>
              <Controller
                control={control}
                name="fchServDesde"
                render={({ field }) => (
                  <DatePicker value={field.value} onChange={field.onChange} />
                )}
              />
              {errors.fchServDesde && <p className="text-xs text-destructive">{errors.fchServDesde.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Hasta</Label>
              <Controller
                control={control}
                name="fchServHasta"
                render={({ field }) => (
                  <DatePicker value={field.value} onChange={field.onChange} />
                )}
              />
              {errors.fchServHasta && <p className="text-xs text-destructive">{errors.fchServHasta.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">Vto. pago</Label>
              <Controller
                control={control}
                name="fchVtoPago"
                render={({ field }) => (
                  <DatePicker value={field.value} onChange={field.onChange} />
                )}
              />
              {errors.fchVtoPago && <p className="text-xs text-destructive">{errors.fchVtoPago.message}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ítems */}
      <Card className="border-border">
        <CardContent className="px-6 pt-6 pb-6 space-y-3">
          <SectionLabel>Ítems</SectionLabel>

          <div className="grid grid-cols-12 gap-2 px-1">
            <span className="col-span-5 text-xs text-muted-foreground">Descripción</span>
            <span className="col-span-2 text-xs text-muted-foreground">Cantidad</span>
            <span className="col-span-2 text-xs text-muted-foreground">Precio unit.</span>
            <span className="col-span-2 text-xs text-muted-foreground">IVA</span>
          </div>

          <div className="space-y-2">
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
                      <SelectTrigger>
                        <SelectValue>
                          {IVA_RATES.find((r) => r.id === ivaRateId)?.label ?? '0%'}
                        </SelectValue>
                      </SelectTrigger>
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
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {errors.items && <p className="text-xs text-destructive">{errors.items.message}</p>}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground -ml-1"
            onClick={() => append({ description: '', quantity: 1, unitPrice: 0, ivaRateId: 3 })}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Agregar ítem
          </Button>

          <Separator className="my-2" />

          <div className="space-y-2 ml-auto max-w-[260px]">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Neto gravado</span>
              <span className="font-mono">${totals.impNeto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">IVA</span>
              <span className="font-mono">${totals.impIva.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm font-semibold pt-0.5">
              <span>Total</span>
              <span className="font-mono">${totals.impTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {submitError && (
        <p className="text-sm text-destructive px-1">{submitError}</p>
      )}

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={createInvoice.isPending} className="px-8">
          {createInvoice.isPending ? 'Autorizando...' : 'Autorizar factura'}
        </Button>
        <Link href="/invoices" className={cn(buttonVariants({ variant: 'outline' }))}>
          Cancelar
        </Link>
      </div>
    </form>
  )
}
