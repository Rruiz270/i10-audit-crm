# Scripts aposentados (era pré-migrations)

Os `migrate-*.mjs` desta pasta são da era do `drizzle-kit push` + DDL ad-hoc.
**Não os rode como migração** — todo o DDL que eles criavam já está coberto pela
`drizzle/0000_baseline.sql`, e o schema agora evolui exclusivamente por
migrations versionadas (`npm run db:generate` → `npm run db:migrate`, ver
`drizzle/README.md`).

Ficam aqui por dois motivos:

- **Histórico** — documentam como cada tabela surgiu.
- **Seed** — alguns também populam dados padrão e ainda são úteis num banco
  recém-criado:
  - `migrate-stages.mjs` — estágios padrão do pipeline (`crm.pipeline_stages`)
  - `migrate-tags.mjs` — tags padrão (`is_custom=false`)
  - `migrate-inbox-powerups.mjs` — respostas prontas globais (`canned_responses`)
  - `migrate-wa-funnel.mjs` — backfill de `read_count`/`replied_count` a partir
    de `marketing.events`

Para mudanças de schema, NUNCA adicione scripts aqui — edite
`src/lib/schema.ts`/`schema-marketing.ts` e gere a migration.
