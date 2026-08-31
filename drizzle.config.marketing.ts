import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env.local' });
config({ path: '.env' });

// Drizzle config separado para marketing.* — schemaFilter garante que
// migrations geradas/aplicadas NUNCA tocam crm.* ou fundeb.*.
//
// **Por padrão usa DATABASE_URL_DEV** (Neon dev branch) p/ proteger prod
// contra migration acidental. Em produção, quem promove é o deploy da Vercel
// (scripts/db-migrate-deploy.mjs), que aponta explicitamente para o banco do
// ambiente. Para promover à mão:
//   DATABASE_URL_DEV=<prod-url> npm run db:migrate:marketing
//
// Comandos:
//   npm run db:generate:marketing
//   npm run db:migrate:marketing
//   npx drizzle-kit studio --config drizzle.config.marketing.ts

const url = process.env.DATABASE_URL_DEV;
if (!url) {
  throw new Error(
    'DATABASE_URL_DEV is required for marketing migrations — ' +
      'this guards against accidental prod migrations. ' +
      'Set DATABASE_URL_DEV in .env.local pointing to Neon dev branch.',
  );
}

export default defineConfig({
  schema: './src/lib/schema-marketing.ts',
  out: './drizzle/marketing',
  dialect: 'postgresql',
  dbCredentials: { url },
  schemaFilter: ['marketing'],
  // Journal separado do crm (drizzle.config.ts) — cada fluxo tem sua tabela.
  migrations: {
    table: '__drizzle_migrations_marketing',
    schema: 'drizzle',
  },
  verbose: true,
  strict: true,
});
