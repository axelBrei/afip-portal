'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'

export function CsvImportButton() {
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleFile(file: File) {
    setLoading(true)
    setResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/v1/invoices/import-csv', { method: 'POST', body: formData })
      const body = await res.json()
      if (!res.ok) {
        setResult(body.error ?? 'Error al importar')
      } else {
        setResult(`${body.imported} importada${body.imported !== 1 ? 's' : ''}${body.skipped ? `, ${body.skipped} omitida${body.skipped !== 1 ? 's' : ''}` : ''}`)
        await queryClient.invalidateQueries({ queryKey: ['invoices'] })
      }
    } catch {
      setResult('Error de red')
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
      <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={loading}>
        <Upload className="h-4 w-4 mr-1.5" />
        {loading ? 'Importando…' : 'Importar CSV'}
      </Button>
      {result && <span className="text-sm text-muted-foreground">{result}</span>}
    </div>
  )
}
