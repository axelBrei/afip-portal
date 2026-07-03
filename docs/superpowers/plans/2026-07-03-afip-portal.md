# AFIP Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js 14 personal ARCA/AFIP portal with WSFE invoicing + padron queries, a strict-CORS REST API, Postgres persistence, and Cloudflare R2 PDF storage.

**Architecture:** Single Next.js 14 App Router service. `middleware.ts` handles CORS and iron-session auth centrally. Route Handlers under `/api/v1/` serve as the REST API. `ArcaService` singleton (server-only) holds the arcasdk client. Drizzle ORM over an external Postgres instance on a shared Docker network. PDFs generated server-side via `@arcasdk/pdf` and stored in Cloudflare R2.

**Tech Stack:** Next.js 14, @arcasdk/core, @arcasdk/pdf, Drizzle ORM + postgres.js, iron-session v8, @aws-sdk/client-s3 + s3-request-presigner, @tanstack/react-query v5, react-hook-form + zod, Shadcn/UI, Tailwind CSS v3, Vitest.

## Global Constraints

- Node.js 20+, Next.js 14 App Router only
- All REST endpoints under `/api/v1/`
- TypeScript strict mode throughout
- All DB access via Drizzle — no raw SQL in application code
- All secrets via environment variables — never hardcoded
- Padron cache TTL: 24 hours
- R2 presigned URL TTL: 900 seconds (15 min)
- PDF generation is synchronous inside POST /api/v1/invoices
- Working directory for all tasks: `/Users/axelbreiterman/afip-portal`
- Docker external network name: `shared-net` (configured per deployment)

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `.env.example`
- Create: `app/globals.css`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`

**Interfaces:**
- Produces: working `npm run dev`, passing `npm run test:run`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "afip-portal",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest",
    "test:run": "vitest run",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "@arcasdk/core": "latest",
    "@arcasdk/pdf": "latest",
    "@aws-sdk/client-s3": "^3",
    "@aws-sdk/s3-request-presigner": "^3",
    "@hookform/resolvers": "^3",
    "@tanstack/react-query": "^5",
    "@tanstack/react-query-devtools": "^5",
    "class-variance-authority": "^0.7",
    "clsx": "^2",
    "drizzle-orm": "^0.38",
    "iron-session": "^8",
    "lucide-react": "^0.400",
    "next": "14",
    "postgres": "^3",
    "react": "^18",
    "react-dom": "^18",
    "react-hook-form": "^7",
    "tailwind-merge": "^2",
    "zod": "^3"
  },
  "devDependencies": {
    "@testing-library/react": "^16",
    "@testing-library/user-event": "^14",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "@vitejs/plugin-react": "^4",
    "autoprefixer": "^10",
    "drizzle-kit": "^0.30",
    "eslint": "^8",
    "eslint-config-next": "14",
    "jsdom": "^25",
    "postcss": "^8",
    "tailwindcss": "^3",
    "typescript": "^5",
    "vitest": "^2"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write next.config.ts**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@arcasdk/core', '@arcasdk/pdf'],
}

export default nextConfig
```

- [ ] **Step 4: Write tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 5: Write postcss.config.js**

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 6: Write vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './') },
  },
})
```

- [ ] **Step 7: Write tests/setup.ts**

```typescript
import { vi } from 'vitest'

process.env.SESSION_SECRET = 'test-secret-that-is-at-least-32-characters-long!!'
process.env.PORTAL_USER = 'admin'
process.env.PORTAL_PASSWORD = 'password'
process.env.ARCA_CUIT = '20111111112'
process.env.ARCA_ENV = 'homologation'
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test'
process.env.R2_ACCOUNT_ID = 'test-account'
process.env.R2_ACCESS_KEY_ID = 'test-key'
process.env.R2_SECRET_ACCESS_KEY = 'test-secret'
process.env.R2_BUCKET = 'test-bucket'
process.env.ALLOWED_ORIGINS = 'http://localhost:3001'
```

- [ ] **Step 8: Write .env.example**

```env
# Auth
PORTAL_USER=admin
PORTAL_PASSWORD=changeme
SESSION_SECRET=generate-with-openssl-rand-base64-32

# ARCA / AFIP
ARCA_CUIT=20111111112
ARCA_CERT_PATH=/path/to/cert.crt
ARCA_KEY_PATH=/path/to/cert.key
ARCA_ENV=production

# Database (external Docker container)
DATABASE_URL=postgres://user:pass@postgres:5432/dbname

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=afip-portal

# CORS (comma-separated allowed origins)
ALLOWED_ORIGINS=http://192.168.1.10:3000
```

- [ ] **Step 9: Write app/globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
```

- [ ] **Step 10: Write app/layout.tsx**

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AFIP Portal',
  description: 'Portal personal ARCA/AFIP',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 11: Write app/page.tsx**

```typescript
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/invoices')
}
```

- [ ] **Step 12: Install dependencies**

```bash
npm install
```

Expected: all packages installed, no errors.

- [ ] **Step 13: Install and init Shadcn**

```bash
npx shadcn@latest init --defaults
npx shadcn@latest add button input label form table badge card skeleton dialog tabs toast sonner separator
```

Expected: `components/ui/` directory created with component files.

- [ ] **Step 14: Write a smoke test and verify it passes**

Create `tests/smoke.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'

describe('project setup', () => {
  it('environment variables are set in test', () => {
    expect(process.env.SESSION_SECRET).toBeDefined()
    expect(process.env.PORTAL_USER).toBe('admin')
  })
})
```

Run: `npm run test:run`
Expected: 1 test passes.

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 14 project with all dependencies"
```

---

### Task 2: Database Schema & Drizzle Setup

**Files:**
- Create: `lib/db/schema.ts`
- Create: `lib/db/index.ts`
- Create: `drizzle.config.ts`
- Test: `tests/lib/db/schema.test.ts`

**Interfaces:**
- Produces: `db` client exported from `@/lib/db`, `invoices` and `padronCache` tables exported from `@/lib/db/schema`
- Produces: `Invoice`, `NewInvoice`, `PadronCache` TypeScript types

- [ ] **Step 1: Write lib/db/schema.ts**

```typescript
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
```

- [ ] **Step 2: Write lib/db/index.ts**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const client = postgres(process.env.DATABASE_URL!)
export const db = drizzle(client, { schema })
```

- [ ] **Step 3: Write drizzle.config.ts**

```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
```

- [ ] **Step 4: Write the test**

Create `tests/lib/db/schema.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { invoices, padronCache } from '@/lib/db/schema'

describe('database schema', () => {
  it('invoices table has required columns', () => {
    const cols = Object.keys(invoices)
    expect(cols).toContain('id')
    expect(cols).toContain('cae')
    expect(cols).toContain('rawRequest')
    expect(cols).toContain('rawResponse')
  })

  it('padronCache table has cuit as primary key', () => {
    const cols = Object.keys(padronCache)
    expect(cols).toContain('cuit')
    expect(cols).toContain('expiresAt')
  })
})
```

- [ ] **Step 5: Run test**

```bash
npm run test:run tests/lib/db/schema.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 6: Generate migrations (requires DATABASE_URL in .env)**

```bash
npm run db:generate
```

Expected: `drizzle/` folder created with SQL migration files.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Drizzle schema for invoices and padron_cache"
```

---

### Task 3: Session Config & Auth Middleware

**Files:**
- Create: `lib/session.ts`
- Create: `middleware.ts`
- Create: `app/api/v1/auth/login/route.ts`
- Create: `app/api/v1/auth/logout/route.ts`
- Test: `tests/lib/session.test.ts`
- Test: `tests/api/auth.test.ts`

**Interfaces:**
- Consumes: `process.env.SESSION_SECRET`, `PORTAL_USER`, `PORTAL_PASSWORD`, `ALLOWED_ORIGINS`
- Produces: `sessionOptions` and `SessionData` from `@/lib/session`
- Produces: `middleware` that gates all routes; login sets cookie, logout clears it

- [ ] **Step 1: Write lib/session.ts**

