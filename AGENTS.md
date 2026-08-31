<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# i10 Audit CRM

CRM do Instituto i10 para captação de leads de municípios e handoff para o sistema de consultoria BNCC-CAPTACAO; inclui pipeline de oportunidades, agenda via Google Calendar, motor de marketing (sequências/WhatsApp) e um app de atendimento (`/atende`).

> `CLAUDE.md` apenas referencia este arquivo (`@AGENTS.md`) — mantenha a documentação aqui, sem duplicar.

## Stack

- **Linguagem:** TypeScript 5
- **Framework:** Next.js 16.2.4 (App Router, Server Actions) + React 19.2.4
- **Banco:** Neon Postgres (driver `@neondatabase/serverless`) + Drizzle ORM. **Mesmo DB do BNCC-CAPTACAO**; este projeto usa o schema `crm.*` (mais um schema `marketing`)
- **Auth:** Auth.js v5 (NextAuth beta) com Google OAuth (escopo Calendar); senhas via `bcryptjs`
- **UI:** Tailwind CSS v4 + Radix UI + `lucide-react` + `sonner`; drag-and-drop via `@dnd-kit`; forms via `react-hook-form` + `zod`
- **Integrações:** Google Calendar/APIs (`googleapis`), Twilio (WhatsApp), AWS SES, Vercel Blob, web-push, ffmpeg-static
- **Deploy:** Vercel (auto-deploy da `main`) com 3 crons de marketing
- **Package manager:** npm (`package-lock.json`)

## Comandos

- `npm run dev` — dev server (http://localhost:3000)
- `npm run build` / `npm start` — build e serve de produção
- `npm run lint` — ESLint (`eslint.config.mjs`, `eslint-config-next`)
- `npm run typecheck` — `tsc --noEmit`
- `npm test` / `npm run test:watch` — Vitest
- `npm run test:usecases` — `scripts/test-usecases.mjs`
- **Banco (Drizzle):**
  - `npm run db:generate` / `db:generate:marketing` — gera SQL (schema `crm` vs `marketing`)
  - `npm run db:migrate` / `db:migrate:marketing` — aplica migrations
  - `npm run db:studio` — Drizzle Studio
  - `npm run db:baseline`, `db:check` — scripts utilitários
  - `npm run seed`, `seed:test-accounts` — popular dados

## Estrutura

- `src/app/` — App Router. Grupos `(app)` (CRM protegido) e `(atende)` (app de atendimento WhatsApp); `api/`, `apm/`, `intake/`, `proposta/`, `login/`, `signup/`, `u/`
- `src/lib/` — `schema.ts` (Drizzle, fonte das migrations), `pipeline.ts` (estágios), `handoff.ts` (escreve em `fundeb.consultorias` ao ganhar), auth, integrações
- `src/components/`, `src/proxy.ts`
- `drizzle/` — migrations SQL (`0000_baseline.sql`, subpastas `marketing/`, `meta/`); dois journals separados (`__drizzle_migrations_crm` vs marketing)
- `drizzle.config.ts` (schema `crm`) e `drizzle.config.marketing.ts`
- `scripts/` — seeds, backfills, testes de WhatsApp; `legacy/` guarda os antigos `migrate-*.mjs` (aposentados — schema evolui só via migrations Drizzle)
- `tests/`, `vercel.json` (crons), `README.md`, `BLUEPRINT_RESULT.md`, `USECASE_REPORT.md`

## Convenções de código

- TypeScript; ESLint via `eslint-config-next`. Rode `npm run lint` e `npm run typecheck` antes de commitar.
- **Drizzle:** o schema é definido em `src/lib/schema.ts` — nunca editar SQL de migration à mão; rode `db:generate` e versione o SQL gerado. Fluxos `crm` e `marketing` têm configs e journals separados; não misture.
- Handoff para BNCC-CAPTACAO acontece em `src/lib/handoff.ts` quando a oportunidade chega ao estágio "Ganhou" — cuidado ao mexer nos estágios de `src/lib/pipeline.ts`.
- `serverExternalPackages: ['ffmpeg-static']` e `serverActions.bodySizeLimit: '16mb'` no `next.config.ts` — não remover (binário nativo + upload de anexos WhatsApp).

## Variáveis de ambiente

Copie `.env.example` para `.env.local`. Nunca commite valores. Em produção, configure na Vercel.

- `DATABASE_URL` — mesmo Neon URL do BNCC-CAPTACAO (DB compartilhado)
- `AUTH_SECRET` — `openssl rand -base64 32`
- `AUTH_URL` — ex. `http://localhost:3000`
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — OAuth 2.0 (redirect `…/api/auth/callback/google`; escopo `calendar.events`)
- `GOOGLE_CALENDAR_DEFAULT_TIMEZONE` — ex. `America/Sao_Paulo`
- `ADMIN_EMAILS` — e-mails autorizados a entrar sem convite (CSV)

Integrações adicionais (Twilio/SES/Blob/web-push) exigem suas próprias envs — confira o código antes de habilitar.

## CI/CD & Deploy

- **Deploy:** Vercel — push na `main` = produção; PRs geram preview. `vercel.json` define os crons de marketing e o `buildCommand` (`npm run build:deploy`), que aplica as migrations Drizzle (`scripts/db-migrate-deploy.mjs`) antes do `next build` — só em deploy de produção; previews não tocam o banco.
- **CI:** `.github/workflows/ci.yml` roda `drizzle-kit check` (crm + marketing) em PRs e na `main`. Recomendado ampliar com: `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`.

## Boas práticas de PR

- Branch naming: `feat/…`, `fix/…`, `chore/…`.
- Conventional Commits.
- PRs pequenos. Checklist: build passa, lint + typecheck limpos, testes verdes, **sem segredos no diff**, migrations Drizzle geradas (não escritas à mão) e com caminho de rollback, screenshots para mudanças de UI.
- ≥1 review, squash merge, `main` sempre deployável.

## Testes

- **Unitários/integração:** Vitest (`npm test`).
- **Casos de uso:** `npm run test:usecases`.
- **Playwright** está instalado (devDependency) para e2e — verifique `tests/` para specs existentes.
- Cubra novas regras de pipeline/handoff com testes, pois afetam dados de produção compartilhados.

## Segurança & dados

- **DB compartilhado com BNCC-CAPTACAO:** só escreva em `crm.*`/`marketing`. Nunca altere `fundeb.*` fora do contrato de handoff.
- Nunca commitar `.env.local`, `AUTH_SECRET`, credenciais Google/Twilio/SES.
- **LGPD:** o CRM guarda dados pessoais de contatos/leads (nome, e-mail, telefone). Trate exports e logs com cuidado; não vaze PII em fixtures/seeds.
- Revisar dependências antes de atualizar (`next-auth` beta, `googleapis`, `twilio`).

## Gotchas

- Dois fluxos de migração Drizzle (crm/marketing) com journals distintos — usar o config correto (`db:*:marketing` para marketing).
- `next-auth` está em **beta** (`5.0.0-beta.*`); mudanças de API entre betas são possíveis.
- Crons rodam a cada minuto em produção — cuidado ao mexer nas rotas `/api/marketing/cron/*`.
- Upload de anexos usa Server Action com limite de 16MB (teto de mídia do WhatsApp); não baixe o `bodySizeLimit`.
- App tem seed de demo em produção (`/atende`) — limpar com seed `--clean` conforme necessário.
