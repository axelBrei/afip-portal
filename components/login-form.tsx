'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const schema = z.object({
  username: z.string().min(1, 'Requerido'),
  password: z.string().min(1, 'Requerido'),
})

type FormData = z.infer<typeof schema>

export function LoginForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    defaultValues: { username: '', password: '' },
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setError(null)
    console.log('[login] submitting', { username: data.username, url: '/api/v1/auth/login' })
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const body = await res.text()
      console.log('[login] response', { status: res.status, body })
      if (res.ok) {
        console.log('[login] success, redirecting to /invoices')
        router.push('/invoices')
        router.refresh()
      } else {
        setError('Usuario o contraseña incorrectos')
      }
    } catch (err) {
      console.error('[login] fetch error', err)
      setError('Error de red')
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold tracking-tight">AFIP Portal</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Usuario</Label>
            <Input id="username" {...register('username')} autoComplete="username" />
            {errors.username && (
              <p className="text-xs text-destructive">{errors.username.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" type="password" {...register('password')} autoComplete="current-password" />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Ingresando...' : 'Ingresar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