```typescript
import type { SessionOptions } from 'iron-session'

export interface SessionData {
  user?: { username: string }
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: 'afip-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
  },
}
```

- [ ] **Step 2: Write middleware.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { unsealData } from 'iron-session'
import type { SessionData } from '@/lib/session'

const PUBLIC_PATHS = ['/login', '/api/v1/auth/login', '/api/v1/auth/logout']

function isAllowedOrigin(origin: string | null, requestUrl: string): boolean {
  if (!origin) return true
  const sameOrigin = new URL(requestUrl).origin === origin
  if (sameOrigin) return true
  const allowed = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  return allowed.includes(origin)
}

async function getSession(request: NextRequest): Promise<SessionData | null> {
  const cookie = request.cookies.get('afip-session')?.value
  if (!cookie) return null
  try {
    return await unsealData<SessionData>(cookie, {
      password: process.env.SESSION_SECRET!,
    })
  } catch {
    return null
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const origin = request.headers.get('origin')

  if (pathname.startsWith('/api/')) {
    if (!isAllowedOrigin(origin, request.url)) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin ?? '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '86400',
        },
      })
    }
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
  if (isPublic) {
    const res = NextResponse.next()
    if (pathname.startsWith('/api/') && origin) {
      res.headers.set('Access-Control-Allow-Origin', origin)
      res.headers.set('Access-Control-Allow-Credentials', 'true')
    }
    return res
  }

  const session = await getSession(request)
  if (!session?.user) {
    if (pathname.startsWith('/api/')) {
      return new NextResponse('Unauthorized', { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const res = NextResponse.next()
  if (pathname.startsWith('/api/') && origin) {
    res.headers.set('Access-Control-Allow-Origin', origin)
    res.headers.set('Access-Control-Allow-Credentials', 'true')
  }
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 3: Write app/api/v1/auth/login/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { sessionOptions, type SessionData } from '@/lib/session'
import { z } from 'zod'

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { username, password } = parsed.data
  if (
    username !== process.env.PORTAL_USER ||
    password !== process.env.PORTAL_PASSWORD
  ) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  session.user = { username }
  await session.save()

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Write app/api/v1/auth/logout/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { sessionOptions, type SessionData } from '@/lib/session'

export async function POST(_request: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  session.destroy()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Write tests/lib/session.test.ts**

```typescript
import { describe, it, expect } from 'vitest'
import { sessionOptions } from '@/lib/session'

describe('sessionOptions', () => {
  it('uses the SESSION_SECRET env var', () => {
    expect(sessionOptions.password).toBe(process.env.SESSION_SECRET)
  })

  it('sets httpOnly cookie', () => {
    expect(sessionOptions.cookieOptions?.httpOnly).toBe(true)
  })

  it('uses afip-session cookie name', () => {
    expect(sessionOptions.cookieName).toBe('afip-session')
  })
})
```

- [ ] **Step 6: Write tests/api/auth.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('iron-session', () => ({
  getIronSession: vi.fn(),
  unsealData: vi.fn(),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({})),
}))

import { POST as login } from '@/app/api/v1/auth/login/route'
import { POST as logout } from '@/app/api/v1/auth/logout/route'
import { getIronSession } from 'iron-session'

describe('POST /api/v1/auth/login', () => {
  const mockSave = vi.fn()
  const mockDestroy = vi.fn()
  const mockSession = { user: undefined as unknown, save: mockSave, destroy: mockDestroy }

  beforeEach(() => {
    vi.mocked(getIronSession).mockResolvedValue(mockSession as never)
    mockSave.mockReset()
    mockSession.user = undefined
  })

  it('returns 200 and saves session on valid credentials', async () => {
    const req = new NextRequest('http://localhost/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'password' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await login(req)
    expect(res.status).toBe(200)
    expect(mockSave).toHaveBeenCalledOnce()
    expect(mockSession.user).toEqual({ username: 'admin' })
  })

  it('returns 401 on wrong password', async () => {
    const req = new NextRequest('http://localhost/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await login(req)
    expect(res.status).toBe(401)
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('returns 400 on missing fields', async () => {
    const req = new NextRequest('http://localhost/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await login(req)
    expect(res.status).toBe(400)
  })
})

describe('POST /api/v1/auth/logout', () => {
  beforeEach(() => {
    const mockSession = { destroy: vi.fn(), save: vi.fn() }
    vi.mocked(getIronSession).mockResolvedValue(mockSession as never)
  })

  it('returns 200', async () => {
    const req = new NextRequest('http://localhost/api/v1/auth/logout', { method: 'POST' })
    const res = await logout(req)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 7: Run tests**

```bash
npm run test:run tests/lib/session.test.ts tests/api/auth.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add iron-session auth, middleware CORS+auth, login/logout routes"
```

---

### Task 4: ArcaService Singleton

**Files:**
- Create: `lib/arca/service.ts`
- Test: `tests/lib/arca/service.test.ts`

**Interfaces:**
- Consumes: `ARCA_CUIT`, `ARCA_CERT_PATH`, `ARCA_KEY_PATH` env vars; `/data/certs/cert.crt` and `/data/certs/cert.key` volume paths
- Produces: `arcaService.getClient()` → `Arca` instance; `arcaService.reload()`; `arcaService.getCertStatus()`

- [ ] **Step 1: Write lib/arca/service.ts**

```typescript
import { readFileSync, existsSync } from 'fs'
import { Arca } from '@arcasdk/core'

const VOLUME_CERT = '/data/certs/cert.crt'
const VOLUME_KEY = '/data/certs/cert.key'

function resolveCert(): string {
  if (existsSync(VOLUME_CERT)) return readFileSync(VOLUME_CERT, 'utf-8')
  const p = process.env.ARCA_CERT_PATH
  if (p && existsSync(p)) return readFileSync(p, 'utf-8')
  throw new Error('ARCA certificate not found. Set ARCA_CERT_PATH or upload via settings.')
}

function resolveKey(): string {
  if (existsSync(VOLUME_KEY)) return readFileSync(VOLUME_KEY, 'utf-8')
  const p = process.env.ARCA_KEY_PATH
  if (p && existsSync(p)) return readFileSync(p, 'utf-8')
  throw new Error('ARCA private key not found. Set ARCA_KEY_PATH or upload via settings.')
}

class ArcaServiceSingleton {
  private client: Arca | null = null

  private initialize(): Arca {
    const cert = resolveCert()
    const key = resolveKey()
    const cuit = parseInt(process.env.ARCA_CUIT!, 10)
    this.client = new Arca({ cuit, cert, key })
    return this.client
  }

  getClient(): Arca {
    return this.client ?? this.initialize()
  }

  reload(): void {
    this.client = null
    this.initialize()
  }

  getCertStatus(): { loaded: boolean; source: 'volume' | 'env' | null } {
    if (existsSync(VOLUME_CERT)) return { loaded: true, source: 'volume' }
    const p = process.env.ARCA_CERT_PATH
    if (p && existsSync(p)) return { loaded: true, source: 'env' }
    return { loaded: false, source: null }
  }
}

export const arcaService = new ArcaServiceSingleton()
```

- [ ] **Step 2: Write tests/lib/arca/service.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

vi.mock('@arcasdk/core', () => ({
  Arca: vi.fn().mockImplementation(() => ({ electronicBillingService: {} })),
}))

import { existsSync, readFileSync } from 'fs'
import { Arca } from '@arcasdk/core'

describe('ArcaService', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(readFileSync).mockReturnValue('mock-content')
    process.env.ARCA_CERT_PATH = '/fake/cert.crt'
    process.env.ARCA_KEY_PATH = '/fake/cert.key'
  })

  it('throws when no cert is found', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const { arcaService } = await import('@/lib/arca/service')
    expect(() => arcaService.getClient()).toThrow('ARCA certificate not found')
  })

  it('initializes Arca with cert from env path', async () => {
    vi.mocked(existsSync).mockImplementation((p) =>
      p === '/fake/cert.crt' || p === '/fake/cert.key'
    )
    const { arcaService } = await import('@/lib/arca/service')
    const client = arcaService.getClient()
    expect(Arca).toHaveBeenCalledWith({
      cuit: 20111111112,
      cert: 'mock-content',
      key: 'mock-content',
    })
    expect(client).toBeDefined()
  })

  it('returns same instance on repeated getClient() calls', async () => {
    vi.mocked(existsSync).mockImplementation((p) =>
      p === '/fake/cert.crt' || p === '/fake/cert.key'
    )
    const { arcaService } = await import('@/lib/arca/service')
    const a = arcaService.getClient()
    const b = arcaService.getClient()
    expect(a).toBe(b)
    expect(Arca).toHaveBeenCalledTimes(1)
  })

  it('getCertStatus returns loaded:false when no cert', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const { arcaService } = await import('@/lib/arca/service')
    expect(arcaService.getCertStatus()).toEqual({ loaded: false, source: null })
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npm run test:run tests/lib/arca/service.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/arca/service.ts tests/lib/arca/service.test.ts
git commit -m "feat: add ArcaService singleton with lazy init and cert resolution"
```

---

### Task 5: R2 Client

**Files:**
- Create: `lib/r2/client.ts`
- Test: `tests/lib/r2/client.test.ts`

**Interfaces:**
- Consumes: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
- Produces: `uploadPdf(key: string, buffer: Buffer): Promise<void>`
- Produces: `getPresignedUrl(key: string, expiresIn?: number): Promise<string>`

- [ ] **Step 1: Write lib/r2/client.ts**

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export async function uploadPdf(key: string, buffer: Buffer): Promise<void> {
  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: 'application/pdf',
    })
  )
}

export async function getPresignedUrl(key: string, expiresIn = 900): Promise<string> {
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key }),
    { expiresIn }
  )
}
```

- [ ] **Step 2: Write tests/lib/r2/client.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSend = vi.fn().mockResolvedValue({})
const mockGetSignedUrl = vi.fn().mockResolvedValue('https://r2.example.com/signed-url')

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
}))

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}))

import { uploadPdf, getPresignedUrl } from '@/lib/r2/client'

describe('R2 client', () => {
  beforeEach(() => {
    mockSend.mockReset().mockResolvedValue({})
    mockGetSignedUrl.mockReset().mockResolvedValue('https://r2.example.com/signed-url')
  })

  it('uploadPdf calls S3Client.send with PutObjectCommand', async () => {
    const buf = Buffer.from('pdf-content')
    await uploadPdf('invoices/20111111112/2026/uuid.pdf', buf)
    expect(mockSend).toHaveBeenCalledOnce()
  })

  it('getPresignedUrl returns a signed URL string', async () => {
    const url = await getPresignedUrl('invoices/20111111112/2026/uuid.pdf')
    expect(url).toBe('https://r2.example.com/signed-url')
    expect(mockGetSignedUrl).toHaveBeenCalledOnce()
  })

  it('getPresignedUrl uses 900s TTL by default', async () => {
    await getPresignedUrl('some/key.pdf')
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { expiresIn: 900 }
    )
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npm run test:run tests/lib/r2/client.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/r2/client.ts tests/lib/r2/client.test.ts
git commit -m "feat: add R2 client for PDF upload and presigned URL generation"
```

---

### Task 6: Padron API Route

**Files:**
- Create: `app/api/v1/padron/[cuit]/route.ts`
- Test: `tests/api/padron.test.ts`

**Interfaces:**
- Consumes: `arcaService.getClient()`, `db` from `@/lib/db`, `padronCache` schema
- Produces: `GET /api/v1/padron/:cuit` → `{ data: TaxpayerDetails, cached: boolean }`

- [ ] **Step 1: Write app/api/v1/padron/[cuit]/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { padronCache } from '@/lib/db/schema'
import { arcaService } from '@/lib/arca/service'
import { eq } from 'drizzle-orm'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

const VALID_SCOPES = ['4', '5', '10', '13'] as const
type Scope = (typeof VALID_SCOPES)[number]

function getService(arca: ReturnType<typeof arcaService.getClient>, scope: Scope) {
  const map = {
    '4': arca.registerScopeFourService,
    '5': arca.registerScopeFiveService,
    '10': arca.registerScopeTenService,
    '13': arca.registerScopeThirteenService,
  } as const
  return map[scope]
}

export async function GET(
  request: NextRequest,
  { params }: { params: { cuit: string } }
) {
  const { cuit } = params
  if (!/^\d{11}$/.test(cuit)) {
    return NextResponse.json({ error: 'CUIT must be 11 digits' }, { status: 400 })
  }

  const scope = (request.nextUrl.searchParams.get('scope') ?? '10') as Scope
  if (!VALID_SCOPES.includes(scope)) {
    return NextResponse.json({ error: `scope must be one of ${VALID_SCOPES.join(', ')}` }, { status: 400 })
  }

  const cached = await db
    .select()
    .from(padronCache)
    .where(eq(padronCache.cuit, cuit))
    .limit(1)

  if (cached[0] && new Date(cached[0].expiresAt) > new Date()) {
    return NextResponse.json({ data: cached[0].data, cached: true })
  }

  const arca = arcaService.getClient()
  const service = getService(arca, scope)
  const taxpayer = await service.getTaxpayerDetails(parseInt(cuit, 10))

  if (!taxpayer) {
    return NextResponse.json({ error: 'Taxpayer not found' }, { status: 404 })
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + CACHE_TTL_MS)

  await db
    .insert(padronCache)
    .values({ cuit, data: taxpayer, fetchedAt: now, expiresAt })
    .onConflictDoUpdate({
      target: padronCache.cuit,
      set: { data: taxpayer, fetchedAt: now, expiresAt },
    })

  return NextResponse.json({ data: taxpayer, cached: false })
}
```

- [ ] **Step 2: Write tests/api/padron.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockDb = {
  select: mockSelect,
  insert: mockInsert,
}

vi.mock('@/lib/db', () => ({ db: mockDb }))

const mockGetTaxpayerDetails = vi.fn()
const mockArcaClient = {
  registerScopeTenService: { getTaxpayerDetails: mockGetTaxpayerDetails },
  registerScopeFourService: { getTaxpayerDetails: mockGetTaxpayerDetails },
  registerScopeFiveService: { getTaxpayerDetails: mockGetTaxpayerDetails },
  registerScopeThirteenService: { getTaxpayerDetails: mockGetTaxpayerDetails },
}
vi.mock('@/lib/arca/service', () => ({
  arcaService: { getClient: vi.fn(() => mockArcaClient) },
}))

import { GET } from '@/app/api/v1/padron/[cuit]/route'

const FAKE_TAXPAYER = { persona: { idPersona: 20111111112, tipoPersona: 'FISICA' } }
const FUTURE = new Date(Date.now() + 1000 * 60 * 60).toISOString()

describe('GET /api/v1/padron/:cuit', () => {
  beforeEach(() => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    })
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue([]),
      }),
    })
    mockGetTaxpayerDetails.mockResolvedValue(FAKE_TAXPAYER)
  })

  it('returns 400 for invalid CUIT', async () => {
    const req = new NextRequest('http://localhost/api/v1/padron/123')
    const res = await GET(req, { params: { cuit: '123' } })
    expect(res.status).toBe(400)
  })

  it('returns cached data when cache is fresh', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            { cuit: '20111111112', data: FAKE_TAXPAYER, expiresAt: FUTURE },
          ]),
        }),
      }),
    })
    const req = new NextRequest('http://localhost/api/v1/padron/20111111112')
    const res = await GET(req, { params: { cuit: '20111111112' } })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.cached).toBe(true)
    expect(mockGetTaxpayerDetails).not.toHaveBeenCalled()
  })

  it('calls ARCA and caches when no cache', async () => {
    const req = new NextRequest('http://localhost/api/v1/padron/20111111112')
    const res = await GET(req, { params: { cuit: '20111111112' } })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.cached).toBe(false)
    expect(mockGetTaxpayerDetails).toHaveBeenCalledWith(20111111112)
  })

  it('returns 404 when ARCA returns null', async () => {
    mockGetTaxpayerDetails.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/v1/padron/20111111112')
    const res = await GET(req, { params: { cuit: '20111111112' } })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npm run test:run tests/api/padron.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/padron tests/api/padron.test.ts
git commit -m "feat: add padron API route with 24h DB cache"
```

---

### Task 7: Invoices API Routes

**Files:**
- Create: `app/api/v1/invoices/route.ts`
- Create: `app/api/v1/invoices/[id]/route.ts`
- Create: `app/api/v1/invoices/[id]/pdf/route.ts`
- Test: `tests/api/invoices.test.ts`

**Interfaces:**
- Consumes: `arcaService.getClient()`, `db`, `invoices` schema, `uploadPdf`, `getPresignedUrl`
- Produces:
  - `GET /api/v1/invoices` → `{ data: Invoice[], page: number, limit: number }`
  - `POST /api/v1/invoices` → `Invoice` (201)
  - `GET /api/v1/invoices/:id` → `Invoice`
  - `GET /api/v1/invoices/:id/pdf` → 302 redirect to presigned URL

- [ ] **Step 1: Write app/api/v1/invoices/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { arcaService } from '@/lib/arca/service'
import { uploadPdf } from '@/lib/r2/client'
import { InvoicePdfGenerator } from '@arcasdk/pdf'
import { z } from 'zod'
import { desc } from 'drizzle-orm'
import { randomUUID } from 'crypto'

const ivaItemSchema = z.object({
  Id: z.number().int(),
  BaseImp: z.number(),
  Importe: z.number(),
})

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
  ivaRate: z.number(),
})

const createSchema = z.object({
  puntoVenta: z.number().int().min(1).max(9999),
  tipoCbte: z.number().int().min(1),
  concepto: z.number().int().min(1).max(3),
  docTipo: z.number().int(),
  docNro: z.number().int(),
  receptorCuit: z.string().length(11).optional(),
  receptorName: z.string().max(255).optional(),
  impNeto: z.number().nonnegative(),
  impIva: z.number().nonnegative(),
  impTotal: z.number().positive(),
  monId: z.string().default('PES'),
  monCotiz: z.number().default(1),
  iva: z.array(ivaItemSchema),
  items: z.array(lineItemSchema).min(1),
  fchServDesde: z.string().optional(),
  fchServHasta: z.string().optional(),
  fchVtoPago: z.string().optional(),
})

function toArcaDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

function caeDateToIso(arcaDate: string): string {
  return `${arcaDate.slice(0, 4)}-${arcaDate.slice(4, 6)}-${arcaDate.slice(6, 8)}`
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
  const offset = (page - 1) * limit

  const rows = await db
    .select()
    .from(invoices)
    .orderBy(desc(invoices.createdAt))
    .limit(limit)
    .offset(offset)

  return NextResponse.json({ data: rows, page, limit })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const data = parsed.data
  const arca = arcaService.getClient()
  const today = toArcaDate(new Date())

  const voucherPayload = {
    CantReg: 1,
    PtoVta: data.puntoVenta,
    CbteTipo: data.tipoCbte,
    Concepto: data.concepto,
    DocTipo: data.docTipo,
    DocNro: data.docNro,
    CbteFch: today,
    ImpTotal: data.impTotal,
    ImpNeto: data.impNeto,
    ImpIVA: data.impIva,
    ImpTrib: 0,      // WSFE field is ImpTrib, not ImpTributos
    ImpOpEx: 0,
    MonId: data.monId,
    MonCotiz: data.monCotiz,
    Iva: data.iva,
    ...(data.concepto !== 1 && {
      FchServDesde: data.fchServDesde ?? today,
      FchServHasta: data.fchServHasta ?? today,
      FchVtoPago: data.fchVtoPago ?? today,
    }),
  }

  // createNextVoucher auto-assigns the next invoice number — verify method name
  // against installed @arcasdk/core types (alias may be createInvoice or createVoucher)
  const result = await arca.electronicBillingService.createNextVoucher(voucherPayload)

  if (result.Resultado !== 'A') {
    return NextResponse.json(
      { error: 'ARCA rejected the invoice', details: result },
      { status: 422 }
    )
  }

  // CbteDesde is assigned by ARCA in the response — verify field path against
  // @arcasdk/core CreateVoucherResultDto (may be nested under FECAEDetResponse)
  const nroCbte = result.CbteDesde ?? result.CbteHasta

  const cbteLetra = data.tipoCbte <= 3 ? 'A' : data.tipoCbte <= 8 ? 'B' : 'C'
  const pdfGen = new InvoicePdfGenerator({ includeQr: true })
  const pdfBuffer = await pdfGen.generate({
    emisor: { cuit: parseInt(process.env.ARCA_CUIT!, 10) },
    receptor: {
      cuit: data.receptorCuit ? parseInt(data.receptorCuit, 10) : 0,
      name: data.receptorName ?? '',
    },
    cbteTipo: data.tipoCbte,
    cbteLetra,
    puntoVenta: data.puntoVenta,
    cbteDesde: nroCbte,
    cbteFecha: today,
    concepto: data.concepto,
    items: data.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    importeNetoGravado: data.impNeto,
    importeIva: data.impIva,
    importeTotal: data.impTotal,
    cae: result.CAE!,
    caeFechaVencimiento: result.CAEFchVto!,
  })

  const id = randomUUID()
  const year = new Date().getFullYear()
  const pdfKey = `invoices/${process.env.ARCA_CUIT}/${year}/${id}.pdf`
  await uploadPdf(pdfKey, pdfBuffer)

  const [invoice] = await db
    .insert(invoices)
    .values({
      id,
      cuit: process.env.ARCA_CUIT!,
      tipoCbte: data.tipoCbte,
      puntoVenta: data.puntoVenta,
      nroCbte,
      cae: result.CAE!,
      caeFchVto: caeDateToIso(result.CAEFchVto!),
      amountNet: data.impNeto.toString(),
      amountIva: data.impIva.toString(),
      amountTotal: data.impTotal.toString(),
      receptorCuit: data.receptorCuit,
      receptorName: data.receptorName,
      pdfUrl: pdfKey,
      rawRequest: voucherPayload,
      rawResponse: result,
    })
    .returning()

  return NextResponse.json(invoice, { status: 201 })
}
```

- [ ] **Step 2: Write app/api/v1/invoices/[id]/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const rows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, params.id))
    .limit(1)

  if (!rows[0]) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(rows[0])
}
```

- [ ] **Step 3: Write app/api/v1/invoices/[id]/pdf/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invoices } from '@/lib/db/schema'
import { getPresignedUrl } from '@/lib/r2/client'
import { eq } from 'drizzle-orm'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const rows = await db
    .select({ pdfUrl: invoices.pdfUrl })
    .from(invoices)
    .where(eq(invoices.id, params.id))
    .limit(1)

  if (!rows[0]?.pdfUrl) {
    return NextResponse.json({ error: 'PDF not found' }, { status: 404 })
  }

  const url = await getPresignedUrl(rows[0].pdfUrl)
  return NextResponse.redirect(url)
}
```

