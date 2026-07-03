# AFIP Portal — Design Spec
**Date:** 2026-07-03  
**Status:** Approved

## Overview

A personal Next.js portal for operating with ARCA (Argentine tax authority) over LAN/VPN. Exposes all operations as a REST API (strict CORS) and as a web UI. Uses the `@arcasdk/core` library for WSFE electronic invoicing and padron (taxpayer registry) queries.

---

## 1. Architecture

### Stack
- **Framework:** Next.js 14 App Router
- **UI:** React Query (Suspense mode) + Shadcn + Tailwind CSS
- **ORM:** Drizzle ORM
- **Database:** Existing PostgreSQL instance on a shared Docker network
- **Object storage:** Cloudflare R2 (invoice PDFs)
- **AFIP library:** `@arcasdk/core`, `@arcasdk/pdf`
- **Session auth:** `iron-session` (httpOnly signed cookie)

### Deployment
Single `docker-compose.yml` for the `afip-portal` service. Postgres lives in a separate compose file on the same external Docker network.

```yaml
# docker-compose.yml (afip-portal)
services:
  afip-portal:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./certs:/data/certs        # persistent cert storage
    env_file: .env
    networks:
      - shared-net

networks:
  shared-net:
    external: true
```

### Request flow
1. Every request hits `middleware.ts` — CORS check + session auth validation
2. UI pages render as Server Components with React Query prefetching
3. REST endpoints at `/api/v1/*` are Route Handlers, consumed by the UI and external LAN clients
4. `ArcaService` singleton (server-only) holds the initialized arcasdk client, lazy-loaded and reloadable

---

## 2. API Structure

Base path: `/api/v1/`

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Validate credentials, set httpOnly session cookie |
| POST | `/auth/logout` | Clear session cookie |

### Invoices
| Method | Path | Description |
|--------|------|-------------|
| GET | `/invoices` | List invoices (paginated) |
| POST | `/invoices` | Create and authorize invoice via WSFE |
| GET | `/invoices/:id` | Get single invoice |
| GET | `/invoices/:id/pdf` | Redirect to R2 presigned URL (15 min TTL) |

### Padron
| Method | Path | Description |
|--------|------|-------------|
| GET | `/padron/:cuit` | Taxpayer lookup, defaults to scope 10 (most comprehensive). Optional `?scope=4\|5\|10\|13` query param. Cached 24h. |

### Settings
| Method | Path | Description |
|--------|------|-------------|
| GET | `/settings` | Get current config (cert status, CUIT, environment) |
| PUT | `/settings/certificates` | Upload new `.crt` + `.key` files |

### CORS
- Configured once in `middleware.ts`
- `ALLOWED_ORIGINS` env var (comma-separated): e.g. `http://192.168.1.10:3000,http://10.8.0.1:8080`
- Requests from unlisted origins return `403` before reaching any Route Handler
- Next.js UI (same-origin) is always allowed

### Auth middleware
- `POST /api/v1/auth/login` — validates against `PORTAL_USER` + `PORTAL_PASSWORD` env vars
- All other `/api/v1/*` routes and all UI pages require a valid session cookie
- Unauthenticated UI requests redirect to `/login`; API requests return `401`

---

## 3. Database Schema

Two tables, managed by Drizzle ORM migrations.

### `invoices`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `cuit` | `varchar(11)` | Issuer CUIT |
| `tipo_cbte` | `smallint` | Invoice type (1=A, 6=B, 11=C…) |
| `punto_venta` | `smallint` | Sales point number |
| `nro_cbte` | `integer` | Invoice number (assigned by ARCA) |
| `cae` | `varchar(14)` | ARCA authorization code |
| `cae_fch_vto` | `date` | CAE expiry date |
| `amount_net` | `numeric(12,2)` | |
| `amount_iva` | `numeric(12,2)` | |
| `amount_total` | `numeric(12,2)` | |
| `receptor_cuit` | `varchar(11)` | |
| `receptor_name` | `varchar(255)` | |
| `pdf_url` | `text` | R2 object key |
| `raw_request` | `jsonb` | Full WSFE request payload |
| `raw_response` | `jsonb` | Full WSFE response |
| `created_at` | `timestamptz` | Default `now()` |

### `padron_cache`
| Column | Type | Notes |
|--------|------|-------|
| `cuit` | `varchar(11)` PK | |
| `data` | `jsonb` | Full padron response |
| `fetched_at` | `timestamptz` | |
| `expires_at` | `timestamptz` | TTL = 24h from fetch |

`raw_request` / `raw_response` JSONB columns insulate from ARCA API changes. AI agents can query these columns directly for full context.

