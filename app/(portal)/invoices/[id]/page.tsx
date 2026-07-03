export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { InvoiceDetail } from '@/components/invoices/invoice-detail'

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="py-4">
      <Suspense fallback={<Skeleton className="h-64 max-w-2xl mx-auto" />}>
        <InvoiceDetail id={params.id} />
      </Suspense>
    </div>
  )
}
