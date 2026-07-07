import {
  pgTable, uuid, varchar, smallint, integer,
  numeric, date, text, jsonb, timestamp,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const invoices = pgTable('invoices', {
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
  arcaEnv: varchar('arca_env', { length: 10 }).notNull().default('sandbox'),
  pdfUrl: text('pdf_url'),
  rawRequest: jsonb('raw_request').notNull(),
  rawResponse: jsonb('raw_response').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
})

export const padronCache = pgTable('padron_cache', {
  cuit: varchar('cuit', { length: 11 }).primaryKey(),
  data: jsonb('data').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

export type Invoice = typeof invoices.$inferSelect
export type NewInvoice = typeof invoices.$inferInsert
export type PadronCache = typeof padronCache.$inferSelect