---

## 4. Certificate Management

### Resolution priority
1. `/data/certs/` volume path (set via UI upload) — takes precedence
2. `ARCA_CERT_PATH` + `ARCA_KEY_PATH` env vars (bind-mounted files)

### ArcaService singleton
```
lib/arca/service.ts (server-only)
├── initialize()  — reads certs from resolved path, inits arcasdk client
├── getClient()   — returns client, auto-initializes on first call
└── reload()      — re-initializes after cert upload
```

### Settings UI
- Shows cert status: loaded / missing / expired
- Shows CUIT in use and current environment (homologation / production)
- Drag-and-drop upload for `.crt` + `.key` — calls `PUT /api/v1/settings/certificates`, triggers `ArcaService.reload()`
- Warns if cert expires within 30 days

---

## 5. Frontend Structure

### Pages
| Path | Description |
|------|-------------|
| `/` | Redirects to `/invoices` (authed) or `/login` |
| `/login` | Login form, no layout |
| `/invoices` | Invoice list, paginated, "New Invoice" button |
| `/invoices/new` | Multi-step invoice creation form |
| `/invoices/[id]` | Invoice detail + PDF download |
| `/padron/[cuit]` | Taxpayer detail (reachable from nav search) |
| `/settings` | Cert upload + config status |

### Data fetching pattern
All pages follow the same pattern:
- Server Component prefetches via `queryClient.prefetchQuery()`
- Client component uses `useSuspenseQuery()` — no waterfalls
- `<Suspense fallback={<Skeleton />}>` wraps every data-dependent component

### Key UI flows

**New invoice (multi-step):**
1. Enter receptor CUIT → padron lookup auto-fills name
2. Enter line items (description, qty, unit price, IVA rate)
3. Preview invoice totals
4. Submit → `POST /api/v1/invoices` → show CAE + PDF download on success

**Padron lookup:**
- Debounced search in nav bar
- Results cached by React Query (mirrors 24h `padron_cache` TTL)

**Settings:**
- Cert drag-and-drop upload
- Expiry date display with <30-day warning badge

### State management
- **Server state:** React Query exclusively
- **Form state:** React Hook Form
- **No global client state store** (no Zustand/Redux)

---

## 6. PDF Generation & R2

### Flow (synchronous, inside `POST /api/v1/invoices`)
1. WSFE returns CAE → invoice is authorized
2. Generate PDF via `@arcasdk/pdf`
3. Upload to R2 at key `invoices/{cuit}/{year}/{id}.pdf`
4. Store R2 key in `invoices.pdf_url`
5. Return full invoice to client

### PDF access
- `GET /api/v1/invoices/:id/pdf` generates a presigned URL (15 min TTL) and redirects
- R2 bucket has no public access

### Required env vars
```
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
```

---

## 7. Environment Variables

```env
# Auth
PORTAL_USER=
PORTAL_PASSWORD=
SESSION_SECRET=           # random 32+ char string for iron-session

# AFIP / ARCA
ARCA_CUIT=
ARCA_CERT_PATH=           # path to .crt file (default cert source)
ARCA_KEY_PATH=            # path to .key file (default cert source)
ARCA_ENV=production       # or "homologation"

# Database
DATABASE_URL=             # postgres://user:pass@hostname:5432/dbname

# R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=

# CORS
ALLOWED_ORIGINS=          # comma-separated, e.g. http://192.168.1.10:3000
```

---

## 8. Project Structure

```
afip-portal/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (portal)/
│   │   ├── layout.tsx          # nav + session check
│   │   ├── invoices/
│   │   │   ├── page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── padron/[cuit]/page.tsx
│   │   └── settings/page.tsx
│   └── api/v1/
│       ├── auth/
│       │   ├── login/route.ts
│       │   └── logout/route.ts
│       ├── invoices/
│       │   ├── route.ts         # GET list, POST create
│       │   └── [id]/
│       │       ├── route.ts     # GET single
│       │       └── pdf/route.ts # GET presigned URL
│       ├── padron/[cuit]/route.ts
│       └── settings/
│           ├── route.ts
│           └── certificates/route.ts
├── lib/
│   ├── arca/
│   │   └── service.ts          # ArcaService singleton
│   ├── db/
│   │   ├── schema.ts           # Drizzle schema
│   │   └── index.ts            # Drizzle client
│   ├── r2/
│   │   └── client.ts           # S3-compatible R2 client
│   └── session.ts              # iron-session config
├── components/                 # Shadcn + custom components
├── middleware.ts               # CORS + auth
├── drizzle.config.ts
├── docker-compose.yml
├── Dockerfile
└── .env.example
```
