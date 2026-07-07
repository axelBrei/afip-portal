'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FileText, Search, Settings, LogOut } from 'lucide-react'

export function Nav() {
  const router = useRouter()
  const [cuit, setCuit] = useState('')
  const { data: settings } = useQuery<{ activeEnv: string }>({
    queryKey: ['settings'],
    queryFn: () => fetch('/api/v1/settings').then((r) => r.json()),
    staleTime: 30_000,
  })

  async function handleLogout() {
    await fetch('/api/v1/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  function handlePadronSearch(e: React.FormEvent) {
    e.preventDefault()
    const clean = cuit.replace(/\D/g, '')
    if (clean.length === 11) {
      router.push(`/padron/${clean}`)
      setCuit('')
    }
  }

  return (
    <header className="border-b border-border bg-background">
      <div className="container mx-auto flex h-14 items-center gap-3 px-4">
        <Link href="/invoices" className="font-semibold text-sm tracking-tight text-foreground">
          AFIP Portal
        </Link>
        {settings?.activeEnv && (
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded border mr-2 ${
            settings.activeEnv === 'production'
              ? 'border-[#5e6ad2]/40 text-[#5e6ad2] bg-[#5e6ad2]/10'
              : 'border-amber-500/40 text-amber-400 bg-amber-500/10'
          }`}>
            {settings.activeEnv === 'production' ? 'PROD' : 'HOMO'}
          </span>
        )}
        <nav className="flex items-center gap-1 flex-1">
          <Link
            href="/invoices"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
          >
            <FileText className="h-4 w-4 mr-1" />
            Facturas
          </Link>
          <Link
            href="/settings"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
          >
            <Settings className="h-4 w-4 mr-1" />
            Configuración
          </Link>
        </nav>
        <form onSubmit={handlePadronSearch} className="flex items-center gap-2">
          <Input
            placeholder="Buscar CUIT (11 dígitos)"
            value={cuit}
            onChange={(e) => setCuit(e.target.value)}
            className="w-52 h-8 text-sm"
          />
          <Button type="submit" size="sm" variant="outline">
            <Search className="h-4 w-4" />
          </Button>
        </form>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
