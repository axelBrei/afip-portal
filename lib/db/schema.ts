import {
  pgTable, uuid, varchar, smallint, integer,
  numeric, date, text, jsonb, timestamp, primaryKey,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

function invoiceColumns() {
  return {
    id: uuid('id').defaultRandom().primaryKey(),
    cuit: varchar('cuit', { length: 11 }).notNull(),
    tipoCbte: smallint('tipo_cbte').notNull(),
    puntoVenta: smallint('punto_venta').notNull(),
    nroCbte: integer('nro_cbte').notNull(),
    cae: varchar('cae', { length: 14 }).notNull(),
    caeFchVto: date('cae_fch_vto').notNull(),
    amountNet: numeric('amount_net', { precision: 12, scale: 2 }).notNull(),
    amountIva: numeric('amount_iva', { precision: 12, scale: 2 }).notNull(),
    amountTotal: numeric('amount_total', { precision: 12, scale: 2 }).notNull(),
    receptorCuit: varchar('receptor_cuit', { length: 11 }),
    receptorName: varchar('receptor_name', { length: 255 }),
    creditNoteId: uuid('credit_note_id'),
    originalInvoiceId: uuid('original_invoice_id'),
    pdfUrl: text('pdf_url'),
    rawRequest: jsonb('raw_request').notNull(),
    rawResponse: jsonb('raw_response').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  }
}

// Env-specific tables — each only holds invoices from their respective env
export const invoicesProduction = pgTable('invoices_production', invoiceColumns())
export const invoicesSandbox    = pgTable('invoices_sandbox', invoiceColumns())

// Legacy table kept for historical data — no longer written to by new code
export const invoices = pgTable('invoices', {
  ...invoiceColumns(),
  arcaEnv: varchar('arca_env', { length: 10 }).notNull().default('sandbox'),
})

export const padronCache = pgTable('padron_cache', {
  cuit: varchar('cuit', { length: 11 }).notNull(),
  env:  varchar('env', { length: 10 }).notNull().default('sandbox'),
  data: jsonb('data').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.cuit, t.env] }),
}))

export const monotributoCategories = pgTable('monotributo_categories', {
  categ: varchar('categ', { length: 2 }).primaryKey(),
  ingresosBrutos: numeric('ingresos_brutos', { precision: 14, scale: 2 }).notNull(),
  cuotaMensual: numeric('cuota_mensual', { precision: 14, scale: 2 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
})

export type Invoice                = typeof invoicesProduction.$inferSelect
export type NewInvoice             = typeof invoicesProduction.$inferInsert
export type PadronCache            = typeof padronCache.$inferSelect
export type MonotributoCategory    = typeof monotributoCategories.$inferSelect
