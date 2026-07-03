'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FileText, Search, Settings, LogOut } from 'lucide-react'

export function Nav() {
  const router = useRouter()
  const [cuit, setCuit] = useState('')

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
    <header className="border-b bg-white">
      <div className="container mx-auto flex h-14 items-center gap-4 px-4">
        <Link href="/invoices" className="font-semibold text-lg mr-4">
          AFIP Portal
        </Link>
        <nav className="flex items-center gap-2 flex-1">
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