- [ ] **Step 4: Write tests/api/invoices.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockDb = { select: mockSelect, insert: mockInsert }
vi.mock('@/lib/db', () => ({ db: mockDb }))

const mockCreateInvoice = vi.fn()
vi.mock('@/lib/arca/service', () => ({
  arcaService: {
    getClient: vi.fn(() => ({
      electronicBillingService: { createInvoice: mockCreateInvoice },
    })),
  },
}))

const mockUploadPdf = vi.fn().mockResolvedValue(undefined)
const mockGetPresignedUrl = vi.fn().mockResolvedValue('https://r2.example.com/test.pdf')
vi.mock('@/lib/r2/client', () => ({
  uploadPdf: mockUploadPdf,
  getPresignedUrl: mockGetPresignedUrl,
}))

vi.mock('@arcasdk/pdf', () => ({
  InvoicePdfGenerator: vi.fn().mockImplementation(() => ({
    generate: vi.fn().mockResolvedValue(Buffer.from('pdf')),
  })),
}))

import { GET, POST } from '@/app/api/v1/invoices/route'
import { GET as getById } from '@/app/api/v1/invoices/[id]/route'
import { GET as getPdf } from '@/app/api/v1/invoices/[id]/pdf/route'

const MOCK_INVOICE = {
  id: 'uuid-1',
  cuit: '20111111112',
  tipoCbte: 6,
  puntoVenta: 1,
  nroCbte: 1,
  cae: '12345678901234',
  caeFchVto: '2026-07-31',
  amountNet: '100.00',
  amountIva: '21.00',
  amountTotal: '121.00',
  receptorCuit: null,
  receptorName: null,
  pdfUrl: 'invoices/20111111112/2026/uuid-1.pdf',
  rawRequest: {},
  rawResponse: {},
  createdAt: new Date().toISOString(),
}

