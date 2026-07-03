import { Suspense } from 'react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { InvoiceList } from '@/components/invoices/invoice-list'

function InvoiceListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

export default function InvoicesPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Facturas</h1>
        <Link href="/invoices/new" className={buttonVariants()}>
          Nueva factura
        </Link>
      </div>
      <Suspense fallback={<InvoiceListSkeleton />}>
        <InvoiceList />
      </Suspense>
    </div>
  )
}
