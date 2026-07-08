import { arcaService } from '@/lib/arca/service'
import { invoicesProduction, invoicesSandbox } from '@/lib/db/schema'

export function getInvoicesTable() {
  return arcaService.getActiveEnv() === 'production' ? invoicesProduction : invoicesSandbox
}
