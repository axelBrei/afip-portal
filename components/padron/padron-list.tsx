'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Search, Users } from 'lucide-react'

type PadronEntry = {
  cuit: string
  name: string
  fetchedAt: string
  expiresAt: string
}

export function PadronList() {
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery<{ data: PadronEntry[] }>({
    queryKey: ['padron-list'],
    queryFn: () => fetch('/api/v1/padron').then((r) => r.json()),
  })

  const entries = data?.data ?? []
  const filtered = search
    ? entries.filter(
        (e) =>
          e.cuit.includes(search) ||
          e.name.toLowerCase().includes(search.toLowerCase())
      )
    : entries

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Cargando...</p>
  }

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9"
          placeholder="Filtrar por nombre o CUIT"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <Users className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {entries.length === 0
                ? 'No hay consultas de padrón guardadas. Buscá un CUIT desde el nav.'
                : 'Sin resultados para tu búsqueda.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border overflow-hidden">
          <div className="divide-y divide-border">
            {filtered.map((entry) => (
              <Link
                key={entry.cuit}
                href={`/padron/${entry.cuit}`}
                className="flex items-center justify-between px-6 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{entry.name || '—'}</p>
                  <p className="text-xs text-muted-foreground font-mono">{entry.cuit}</p>
                </div>
                <p className="text-xs text-muted-foreground shrink-0 ml-4">
                  {new Date(entry.fetchedAt).toLocaleDateString('es-AR')}
                </p>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
