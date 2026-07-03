import { InvoiceForm } from '@/components/invoices/invoice-form'

export default function NewInvoicePage() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Nueva factura</h1>
      <InvoiceForm />
    </div>
  )
}
