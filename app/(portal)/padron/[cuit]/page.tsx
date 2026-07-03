import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { PadronDetail } from '@/components/padron/padron-detail'

export default function PadronPage({ params }: { params: { cuit: string } }) {
  return (
    <div className="py-4">
      <Suspense fallback={<Skeleton className="h-64 max-w-2xl mx-auto" />}>
        <PadronDetail cuit={params.cuit} />
      </Suspense>
    </div>
  )
}
