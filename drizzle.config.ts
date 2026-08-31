import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env.local' });
config({ path: '.env' });

export default defineConfig({
  schema: './src/lib/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  schemaFilter: ['crm'],
  // Journal próprio — o config de marketing usa outra tabela pra não misturar
  // os dois fluxos de migração (o migrator compara created_at da última linha).
  migrations: {
    table: '__drizzle_migrations_crm',
    schema: 'drizzle',
  },
  verbose: true,
  strict: true,
});
