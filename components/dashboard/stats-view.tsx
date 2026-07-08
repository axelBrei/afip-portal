'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

type StatsData = {
  year: number
  monthly: { month: number; netRevenue: number; invoiceCount: number }[]
  totals: { netRevenue: number; invoiceCount: number }
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

function StatCard({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-2 text-[1.75rem] font-semibold tracking-tight leading-none ${dim ? 'text-muted-foreground' : 'text-foreground'}`}>
        {value}
      </p>
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

  const totals = data?.totals ?? { netRevenue: 0, invoiceCount: 0 }
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
        />
        <StatCard
          label="Comprobantes emitidos"
          value={isLoading ? '—' : String(totals.invoiceCount)}
        />
        <StatCard
          label="Promedio por factura"
          value={isLoading ? '—' : fmtARS(avg)}
          dim={totals.invoiceCount === 0}
        />
      </div>

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
