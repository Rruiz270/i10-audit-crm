import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env.local') });
config({ path: path.join(__dirname, '..', '.env') });

// Aplica as migrations versionadas no deploy (buildCommand do vercel.json).
// Roda APENAS em deploy de produção: preview builds de PR não tocam o banco,
// senão uma migration de branch não mergeada alteraria o schema de produção.
// Para forçar fora da Vercel (staging/local): DEPLOY_MIGRATE=1 npm run db:migrate:deploy

const vercelEnv = process.env.VERCEL_ENV ?? 'local';
if (vercelEnv !== 'production' && process.env.DEPLOY_MIGRATE !== '1') {
  console.log(
    `[db:migrate:deploy] pulado (VERCEL_ENV=${vercelEnv}) — ` +
      'migrations só rodam em deploy de produção; use DEPLOY_MIGRATE=1 para forçar.',
  );
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.error('[db:migrate:deploy] DATABASE_URL ausente — abortando o build.');
  process.exit(1);
}

function run(label, args, env = {}) {
  console.log(`[db:migrate:deploy] ${label}`);
  const r = spawnSync('npx', args, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) {
    console.error(`[db:migrate:deploy] falhou: ${label}`);
    process.exit(r.status ?? 1);
  }
}

// crm.* — journal drizzle.__drizzle_migrations_crm
run('crm → drizzle-kit migrate', ['drizzle-kit', 'migrate']);

// marketing.* — no deploy o alvo é o MESMO banco do runtime (DATABASE_URL).
// O guard DATABASE_URL_DEV do drizzle.config.marketing.ts vale para uso
// manual/local; aqui sobrescrevemos explicitamente para o banco do ambiente.
run(
  'marketing → drizzle-kit migrate',
  ['drizzle-kit', 'migrate', '--config', 'drizzle.config.marketing.ts'],
  { DATABASE_URL_DEV: process.env.DATABASE_URL },
);

console.log('[db:migrate:deploy] ok — schema em dia.');
