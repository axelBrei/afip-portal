import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { SettingsForm } from '@/components/settings/settings-form'

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Configuración</h1>
      <Suspense fallback={<Skeleton className="h-64 max-w-xl" />}>
        <SettingsForm />
      </Suspense>
    </div>
  )
}