const VALID_PAYLOAD = {
  puntoVenta: 1,
  tipoCbte: 6,
  concepto: 1,
  docTipo: 99,
  docNro: 0,
  impNeto: 100,
  impIva: 21,
  impTotal: 121,
  iva: [{ Id: 5, BaseImp: 100, Importe: 21 }],
  items: [{ description: 'Service', quantity: 1, unitPrice: 100, ivaRate: 21 }],
}

describe('GET /api/v1/invoices', () => {
  beforeEach(() => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue([MOCK_INVOICE]),
          }),
        }),
      }),
    })
  })

  it('returns paginated invoices', async () => {
    const req = new NextRequest('http://localhost/api/v1/invoices')
    const res = await GET(req)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data).toHaveLength(1)
    expect(body.page).toBe(1)
  })
})

describe('POST /api/v1/invoices', () => {
  beforeEach(() => {
    mockCreateInvoice.mockResolvedValue({
      Resultado: 'A',
      CAE: '12345678901234',
      CAEFchVto: '20260731',
      CbteDesde: 1,
      CbteHasta: 1,
    })
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([MOCK_INVOICE]),
      }),
    })
  })

  it('creates invoice and returns 201', async () => {
    const req = new NextRequest('http://localhost/api/v1/invoices', {
      method: 'POST',
      body: JSON.stringify(VALID_PAYLOAD),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(mockCreateInvoice).toHaveBeenCalledOnce()
    expect(mockUploadPdf).toHaveBeenCalledOnce()
  })

  it('returns 422 when ARCA rejects', async () => {
    mockCreateInvoice.mockResolvedValue({ Resultado: 'R', Errors: [] })
    const req = new NextRequest('http://localhost/api/v1/invoices', {
      method: 'POST',
      body: JSON.stringify(VALID_PAYLOAD),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(422)
  })

  it('returns 422 on invalid payload', async () => {
    const req = new NextRequest('http://localhost/api/v1/invoices', {
      method: 'POST',
      body: JSON.stringify({ puntoVenta: 'bad' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(422)
  })
})

describe('GET /api/v1/invoices/:id', () => {
  it('returns invoice by id', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([MOCK_INVOICE]),
        }),
      }),
    })
    const req = new NextRequest('http://localhost/api/v1/invoices/uuid-1')
    const res = await getById(req, { params: { id: 'uuid-1' } })
    expect(res.status).toBe(200)
  })

  it('returns 404 when not found', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    })
    const req = new NextRequest('http://localhost/api/v1/invoices/missing')
    const res = await getById(req, { params: { id: 'missing' } })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/v1/invoices/:id/pdf', () => {
  it('redirects to presigned URL', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ pdfUrl: 'invoices/key.pdf' }]),
        }),
      }),
    })
    const req = new NextRequest('http://localhost/api/v1/invoices/uuid-1/pdf')
    const res = await getPdf(req, { params: { id: 'uuid-1' } })
    expect(res.status).toBe(302)
  })
})
```

- [ ] **Step 5: Run tests**

```bash
npm run test:run tests/api/invoices.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/v1/invoices tests/api/invoices.test.ts
git commit -m "feat: add invoices API routes (list, create, get, pdf)"
```

---

### Task 8: Settings API Routes

**Files:**
- Create: `app/api/v1/settings/route.ts`
- Create: `app/api/v1/settings/certificates/route.ts`
- Test: `tests/api/settings.test.ts`

**Interfaces:**
- Consumes: `arcaService.getCertStatus()`, `arcaService.reload()`
- Produces:
  - `GET /api/v1/settings` → `{ cuit, env, certStatus }`
  - `PUT /api/v1/settings/certificates` → `{ ok: true }` (saves cert + key to `/data/certs/`)

- [ ] **Step 1: Write app/api/v1/settings/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { arcaService } from '@/lib/arca/service'

export async function GET() {
  return NextResponse.json({
    cuit: process.env.ARCA_CUIT,
    env: process.env.ARCA_ENV ?? 'production',
    certStatus: arcaService.getCertStatus(),
  })
}
```

