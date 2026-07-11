'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Info } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

type StatsData = {
  year: number
  monthly: { month: number; netRevenue: number; invoiceCount: number }[]
  totals: {
    netRevenue: number
    invoiceCount: number
    grossRevenue: number
    creditNoteCount: number
    creditNoteTotal: number
  }
  myCategory: string | null
  categoryLimit: { ingresosBrutos: number; cuotaMensual: number } | null
}

async function fetchStats(year: number): Promise<StatsData> {
  const res = await fetch(`/api/v1/stats?year=${year}`)
  if (!res.ok) throw new Error('Failed to fetch stats')
  return res.json()
}

function fmtARS(n: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtCompact(n: number) {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
  return `$${n.toFixed(0)}`
}

function StatCard({ label, value, dim, tooltip }: { label: string; value: string; dim?: boolean; tooltip?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        {tooltip && (
          <div className="relative group/tip">
            <Info className="h-3 w-3 text-muted-foreground/60 cursor-help" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg border border-border bg-card p-2.5 text-xs text-muted-foreground opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity z-50 shadow-md">
              {tooltip}
            </div>
          </div>
        )}
      </div>
      <p className={`mt-2 text-[1.75rem] font-semibold tracking-tight leading-none ${dim ? 'text-muted-foreground' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  )
}

function MonotributoLimitCard({
  category,
  limit,
  netRevenue,
}: {
  category: string | null
  limit: { ingresosBrutos: number; cuotaMensual: number } | null
  netRevenue: number
}) {
  if (!category || !limit) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Límite Monotributo
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          {!category
            ? 'No se encontró categoría en el padrón. Consultá el padrón con tu CUIT para obtener los datos.'
            : 'Actualizá los límites desde Configuración para ver el progreso.'}
        </p>
      </div>
    )
  }

  const pct = Math.min((netRevenue / limit.ingresosBrutos) * 100, 100)
  const remaining = Math.max(limit.ingresosBrutos - netRevenue, 0)

  const barColor =
    pct >= 95 ? '#ef4444' :
    pct >= 80 ? '#f59e0b' :
    '#5e6ad2'

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Límite Monotributo
        </p>
        <span className="text-xs font-semibold px-2 py-0.5 rounded border border-border text-foreground">
          Cat. {category}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[1.75rem] font-semibold tracking-tight leading-none text-foreground">
              {fmtARS(netRevenue)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              de {fmtARS(limit.ingresosBrutos)} anuales
            </p>
          </div>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: barColor }}>
            {pct.toFixed(1)}%
          </p>
        </div>

        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: barColor }}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Restante: {fmtARS(remaining)}
        </p>
      </div>
    </div>
  )
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; payload: { count: number } }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
      <p className="font-medium text-foreground">{label}</p>
      <p className="mt-1 text-[#5e6ad2] font-mono">{fmtARS(d.value ?? 0)}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {d.payload.count} comprobantes
      </p>
    </div>
  )
}

export function StatsView() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)

  const { data, isLoading } = useQuery<StatsData>({
    queryKey: ['stats', year],
    queryFn: () => fetchStats(year),
    staleTime: 60_000,
  })

  const chartData = (data?.monthly ?? Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, netRevenue: 0, invoiceCount: 0,
  }))).map((m) => ({
    name: MONTHS[m.month - 1],
    revenue: m.netRevenue,
    count: m.invoiceCount,
  }))

  const totals = data?.totals ?? { netRevenue: 0, invoiceCount: 0, grossRevenue: 0, creditNoteCount: 0, creditNoteTotal: 0 }
  const avg = totals.invoiceCount > 0 ? totals.netRevenue / totals.invoiceCount : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="appearance-none cursor-pointer text-sm px-3 py-1.5 rounded-md border border-border bg-card text-foreground outline-none focus:ring-2 focus:ring-[#5e6ad2]/50"
        >
          {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Ingresos netos"
          value={isLoading ? '—' : fmtARS(totals.netRevenue)}
          tooltip={
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Facturas / NdD</span>
                <span className="font-mono text-foreground">{fmtARS(totals.grossRevenue)}</span>
              </div>
              <div className="flex justify-between">
                <span>Notas de crédito ({totals.creditNoteCount})</span>
                <span className="font-mono text-destructive">−{fmtARS(totals.creditNoteTotal)}</span>
              </div>
              <div className="border-t border-border pt-1 flex justify-between font-medium text-foreground">
                <span>Total</span>
                <span className="font-mono">{fmtARS(totals.netRevenue)}</span>
              </div>
            </div>
          }
        />
        <StatCard
          label="Comprobantes emitidos"
          value={isLoading ? '—' : String(totals.invoiceCount)}
          tooltip={
            <span>Facturas y notas de débito. Las notas de crédito ({totals.creditNoteCount}) no se cuentan.</span>
          }
        />
        <StatCard
          label="Promedio por factura"
          value={isLoading ? '—' : fmtARS(avg)}
          dim={totals.invoiceCount === 0}
          tooltip={
            <span>Ingresos netos ÷ comprobantes emitidos</span>
          }
        />
      </div>

      {/* Monotributo limit */}
      <MonotributoLimitCard
        category={data?.myCategory ?? null}
        limit={data?.categoryLimit ?? null}
        netRevenue={totals.netRevenue}
      />

      {/* Monthly revenue chart */}
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground mb-5">
          Ingresos mensuales
        </p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="30%">
              <CartesianGrid
                strokeDasharray="0"
                stroke="rgba(255,255,255,0.05)"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{ fill: '#71717a', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={fmtCompact}
                tick={{ fill: '#71717a', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              />
              <Bar
                dataKey="revenue"
                fill="#5e6ad2"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
