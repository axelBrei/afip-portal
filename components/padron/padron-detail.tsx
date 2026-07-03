'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

async function fetchPadron(cuit: string) {
  const res = await fetch(`/api/v1/padron/${cuit}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? 'Error al consultar el padrón')
  }
  return res.json() as Promise<{ data: Record<string, unknown>; cached: boolean }>
}

function renderValue(value: unknown, depth = 0): React.ReactNode {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>
  if (typeof value === 'object' && !Array.isArray(value)) {
    return (
      <div className={depth > 0 ? 'ml-4 mt-1' : ''}>
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="grid grid-cols-2 gap-2 py-0.5">
            <span className="text-muted-foreground capitalize">{k}</span>
            <span>{renderValue(v, depth + 1)}</span>
          </div>
        ))}
      </div>
    )
  }
  if (Array.isArray(value)) {
    return <span>{value.join(', ')}</span>
  }
  return <span>{String(value)}</span>
}

export function PadronDetail({ cuit }: { cuit: string }) {
  const { data } = useSuspenseQuery({
    queryKey: ['padron', cuit],
    queryFn: () => fetchPadron(cuit),
  })

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>CUIT {cuit}</CardTitle>
        {data.cached && <Badge variant="secondary">Caché</Badge>}
      </CardHeader>
      <CardContent className="text-sm">
        {renderValue(data.data)}
      </CardContent>
    </Card>
  )
}
