export const dynamic = 'force-dynamic'

import { PadronDetail } from '@/components/padron/padron-detail'

export default function PadronPage({ params }: { params: { cuit: string } }) {
  return (
    <div className="py-4">
      <PadronDetail cuit={params.cuit} />
    </div>
  )
}