- [ ] **Step 2: Write app/api/v1/settings/certificates/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync, mkdirSync } from 'fs'
import { arcaService } from '@/lib/arca/service'

const CERTS_DIR = '/data/certs'

export async function PUT(request: NextRequest) {
  const formData = await request.formData()
  const certFile = formData.get('cert') as File | null
  const keyFile = formData.get('key') as File | null

  if (!certFile || !keyFile) {
    return NextResponse.json(
      { error: 'Both cert and key files are required' },
      { status: 400 }
    )
  }

  const certContent = await certFile.text()
  const keyContent = await keyFile.text()

  if (!certContent.includes('-----BEGIN CERTIFICATE-----')) {
    return NextResponse.json({ error: 'Invalid certificate file' }, { status: 400 })
  }
  if (!keyContent.includes('-----BEGIN')) {
    return NextResponse.json({ error: 'Invalid private key file' }, { status: 400 })
  }

  mkdirSync(CERTS_DIR, { recursive: true })
  writeFileSync(`${CERTS_DIR}/cert.crt`, certContent, 'utf-8')
  writeFileSync(`${CERTS_DIR}/cert.key`, keyContent, 'utf-8')

  arcaService.reload()

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Write tests/api/settings.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/arca/service', () => ({
  arcaService: {
    getCertStatus: vi.fn(() => ({ loaded: true, source: 'env' })),
    reload: vi.fn(),
  },
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
})

import { GET } from '@/app/api/v1/settings/route'
import { PUT } from '@/app/api/v1/settings/certificates/route'
import { arcaService } from '@/lib/arca/service'

describe('GET /api/v1/settings', () => {
  it('returns cuit, env, and certStatus', async () => {
    const res = await GET()
    const body = await res.json()
    expect(body.cuit).toBe('20111111112')
    expect(body.certStatus.loaded).toBe(true)
  })
})

