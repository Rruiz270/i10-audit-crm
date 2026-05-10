import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env.local' });
config({ path: '.env' });

// Drizzle config separado para marketing.* — schemaFilter garante que
// migrations geradas/aplicadas NUNCA tocam crm.* ou fundeb.*.
//
// **Por padrão usa DATABASE_URL_DEV** (Neon dev branch) p/ proteger prod
// contra migration acidental. Para promover, faça:
//   DATABASE_URL_DEV=<prod-url> npx drizzle-kit push --config drizzle.config.marketing.ts
// (explicitamente sobrescreve o env var no comando)
//
// Comandos:
//   npx drizzle-kit generate --config drizzle.config.marketing.ts
//   npx drizzle-kit push --config drizzle.config.marketing.ts
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
  verbose: true,
  strict: true,
});
