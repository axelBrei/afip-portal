import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

console.log('[lib/db] initializing, DATABASE_URL set:', !!process.env.DATABASE_URL)
const client = postgres(process.env.DATABASE_URL!)
export const db = drizzle(client, { schema })
console.log('[lib/db] initialized')
