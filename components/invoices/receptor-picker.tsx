'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { X, Loader2 } from 'lucide-react'

type Entry = { cuit: string; name: string; tipoPersona?: string | null }

interface Props {
  onSelect: (cuit: string, name: string | null, tipoPersona?: string | null) => void
  onClear: () => void
}

function extractName(data: unknown): string {
  const d = data as Record<string, unknown>
  const dg = (d?.datosGenerales ?? d) as Record<string, unknown>
  return (
    (dg?.razonSocial as string) ||
    [(dg?.nombre as string), (dg?.apellido as string)].filter(Boolean).join(' ') ||
    ((d?.persona as Record<string, unknown>)?.denominacion as string) ||
    ''
  )
}

function extractTipoPersona(data: unknown): string | null {
  const d = data as Record<string, unknown>
  const dg = (d?.datosGenerales ?? d) as Record<string, unknown>
  return (dg?.tipoPersona as string) || null
}

export function ReceptorPicker({ onSelect, onClear }: Props) {
  const [input, setInput] = useState('')
  const [selected, setSelected] = useState<Entry | null>(null)
  const [open, setOpen] = useState(false)
  const [fetching, setFetching] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  // Stable refs for callbacks to avoid stale closures
  const cbRef = useRef({ onSelect, onClear })
  cbRef.current = { onSelect, onClear }
  const attempted = useRef(new Set<string>())

  const { data } = useQuery<{ data: Entry[] }>({
    queryKey: ['padron-list'],
    queryFn: () => fetch('/api/v1/padron').then((r) => r.json()),
    staleTime: 60_000,
  })
  const entries = data?.data ?? []

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Auto-fetch from ARCA when 11 digits entered and not in local cache
  const digits = input.replace(/\D/g, '')
  useEffect(() => {
    if (digits.length !== 11 || selected || !data || attempted.current.has(digits)) return
    const found = entries.find((e) => e.cuit === digits)
    if (found) {
      setSelected(found)
      setInput(found.name || found.cuit)
      setOpen(false)
      cbRef.current.onSelect(found.cuit, found.name || null, found.tipoPersona)
      return
    }
    attempted.current.add(digits)
    setFetching(true)
    fetch(`/api/v1/padron/${digits}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!body) return
        const name = extractName(body.data)
        const tipoPersona = extractTipoPersona(body.data)
        const entry: Entry = { cuit: digits, name, tipoPersona }
        setSelected(entry)
        setInput(name || digits)
        setOpen(false)
        cbRef.current.onSelect(digits, name || null, tipoPersona)
      })
      .finally(() => setFetching(false))
  }, [digits, entries, selected, data])

  const filtered = entries.filter(
    (e) =>
      e.cuit.includes(input) ||
      e.name.toLowerCase().includes(input.toLowerCase())
  )

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInput(e.target.value)
    setSelected(null)
    setOpen(true)
    attempted.current.clear()
  }

  function handleSelect(entry: Entry) {
    setSelected(entry)
    setInput(entry.name || entry.cuit)
    setOpen(false)
    cbRef.current.onSelect(entry.cuit, entry.name || null, entry.tipoPersona)
  }

  function handleClear() {
    setSelected(null)
    setInput('')
    attempted.current.clear()
    cbRef.current.onClear()
  }

  const showDropdown = open && !selected && input.length > 0

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          value={input}
          onChange={handleChange}
          onFocus={() => { if (!selected) setOpen(true) }}
          placeholder="Razón social o CUIT (11 dígitos)"
          className="pr-8"
        />
        {fetching && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground pointer-events-none" />
        )}
        {selected && !fetching && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {selected && (
        <p className="text-xs text-muted-foreground mt-1 font-mono">{selected.cuit}</p>
      )}

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-background shadow-lg max-h-56 overflow-y-auto">
          {filtered.length > 0 ? (
            filtered.slice(0, 8).map((entry) => (
              <button
                key={entry.cuit}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(entry) }}
                className="w-full text-left px-4 py-2.5 hover:bg-muted/60 transition-colors border-b border-border/50 last:border-0"
              >
                <p className="text-sm font-medium leading-tight">{entry.name || entry.cuit}</p>
                <p className="text-xs text-muted-foreground font-mono">{entry.cuit}</p>
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              {digits.length === 11
                ? 'Buscando en ARCA...'
                : 'Sin resultados — ingresá el CUIT completo (11 dígitos) para buscar'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
