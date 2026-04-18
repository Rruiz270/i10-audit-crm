# i10 Audit CRM

CRM do **Instituto i10** para captação de leads de municípios e handoff para o sistema de consultoria **BNCC-CAPTACAO**.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript 5**
- **Tailwind 4** + **Radix UI** (mesma stack de BNCC-CAPTACAO)
- **Drizzle ORM** + **Neon Postgres** (mesmo DB do BNCC-CAPTACAO, schema `crm.*`)
- **Auth.js v5** (NextAuth) com **Google OAuth** (inclui escopo Calendar)
- **Google Calendar API** para sincronizar reuniões

## Architecture

```
  i10-audit-CRM                     BNCC-CAPTACAO
  ─────────────                     ─────────────
  crm.users                         fundeb.municipalities  ◀─ referenced by FK
  crm.opportunities ────▶  ganhou   fundeb.consultorias   ◀─ inserted on handoff
  crm.contacts                      fundeb.wizard_progress
  crm.activities                    fundeb.compliance_items
  crm.meetings ─────┐               ...
  crm.lead_forms    ├─▶ Google Calendar API
  crm.lead_submissions
```

Same Neon database, separate schemas. The CRM writes directly into `fundeb.consultorias` when an opportunity reaches the `ganhou` stage (see `src/lib/handoff.ts`).

## Setup

### 1. Clone & install

```bash
git clone https://github.com/Rruiz270/i10-audit-CRM.git
cd i10-audit-CRM
npm install
```

### 2. Environment

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in:

- **DATABASE_URL** — the same Neon URL that BNCC-CAPTACAO uses (shared DB)
- **AUTH_SECRET** — `openssl rand -base64 32`
- **AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET** — from Google Cloud Console (OAuth 2.0 Client ID, type "Web application")
  - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
  - Scopes: openid, email, profile, https://www.googleapis.com/auth/calendar.events
- **ADMIN_EMAILS** — comma-separated emails allowed to sign in without prior invite

### 3. Database migration

```bash
npx drizzle-kit generate   # produces SQL in ./drizzle
npx drizzle-kit push       # applies to Neon
```

The `crm` schema is created on first push. NextAuth tables (`users`, `accounts`, `sessions`, `verification_tokens`) live inside `crm.*`.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000 — sign in with an admin Google account.

## Pipeline stages

Defined in `src/lib/pipeline.ts`. Current:

```
Novo → Contato Inicial → Diagnóstico Enviado → Follow-up
     → Reunião de Auditoria → Negociação → Ganhou (Won)
     → Perdido (any time)
```

`Ganhou` triggers consultoria creation in BNCC-CAPTACAO. Contract-signed status is tracked independently as `contractSigned` boolean.

## Key files

| File | Purpose |
|---|---|
| `src/lib/schema.ts` | Drizzle schema (`crm.*` + minimal `fundeb.*` references) |
| `src/lib/db.ts` | Neon + Drizzle client |
| `src/lib/auth.ts` | NextAuth config (Google OAuth, Drizzle adapter) |
| `src/lib/pipeline.ts` | Stage definitions — **configurable** |
| `src/lib/qualification.ts` | Stage-exit gating rules — **configurable** |
| `src/lib/handoff.ts` | Payload when Opportunity → Consultoria — **configurable** |
| `src/middleware.ts` | Auth gate for protected routes |
| `src/app/(app)/` | Authenticated pages (Dashboard, Pipeline, etc.) |
| `src/app/login/` | Public login page |

## Not yet built (roadmap)

- Kanban drag-and-drop
- Opportunity detail page + activity feed
- Google Calendar create-event flow
- Public intake form (`/intake/[slug]`)
- Handoff button + audit log integration
- Lead assignment (phase 1 manual, phase 2 % random)
- Email integration
- WhatsApp (phase 3)

## Related

- Main consulting app: https://github.com/Rruiz270/BNCC-CAPTACAO
- Instituto i10: https://institutoi10.com.br
