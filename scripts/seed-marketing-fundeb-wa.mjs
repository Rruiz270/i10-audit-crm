/**
 * Seed dos 5 templates WhatsApp do disparo-fundeb-brasil em marketing.templates.
 *
 * Lê whatsapp/templates.json e cria 5 templates channel='whatsapp' linkados
 * ao projeto "Webinar FUNDEB Brasil 2026" (id=1).
 *
 * Uso (dev):  DATABASE_URL_DEV=$URL node scripts/seed-marketing-fundeb-wa.mjs
 * Uso (prod): DATABASE_URL_DEV=$PROD_URL node scripts/seed-marketing-fundeb-wa.mjs
 *
 * Idempotente — upsert por (projectId, name).
 */

import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';

config({ path: '.env.local' });

const TARGET_URL = process.env.DATABASE_URL_DEV ?? process.env.DATABASE_URL;
if (!TARGET_URL) {
  console.error('Need DATABASE_URL_DEV or DATABASE_URL');
  process.exit(1);
}

const sql = neon(TARGET_URL);

const TEMPLATES_FILE =
  '/Users/raphaelruiz/Projects/disparo-fundeb-brasil/whatsapp/templates.json';

function extractVariables(text) {
  const found = new Set();
  const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  for (const m of text.matchAll(re)) found.add(m[1]);
  return Array.from(found).sort();
}

async function main() {
  console.log('=== seed WA templates ===');
  console.log('Target:', TARGET_URL.replace(/:[^@]+@/, ':***@'));

  // Project FUNDEB
  const proj = await sql`SELECT id FROM marketing.projects WHERE slug = 'webinar-fundeb-brasil-2026'`;
  if (proj.length === 0) {
    console.error('Project webinar-fundeb-brasil-2026 não encontrado. Rode seed-marketing-fundeb.mjs primeiro.');
    process.exit(1);
  }
  const projectId = proj[0].id;
  console.log('Project id:', projectId);

  const data = JSON.parse(readFileSync(TEMPLATES_FILE, 'utf8'));
  // landing_url é injetado em todas mensagens — mas eles usam template literal {{landing_url}}.
  // Vamos resolver no momento do envio via mergeVars.

  const wa_number = data.wa_i10_number;
  const landing_url = data.landing_url;

  let inserted = 0, updated = 0;
  for (const [key, tpl] of Object.entries(data.templates)) {
    const name = `WA_${key} (${tpl.audiencia})`;
    // Substitui {{landing_url}} pelo template literal real (assim aparece no body)
    const body = tpl.mensagem.replace(/\{\{\s*landing_url\s*\}\}/g, landing_url);
    const variables = extractVariables(body);

    const existing = await sql`SELECT id FROM marketing.templates WHERE project_id = ${projectId} AND name = ${name}`;
    if (existing.length > 0) {
      await sql`
        UPDATE marketing.templates
        SET text = ${body},
            variables = ${variables}::text[],
            updated_at = NOW()
        WHERE id = ${existing[0].id}
      `;
      updated++;
    } else {
      await sql`
        INSERT INTO marketing.templates (
          project_id, channel, name, text, variables, status
        ) VALUES (
          ${projectId}, 'whatsapp', ${name}, ${body},
          ${variables}::text[], 'active'
        )
      `;
      inserted++;
    }
  }

  console.log(`WA templates: ${inserted} inserted, ${updated} updated`);
  console.log(`i10 WhatsApp number: ${wa_number}`);
  console.log(`Landing URL: ${landing_url}`);

  const totals = await sql`
    SELECT channel, count(*)::int AS c
    FROM marketing.templates
    WHERE project_id = ${projectId}
    GROUP BY channel
    ORDER BY channel
  `;
  console.log('Totals por channel:', totals);
}

main().catch((e) => { console.error('FAIL:', e); process.exit(1); });