describe('PUT /api/v1/settings/certificates', () => {
  it('returns 400 when files are missing', async () => {
    const fd = new FormData()
    const req = new NextRequest('http://localhost/api/v1/settings/certificates', {
      method: 'PUT',
      body: fd,
    })
    const res = await PUT(req)
    expect(res.status).toBe(400)
  })

  it('saves cert files and calls reload', async () => {
    const fd = new FormData()
    fd.append('cert', new Blob(['-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----']), 'cert.crt')
    fd.append('key', new Blob(['-----BEGIN RSA PRIVATE KEY-----\nMOCK\n-----END RSA PRIVATE KEY-----']), 'cert.key')
    const req = new NextRequest('http://localhost/api/v1/settings/certificates', {
      method: 'PUT',
      body: fd,
    })
    const res = await PUT(req)
    expect(res.status).toBe(200)
    expect(arcaService.reload).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run tests/api/settings.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/settings tests/api/settings.test.ts
git commit -m "feat: add settings API routes (status + cert upload)"
```

---

### Task 9: App Shell — Providers, Portal Layout & Nav

**Files:**
- Create: `components/providers.tsx`
- Modify: `app/layout.tsx`
- Create: `app/(portal)/layout.tsx`
- Create: `components/nav.tsx`

**Interfaces:**
- Consumes: `@tanstack/react-query`, `@tanstack/react-query-devtools`
- Produces: `<Providers>` wrapping QueryClientProvider; portal layout with nav showing invoice list link and padron search

- [ ] **Step 1: Write components/providers.tsx**

```typescript
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
```

- [ ] **Step 2: Update app/layout.tsx to include Providers**

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AFIP Portal',
  description: 'Portal personal ARCA/AFIP',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Write components/nav.tsx**

```typescript
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FileText, Search, Settings, LogOut } from 'lucide-react'

export function Nav() {
  const router = useRouter()
  const [cuit, setCuit] = useState('')

  async function handleLogout() {
    await fetch('/api/v1/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  function handlePadronSearch(e: React.FormEvent) {
    e.preventDefault()
    const clean = cuit.replace(/\D/g, '')
    if (clean.length === 11) {
      router.push(`/padron/${clean}`)
      setCuit('')
    }
  }

  return (
    <header className="border-b bg-white">
      <div className="container mx-auto flex h-14 items-center gap-4 px-4">
        <Link href="/invoices" className="font-semibold text-lg mr-4">
          AFIP Portal
        </Link>
        <nav className="flex items-center gap-2 flex-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/invoices">
              <FileText className="h-4 w-4 mr-1" />
              Facturas
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/settings">
              <Settings className="h-4 w-4 mr-1" />
              Configuración
            </Link>
          </Button>
        </nav>
        <form onSubmit={handlePadronSearch} className="flex items-center gap-2">
          <Input
            placeholder="Buscar CUIT (11 dígitos)"
            value={cuit}
            onChange={(e) => setCuit(e.target.value)}
            className="w-52 h-8 text-sm"
          />
          <Button type="submit" size="sm" variant="outline">
            <Search className="h-4 w-4" />
          </Button>
        </form>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Write app/(portal)/layout.tsx**

```typescript
import { Nav } from '@/components/nav'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1 container mx-auto py-6 px-4">{children}</main>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add components/providers.tsx components/nav.tsx app/layout.tsx app/'(portal)'/layout.tsx
git commit -m "feat: add React Query providers, portal layout, and nav with padron search"
```

---

### Task 10: Login Page

**Files:**
- Create: `app/(auth)/login/page.tsx`
- Create: `components/login-form.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/auth/login`
- Produces: Login form with username/password, redirects to `/invoices` on success

- [ ] **Step 1: Write components/login-form.tsx**

```typescript
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const schema = z.object({
  username: z.string().min(1, 'Requerido'),
  password: z.string().min(1, 'Requerido'),
})

type FormData = z.infer<typeof schema>

export function LoginForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setError(null)
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      router.push('/invoices')
      router.refresh()
    } else {
      setError('Usuario o contraseña incorrectos')
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>AFIP Portal</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="username">Usuario</Label>
            <Input id="username" {...register('username')} autoComplete="username" />
            {errors.username && (
              <p className="text-sm text-destructive">{errors.username.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" type="password" {...register('password')} autoComplete="current-password" />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Ingresando...' : 'Ingresar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Write app/(auth)/login/page.tsx**

```typescript
import { LoginForm } from '@/components/login-form'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <LoginForm />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/'(auth)' components/login-form.tsx
git commit -m "feat: add login page with react-hook-form + zod validation"
```

---

### Task 11: Invoice List Page

**Files:**
- Create: `app/(portal)/invoices/page.tsx`
- Create: `components/invoices/invoice-list.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/invoices`
- Produces: Server-prefetched invoice list with Suspense + skeleton

- [ ] **Step 1: Write components/invoices/invoice-list.tsx**

```typescript
'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { Invoice } from '@/lib/db/schema'

async function fetchInvoices(page: number): Promise<{ data: Invoice[]; page: number; limit: number }> {
  const res = await fetch(`/api/v1/invoices?page=${page}`)
  if (!res.ok) throw new Error('Failed to fetch invoices')
  return res.json()
}

const INVOICE_TYPE_LABELS: Record<number, string> = {
  1: 'A', 2: 'A NdC', 3: 'A NdD',
  6: 'B', 7: 'B NdC', 8: 'B NdD',
  11: 'C', 12: 'C NdC', 13: 'C NdD',
}

export function InvoiceList({ page = 1 }: { page?: number }) {
  const { data } = useSuspenseQuery({
    queryKey: ['invoices', page],
    queryFn: () => fetchInvoices(page),
  })

  if (data.data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No hay facturas aún.
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tipo</TableHead>
          <TableHead>Pto. Venta</TableHead>
          <TableHead>Nro.</TableHead>
          <TableHead>Receptor</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>CAE vence</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.data.map((invoice) => (
          <TableRow key={invoice.id}>
            <TableCell>
              <Badge variant="outline">
                Fac. {INVOICE_TYPE_LABELS[invoice.tipoCbte] ?? invoice.tipoCbte}
              </Badge>
            </TableCell>
            <TableCell>{invoice.puntoVenta.toString().padStart(5, '0')}</TableCell>
            <TableCell>{invoice.nroCbte.toString().padStart(8, '0')}</TableCell>
            <TableCell className="max-w-[200px] truncate">
              {invoice.receptorName ?? invoice.receptorCuit ?? '—'}
            </TableCell>
            <TableCell className="text-right font-mono">
              ${Number(invoice.amountTotal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </TableCell>
            <TableCell>{invoice.caeFchVto}</TableCell>
            <TableCell>{new Date(invoice.createdAt).toLocaleDateString('es-AR')}</TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/invoices/${invoice.id}`}>Ver</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 2: Write app/(portal)/invoices/page.tsx**

```typescript
import { Suspense } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
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
        <Button asChild>
          <Link href="/invoices/new">Nueva factura</Link>
        </Button>
      </div>
      <Suspense fallback={<InvoiceListSkeleton />}>
        <InvoiceList />
      </Suspense>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/'(portal)'/invoices/page.tsx components/invoices/invoice-list.tsx
git commit -m "feat: add invoice list page with React Query Suspense"
```

---

### Task 12: New Invoice Form

**Files:**
- Create: `app/(portal)/invoices/new/page.tsx`
- Create: `components/invoices/invoice-form.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/padron/:cuit` (auto-fill receptor), `POST /api/v1/invoices`
- Produces: 4-step form: receptor → items → preview → submit; redirects to `/invoices/:id` on success

- [ ] **Step 1: Write components/invoices/invoice-form.tsx**

```typescript
'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Trash2, Plus } from 'lucide-react'

const IVA_RATES = [
  { id: 3, label: '0%', rate: 0 },
  { id: 4, label: '10.5%', rate: 10.5 },
  { id: 5, label: '21%', rate: 21 },
  { id: 6, label: '27%', rate: 27 },
]

const CBTE_TYPES = [
  { id: 1, label: 'Factura A' },
  { id: 6, label: 'Factura B' },
  { id: 11, label: 'Factura C' },
]

const lineItemSchema = z.object({
  description: z.string().min(1, 'Requerido'),
  quantity: z.coerce.number().positive('Debe ser > 0'),
  unitPrice: z.coerce.number().positive('Debe ser > 0'),
  ivaRateId: z.coerce.number(),
})

const formSchema = z.object({
  tipoCbte: z.coerce.number().int(),
  puntoVenta: z.coerce.number().int().min(1).max(9999),
  receptorCuit: z.string().optional(),
  items: z.array(lineItemSchema).min(1, 'Al menos un ítem'),
})

type FormData = z.infer<typeof formSchema>

type Step = 'receptor' | 'items' | 'preview' | 'done'

function calcTotals(items: FormData['items']) {
  let net = 0
  let iva = 0
  const ivaMap: Record<number, { BaseImp: number; Importe: number }> = {}

  for (const item of items) {
    const rate = IVA_RATES.find((r) => r.id === item.ivaRateId)
    const lineNet = item.quantity * item.unitPrice
    const lineIva = lineNet * ((rate?.rate ?? 0) / 100)
    net += lineNet
    iva += lineIva
    if (!ivaMap[item.ivaRateId]) ivaMap[item.ivaRateId] = { BaseImp: 0, Importe: 0 }
    ivaMap[item.ivaRateId].BaseImp += lineNet
    ivaMap[item.ivaRateId].Importe += lineIva
  }

  return {
    impNeto: Math.round(net * 100) / 100,
    impIva: Math.round(iva * 100) / 100,
    impTotal: Math.round((net + iva) * 100) / 100,
    ivaBreakdown: Object.entries(ivaMap).map(([id, v]) => ({
      Id: parseInt(id, 10), BaseImp: Math.round(v.BaseImp * 100) / 100, Importe: Math.round(v.Importe * 100) / 100,
    })),
  }
}

export function InvoiceForm() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('receptor')
  const [receptorName, setReceptorName] = useState<string | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { register, control, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tipoCbte: 6,
      puntoVenta: 1,
      items: [{ description: '', quantity: 1, unitPrice: 0, ivaRateId: 5 }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchedItems = watch('items')
  const watchedCuit = watch('receptorCuit')

  async function lookupCuit() {
    const cuit = (watchedCuit ?? '').replace(/\D/g, '')
    if (cuit.length !== 11) return
    setLookingUp(true)
    try {
      const res = await fetch(`/api/v1/padron/${cuit}`)
      if (res.ok) {
        const body = await res.json()
        const name = body.data?.persona?.denominacion ?? body.data?.persona?.apellido ?? null
        setReceptorName(name)
      }
    } finally {
      setLookingUp(false)
    }
  }

  async function onSubmit(data: FormData) {
    setSubmitError(null)
    const totals = calcTotals(data.items)
    const payload = {
      puntoVenta: data.puntoVenta,
      tipoCbte: data.tipoCbte,
      concepto: 2,
      docTipo: data.receptorCuit ? 80 : 99,
      docNro: data.receptorCuit ? parseInt(data.receptorCuit, 10) : 0,
      receptorCuit: data.receptorCuit,
      receptorName: receptorName ?? undefined,
      impNeto: totals.impNeto,
      impIva: totals.impIva,
      impTotal: totals.impTotal,
      monId: 'PES',
      monCotiz: 1,
      iva: totals.ivaBreakdown,
      items: data.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        ivaRate: IVA_RATES.find((r) => r.id === i.ivaRateId)?.rate ?? 21,
      })),
    }
    const res = await fetch('/api/v1/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      const invoice = await res.json()
      router.push(`/invoices/${invoice.id}`)
    } else {
      const err = await res.json()
      setSubmitError(err.error ?? 'Error al crear la factura')
    }
  }

  const totals = calcTotals(watchedItems ?? [])

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {step === 'receptor' && (
        <Card>
          <CardHeader><CardTitle>Paso 1: Receptor</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Tipo de comprobante</Label>
                <Select
                  defaultValue="6"
                  onValueChange={(v) => setValue('tipoCbte', parseInt(v, 10))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CBTE_TYPES.map((t) => (
                      <SelectItem key={t.id} value={t.id.toString()}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Punto de venta</Label>
                <Input type="number" {...register('puntoVenta')} />
                {errors.puntoVenta && <p className="text-sm text-destructive">{errors.puntoVenta.message}</p>}
              </div>
            </div>
            <div className="space-y-1">
              <Label>CUIT receptor (opcional)</Label>
              <div className="flex gap-2">
                <Input
                  {...register('receptorCuit')}
                  placeholder="20111111112"
                  maxLength={11}
                />
                <Button type="button" variant="outline" onClick={lookupCuit} disabled={lookingUp}>
                  {lookingUp ? 'Buscando...' : 'Buscar'}
                </Button>
              </div>
              {receptorName && (
                <p className="text-sm text-muted-foreground">{receptorName}</p>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button type="button" onClick={() => setStep('items')}>Siguiente</Button>
          </CardFooter>
        </Card>
      )}

      {step === 'items' && (
        <Card>
          <CardHeader><CardTitle>Paso 2: Ítems</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4 space-y-1">
                  {idx === 0 && <Label>Descripción</Label>}
                  <Input {...register(`items.${idx}.description`)} placeholder="Descripción" />
                </div>
                <div className="col-span-2 space-y-1">
                  {idx === 0 && <Label>Cantidad</Label>}
                  <Input type="number" step="0.01" {...register(`items.${idx}.quantity`)} />
                </div>
                <div className="col-span-2 space-y-1">
                  {idx === 0 && <Label>Precio unit.</Label>}
                  <Input type="number" step="0.01" {...register(`items.${idx}.unitPrice`)} />
                </div>
                <div className="col-span-3 space-y-1">
                  {idx === 0 && <Label>IVA</Label>}
                  <Select
                    defaultValue="5"
                    onValueChange={(v) => setValue(`items.${idx}.ivaRateId`, parseInt(v, 10))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {IVA_RATES.map((r) => (
                        <SelectItem key={r.id} value={r.id.toString()}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1">
                  {fields.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {errors.items && <p className="text-sm text-destructive">{errors.items.message}</p>}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ description: '', quantity: 1, unitPrice: 0, ivaRateId: 5 })}
            >
              <Plus className="h-4 w-4 mr-1" />
              Agregar ítem
            </Button>
          </CardContent>
          <CardFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setStep('receptor')}>Atrás</Button>
            <Button type="button" onClick={() => setStep('preview')}>Ver resumen</Button>
          </CardFooter>
        </Card>
      )}

      {step === 'preview' && (
        <Card>
          <CardHeader><CardTitle>Paso 3: Resumen</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {receptorName && (
              <p className="text-sm"><span className="font-medium">Receptor:</span> {receptorName} ({watchedCuit})</p>
            )}
            <Separator />
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Neto gravado</span>
                <span className="font-mono">${totals.impNeto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IVA</span>
                <span className="font-mono">${totals.impIva.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span className="font-mono">${totals.impTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
            {submitError && <p className="text-sm text-destructive">{submitError}</p>}
          </CardContent>
          <CardFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setStep('items')}>Atrás</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Autorizando...' : 'Autorizar factura'}
            </Button>
          </CardFooter>
        </Card>
      )}
    </form>
  )
}
```

- [ ] **Step 2: Write app/(portal)/invoices/new/page.tsx**

```typescript
import { InvoiceForm } from '@/components/invoices/invoice-form'

export default function NewInvoicePage() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Nueva factura</h1>
      <InvoiceForm />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/'(portal)'/invoices/new components/invoices/invoice-form.tsx
git commit -m "feat: add multi-step new invoice form with padron auto-fill and IVA calculation"
```

---

### Task 13: Invoice Detail Page

**Files:**
- Create: `app/(portal)/invoices/[id]/page.tsx`
- Create: `components/invoices/invoice-detail.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/invoices/:id`, `GET /api/v1/invoices/:id/pdf`
- Produces: Invoice detail view with PDF download button

- [ ] **Step 1: Write components/invoices/invoice-detail.tsx**

```typescript
'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Download } from 'lucide-react'
import type { Invoice } from '@/lib/db/schema'

async function fetchInvoice(id: string): Promise<Invoice> {
  const res = await fetch(`/api/v1/invoices/${id}`)
  if (!res.ok) throw new Error('Invoice not found')
  return res.json()
}

export function InvoiceDetail({ id }: { id: string }) {
  const { data: invoice } = useSuspenseQuery({
    queryKey: ['invoice', id],
    queryFn: () => fetchInvoice(id),
  })

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          Factura {invoice.puntoVenta.toString().padStart(5, '0')}-
          {invoice.nroCbte.toString().padStart(8, '0')}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge>CAE: {invoice.cae}</Badge>
          {invoice.pdfUrl && (
            <Button size="sm" asChild>
              <a href={`/api/v1/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">
                <Download className="h-4 w-4 mr-1" />
                PDF
              </a>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-muted-foreground">Receptor</p>
            <p className="font-medium">{invoice.receptorName ?? '—'}</p>
            {invoice.receptorCuit && <p className="text-muted-foreground">{invoice.receptorCuit}</p>}
          </div>
          <div>
            <p className="text-muted-foreground">Fecha</p>
            <p className="font-medium">{new Date(invoice.createdAt).toLocaleDateString('es-AR')}</p>
          </div>
        </div>
        <Separator />
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Neto gravado</span>
            <span className="font-mono">${Number(invoice.amountNet).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">IVA</span>
            <span className="font-mono">${Number(invoice.amountIva).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="font-mono">${Number(invoice.amountTotal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
        <Separator />
        <div>
          <p className="text-muted-foreground mb-1">CAE vence</p>
          <p>{invoice.caeFchVto}</p>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Write app/(portal)/invoices/[id]/page.tsx**

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add app/'(portal)'/invoices/'[id]' components/invoices/invoice-detail.tsx
git commit -m "feat: add invoice detail page with PDF download"
```

---

### Task 14: Padron Detail Page

**Files:**
- Create: `app/(portal)/padron/[cuit]/page.tsx`
- Create: `components/padron/padron-detail.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/padron/:cuit`
- Produces: Taxpayer detail view with all padron data; badge showing if result was cached

- [ ] **Step 1: Write components/padron/padron-detail.tsx**

```typescript
'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

async function fetchPadron(cuit: string) {
  const res = await fetch(`/api/v1/padron/${cuit}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? 'Error al consultar el padrón')
  }
  return res.json() as Promise<{ data: Record<string, unknown>; cached: boolean }>
}

function renderValue(value: unknown, depth = 0): React.ReactNode {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>
  if (typeof value === 'object' && !Array.isArray(value)) {
    return (
      <div className={depth > 0 ? 'ml-4 mt-1' : ''}>
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="grid grid-cols-2 gap-2 py-0.5">
            <span className="text-muted-foreground capitalize">{k}</span>
            <span>{renderValue(v, depth + 1)}</span>
          </div>
        ))}
      </div>
    )
  }
  if (Array.isArray(value)) {
    return <span>{value.join(', ')}</span>
  }
  return <span>{String(value)}</span>
}

export function PadronDetail({ cuit }: { cuit: string }) {
  const { data } = useSuspenseQuery({
    queryKey: ['padron', cuit],
    queryFn: () => fetchPadron(cuit),
  })

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>CUIT {cuit}</CardTitle>
        {data.cached && <Badge variant="secondary">Caché</Badge>}
      </CardHeader>
      <CardContent className="text-sm">
        {renderValue(data.data)}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Write app/(portal)/padron/[cuit]/page.tsx**

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add app/'(portal)'/padron components/padron/padron-detail.tsx
git commit -m "feat: add padron detail page with recursive data rendering"
```

---

### Task 15: Settings Page

**Files:**
- Create: `app/(portal)/settings/page.tsx`
- Create: `components/settings/settings-form.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/settings`, `PUT /api/v1/settings/certificates`
- Produces: Settings page showing cert status, CUIT, env, and drag-and-drop cert upload

- [ ] **Step 1: Write components/settings/settings-form.tsx**

```typescript
'use client'

import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { CheckCircle, XCircle, AlertTriangle, Upload } from 'lucide-react'

interface SettingsData {
  cuit: string
  env: string
  certStatus: { loaded: boolean; source: 'volume' | 'env' | null }
}

async function fetchSettings(): Promise<SettingsData> {
  const res = await fetch('/api/v1/settings')
  if (!res.ok) throw new Error('Failed to fetch settings')
  return res.json()
}

export function SettingsForm() {
  const queryClient = useQueryClient()
  const { data } = useSuspenseQuery({ queryKey: ['settings'], queryFn: fetchSettings })
  const certRef = useRef<HTMLInputElement>(null)
  const keyRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function handleUpload() {
    const cert = certRef.current?.files?.[0]
    const key = keyRef.current?.files?.[0]
    if (!cert || !key) {
      setUploadResult({ ok: false, message: 'Seleccioná ambos archivos (cert y key)' })
      return
    }
    setUploading(true)
    setUploadResult(null)
    try {
      const fd = new FormData()
      fd.append('cert', cert)
      fd.append('key', key)
      const res = await fetch('/api/v1/settings/certificates', { method: 'PUT', body: fd })
      if (res.ok) {
        setUploadResult({ ok: true, message: 'Certificados actualizados correctamente' })
        queryClient.invalidateQueries({ queryKey: ['settings'] })
      } else {
        const err = await res.json()
        setUploadResult({ ok: false, message: err.error ?? 'Error al subir los certificados' })
      }
    } finally {
      setUploading(false)
    }
  }

  const CertIcon = data.certStatus.loaded
    ? CheckCircle
    : XCircle

  return (
    <div className="space-y-6 max-w-xl">
      <Card>
        <CardHeader><CardTitle>Estado actual</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">CUIT</span>
            <span className="font-mono font-medium">{data.cuit}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Entorno</span>
            <Badge variant={data.env === 'production' ? 'default' : 'secondary'}>
              {data.env === 'production' ? 'Producción' : 'Homologación'}
            </Badge>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Certificado</span>
            <div className="flex items-center gap-1">
              <CertIcon
                className={`h-4 w-4 ${data.certStatus.loaded ? 'text-green-500' : 'text-destructive'}`}
              />
              <span>{data.certStatus.loaded ? `Cargado (${data.certStatus.source})` : 'No encontrado'}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Actualizar certificados</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="cert-file">Certificado (.crt)</Label>
            <Input id="cert-file" type="file" accept=".crt,.pem" ref={certRef} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="key-file">Clave privada (.key)</Label>
            <Input id="key-file" type="file" accept=".key,.pem" ref={keyRef} />
          </div>
          {uploadResult && (
            <div className={`flex items-center gap-2 text-sm ${uploadResult.ok ? 'text-green-600' : 'text-destructive'}`}>
              {uploadResult.ok ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {uploadResult.message}
            </div>
          )}
          <Button onClick={handleUpload} disabled={uploading}>
            <Upload className="h-4 w-4 mr-1" />
            {uploading ? 'Subiendo...' : 'Subir certificados'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Write app/(portal)/settings/page.tsx**

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add app/'(portal)'/settings components/settings/settings-form.tsx
git commit -m "feat: add settings page with cert status display and upload"
```

---

### Task 16: Dockerfile & docker-compose

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

**Interfaces:**
- Produces: `docker compose up` starts the portal on port 3000, connected to `shared-net`

- [ ] **Step 1: Write .dockerignore**

```
node_modules
.next
.git
*.env
*.env.*
!.env.example
drizzle/
docs/
tests/
README.md
```

- [ ] **Step 2: Write Dockerfile**

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --only=production && cp -r node_modules /prod_modules
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=deps /prod_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

RUN mkdir -p /data/certs && chown nextjs:nodejs /data/certs

USER nextjs
EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
```

- [ ] **Step 3: Write docker-compose.yml**

```yaml
services:
  afip-portal:
    build: .
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - certs:/data/certs
    env_file:
      - .env
    networks:
      - shared-net

volumes:
  certs:

networks:
  shared-net:
    external: true
```

- [ ] **Step 4: Verify the build works**

```bash
docker build -t afip-portal:local .
```

Expected: image builds successfully, no errors.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "feat: add Dockerfile and docker-compose for LAN deployment"
```

- [ ] **Step 6: Push to remote**

```bash
git push origin main
```

---

## Post-Implementation Checklist

- [ ] Run `npm run db:migrate` against the real Postgres instance to create the two tables
- [ ] Copy `.env.example` to `.env` and fill in all values
- [ ] Verify cert files are accessible at the configured paths
- [ ] Run `docker compose up` and confirm the app starts on port 3000
- [ ] Log in at `http://<LAN-IP>:3000/login`
- [ ] Test padron lookup for a known CUIT
- [ ] Test creating a factura B (tipoCbte=6) in homologation environment
- [ ] Verify the PDF appears in R2 and the download link works
