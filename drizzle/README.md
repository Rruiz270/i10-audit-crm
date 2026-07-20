# Migrations versionadas (drizzle-kit)

O schema evolui por migrations SQL geradas e **committadas** — nada de `db:push`
nem scripts `migrate-*.mjs` ad-hoc (os que sobraram em `scripts/` são histórico
e também fazem *seed*; não os rode como migração).

Dois fluxos independentes, cada um com seu journal em `drizzle.*`:

| Fluxo     | Schema TS                     | Pasta                | Journal (tabela)                  | Env            |
|-----------|-------------------------------|----------------------|-----------------------------------|----------------|
| crm       | `src/lib/schema.ts`           | `drizzle/`           | `__drizzle_migrations_crm`        | `DATABASE_URL` |
| marketing | `src/lib/schema-marketing.ts` | `drizzle/marketing/` | `__drizzle_migrations_marketing`  | `DATABASE_URL_DEV` |

## Fluxo normal (a cada mudança de schema)

```bash
# 1. Edite src/lib/schema.ts (ou schema-marketing.ts)
# 2. Gere a migration e COMMITE o SQL + meta/
npm run db:generate            # ou db:generate:marketing
# 3. Aplique
npm run db:migrate             # ou db:migrate:marketing
```

O CI (`.github/workflows/ci.yml`) roda `drizzle-kit check` e falha se as
migrations committadas divergirem do schema.

## Banco existente (uma única vez)

Bancos criados na era do `db:push` já têm as tabelas — a `0000_baseline` não
deve ser executada neles, só registrada no journal:

```bash
npm run db:baseline            # crm (DATABASE_URL)
npm run db:baseline marketing  # marketing (DATABASE_URL_DEV)
```

Depois disso, `db:migrate` aplica apenas migrations novas. Em banco vazio,
rode `db:migrate` direto (a baseline cria tudo) e depois os seeds
(`npm run seed`, `node scripts/migrate-stages.mjs` para os estágios padrão).
