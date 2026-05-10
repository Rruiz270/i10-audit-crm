/**
 * Seed do projeto "Webinar FUNDEB Brasil 2026" no marketing engine.
 *
 * Cria:
 *   - 1 projeto
 *   - 14 templates (7 prefeito + 7 secretario, lidos de ../disparo-fundeb-brasil/emails/pre_inscricao/)
 *
 * NÃO importa contatos — isso é feito via UI (upload CSV) pra forçar revisão.
 *
 * Uso:
 *   DATABASE_URL=$DATABASE_URL_DEV node scripts/seed-marketing-fundeb.mjs
 *
 * Idempotente: se projeto já existe (mesmo slug), reutiliza. Templates são
 * upsertados por (projectId, name).
 */

import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

config({ path: '.env.local' });

const TARGET_URL = process.env.DATABASE_URL_DEV ?? process.env.DATABASE_URL;
if (!TARGET_URL) {
  console.error('Need DATABASE_URL_DEV or DATABASE_URL in env');
  process.exit(1);
}
if (TARGET_URL === process.env.DATABASE_URL && process.env.DATABASE_URL_DEV) {
  console.error('Refusing — DATABASE_URL is prod, set DATABASE_URL_DEV explicitly');
  process.exit(1);
}

const sql = neon(TARGET_URL);

const __dirname = dirname(fileURLToPath(import.meta.url));
const DISPARO_DIR = join(__dirname, '..', '..', 'disparo-fundeb-brasil');
const PRE_INSCRICAO_DIR = join(DISPARO_DIR, 'emails', 'pre_inscricao');

// Subjects extraídos dos arquivos (1ª aparição de <title> ou texto do hero)
function extractSubject(html, fallback) {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();
  return fallback;
}

function extractVariables(html) {
  const found = new Set();
  const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  for (const m of html.matchAll(re)) found.add(m[1]);
  return Array.from(found).sort();
}

async function main() {
  console.log('=== seed marketing FUNDEB ===');
  console.log('Target:', TARGET_URL.replace(/:[^@]+@/, ':***@'));

  // 1. Project (upsert por slug)
  const slug = 'webinar-fundeb-brasil-2026';
  const existingProject = await sql`SELECT id FROM marketing.projects WHERE slug = ${slug}`;
  let projectId;
  if (existingProject.length > 0) {
    projectId = existingProject[0].id;
    console.log(`Project already exists: id=${projectId}`);
  } else {
    const inserted = await sql`
      INSERT INTO marketing.projects (name, slug, description, status, settings)
      VALUES (
        'Webinar FUNDEB Brasil 2026',
        ${slug},
        'Captação de prefeitos e secretários para o webinar FUNDEB de mai/2026 — 4.923 munis (todos exceto SP, atendido pela APM)',
        'active',
        ${JSON.stringify({
          fromEmail: process.env.MARKETING_FROM_EMAIL ?? 'contato@institutoi10.org.br',
          fromName: process.env.MARKETING_FROM_NAME ?? 'Instituto i10',
          replyTo: process.env.MARKETING_REPLY_TO ?? 'contato@institutoi10.org.br',
        })}::jsonb
      )
      RETURNING id
    `;
    projectId = inserted[0].id;
    console.log(`Project created: id=${projectId}`);
  }

  // 2. Templates — 7 prefeito + 7 secretario
  const angles = ['prefeito', 'secretario'];
  let inserted = 0;
  let updated = 0;

  for (const angle of angles) {
    const dir = join(PRE_INSCRICAO_DIR, angle);
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.html'))
      .sort();
    for (const file of files) {
      const stage = basename(file, '.html'); // ex: '01_webinar_invite'
      const html = readFileSync(join(dir, file), 'utf8');
      const variables = extractVariables(html);
      const subject = extractSubject(
        html,
        `${stage.replace(/_/g, ' ')} — Webinar FUNDEB`,
      );
      const name = `${stage} (${angle})`;

      const existing = await sql`
        SELECT id FROM marketing.templates
        WHERE project_id = ${projectId} AND name = ${name}
      `;
      if (existing.length > 0) {
        await sql`
          UPDATE marketing.templates
          SET subject = ${subject},
              html = ${html},
              variables = ${variables}::text[],
              updated_at = NOW()
          WHERE id = ${existing[0].id}
        `;
        updated += 1;
      } else {
        await sql`
          INSERT INTO marketing.templates (
            project_id, channel, name, subject, html, variables, status
          ) VALUES (
            ${projectId}, 'email', ${name}, ${subject}, ${html},
            ${variables}::text[], 'active'
          )
        `;
        inserted += 1;
      }
    }
  }

  console.log(`Templates: ${inserted} inserted, ${updated} updated`);

  // Resumo
  const summary = await sql`
    SELECT
      (SELECT count(*) FROM marketing.projects WHERE id = ${projectId}) AS projects,
      (SELECT count(*) FROM marketing.templates WHERE project_id = ${projectId}) AS templates,
      (SELECT count(*) FROM marketing.audiences WHERE project_id = ${projectId}) AS audiences,
      (SELECT count(*) FROM marketing.campaigns WHERE project_id = ${projectId}) AS campaigns
  `;
  console.log('=== summary ===', summary[0]);

  console.log('');
  console.log('NEXT STEPS:');
  console.log(`1. Open http://localhost:3001/marketing/${projectId}`);
  console.log('2. /audiences → import disparo-fundeb-brasil/data/disparo-nao-sp.csv');
  console.log('3. /campaigns/new → criar E1 → dry-run → launch com limit=1 pra teste');
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
