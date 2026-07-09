'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FileText, Search, Settings, LogOut, Users, Menu, X, LayoutDashboard } from 'lucide-react'

type Settings = { activeEnv: string }

export function Nav() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [cuit, setCuit] = useState('')
  const [switching, setSwitching] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const { data: settings } = useQuery<Settings>({
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
      setMobileOpen(false)
    }
  }

  async function handleEnvChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const env = e.target.value
    setSwitching(true)
    try {
      await fetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env }),
      })
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      await queryClient.invalidateQueries({ queryKey: ['invoices'] })
      await queryClient.invalidateQueries({ queryKey: ['stats'] })
    } finally {
      setSwitching(false)
    }
  }

  const isProd = settings?.activeEnv === 'production'

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const envBadge = settings?.activeEnv && (
    <div className="relative">
      <select
        value={settings.activeEnv}
        onChange={handleEnvChange}
        disabled={switching}
        className={cn(
          'appearance-none cursor-pointer text-[10px] font-semibold px-2 py-0.5 rounded border pr-5',
          'bg-transparent outline-none transition-opacity',
          'disabled:opacity-50',
          isProd
            ? 'border-[#5e6ad2]/40 text-[#5e6ad2] bg-[#5e6ad2]/10'
            : 'border-amber-500/40 text-amber-400 bg-amber-500/10'
        )}
      >
        <option value="sandbox">HOMO</option>
        <option value="production">PROD</option>
      </select>
      <span className={cn(
        'pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[8px]',
        isProd ? 'text-[#5e6ad2]' : 'text-amber-400'
      )}>▾</span>
    </div>
  )

  return (
    <header className="border-b border-border bg-background">
      {/* Main bar */}
      <div className="container mx-auto flex h-14 items-center gap-3 px-4">
        <Link href="/dashboard" className="font-semibold text-sm tracking-tight text-foreground shrink-0">
          AFIP Portal
        </Link>

        {envBadge}

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1 flex-1">
          <Link href="/dashboard" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            <LayoutDashboard className="h-4 w-4 mr-1" />
            Dashboard
          </Link>
          <Link href="/invoices" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            <FileText className="h-4 w-4 mr-1" />
            Facturas
          </Link>
          <Link href="/padron" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            <Users className="h-4 w-4 mr-1" />
            Padrón
          </Link>
          <Link href="/settings" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            <Settings className="h-4 w-4 mr-1" />
            Configuración
          </Link>
        </nav>

        {/* Desktop search + logout */}
        <form onSubmit={handlePadronSearch} className="hidden sm:flex items-center gap-2">
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
        <Button variant="ghost" size="sm" onClick={handleLogout} className="hidden sm:flex">
          <LogOut className="h-4 w-4" />
        </Button>

        {/* Mobile hamburger */}
        <div className="flex-1 sm:hidden" />
        <Button
          variant="ghost"
          size="sm"
          className="sm:hidden"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Menú"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile drawer backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 sm:hidden transition-opacity duration-200',
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      {/* Mobile drawer panel */}
      <div
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-72 bg-background border-r border-border sm:hidden',
          'flex flex-col transition-transform duration-200 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
          <Link
            href="/invoices"
            onClick={() => setMobileOpen(false)}
            className="font-semibold text-sm tracking-tight text-foreground"
          >
            AFIP Portal
          </Link>
          <Button variant="ghost" size="sm" onClick={() => setMobileOpen(false)} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Drawer body */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          <form onSubmit={handlePadronSearch} className="flex items-center gap-2">
            <Input
              placeholder="Buscar CUIT (11 dígitos)"
              value={cuit}
              onChange={(e) => setCuit(e.target.value)}
              className="flex-1 h-9 text-sm"
            />
            <Button type="submit" size="sm" variant="outline">
              <Search className="h-4 w-4" />
            </Button>
          </form>

          <nav className="flex flex-col gap-1">
            <Link
              href="/dashboard"
              onClick={() => setMobileOpen(false)}
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'justify-start')}
            >
              <LayoutDashboard className="h-4 w-4 mr-2" />
              Dashboard
            </Link>
            <Link
              href="/invoices"
              onClick={() => setMobileOpen(false)}
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'justify-start')}
            >
              <FileText className="h-4 w-4 mr-2" />
              Facturas
            </Link>
            <Link
              href="/padron"
              onClick={() => setMobileOpen(false)}
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'justify-start')}
            >
              <Users className="h-4 w-4 mr-2" />
              Padrón
            </Link>
            <Link
              href="/settings"
              onClick={() => setMobileOpen(false)}
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'justify-start')}
            >
              <Settings className="h-4 w-4 mr-2" />
              Configuración
            </Link>
          </nav>
        </div>

        {/* Drawer footer */}
        <div className="px-3 py-4 border-t border-border shrink-0">
          <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full justify-start">
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar sesión
          </Button>
        </div>
      </div>
    </header>
  )
}
