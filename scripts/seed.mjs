import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env.local') });

const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

const DEFAULT_FORM = {
  slug: 'fundeb',
  title: 'Fale com a equipe i10',
  description:
    'Diagnóstico gratuito sobre transferências do FUNDEB (VAAT/VAAR) para sua prefeitura. Responda em menos de 1 minuto.',
  fields_schema: [
    {
      name: 'name',
      label: 'Seu nome',
      type: 'text',
      required: true,
    },
    {
      name: 'role',
      label: 'Cargo (Secretário, Prefeito, Técnico, …)',
      type: 'text',
    },
    {
      name: 'email',
      label: 'Email institucional',
      type: 'email',
      required: true,
    },
    {
      name: 'whatsapp',
      label: 'WhatsApp',
      type: 'phone',
    },
    {
      name: 'municipality',
      label: 'Município',
      type: 'municipality',
      required: true,
      help: 'Digite o nome exato da cidade (como em IBGE).',
    },
    {
      name: 'message',
      label: 'Como podemos ajudar?',
      type: 'textarea',
      help: 'Opcional — conte o contexto em poucas palavras.',
    },
  ],
};

const existing = await sql`SELECT id FROM crm.lead_forms WHERE slug = ${DEFAULT_FORM.slug}`;
if (existing.length) {
  await sql`UPDATE crm.lead_forms
      SET title = ${DEFAULT_FORM.title},
          description = ${DEFAULT_FORM.description},
          fields_schema = ${JSON.stringify(DEFAULT_FORM.fields_schema)}::jsonb,
          is_active = true
      WHERE slug = ${DEFAULT_FORM.slug}`;
  console.log(`Updated lead form "${DEFAULT_FORM.slug}" (#${existing[0].id})`);
} else {
  const [row] = await sql`INSERT INTO crm.lead_forms (slug, title, description, fields_schema, is_active)
      VALUES (${DEFAULT_FORM.slug}, ${DEFAULT_FORM.title}, ${DEFAULT_FORM.description},
              ${JSON.stringify(DEFAULT_FORM.fields_schema)}::jsonb, true)
      RETURNING id`;
  console.log(`Created lead form "${DEFAULT_FORM.slug}" (#${row.id})`);
}

// Ensure at least one admin exists for the session tests.
const adminEmail = (process.env.ADMIN_EMAILS ?? '').split(',')[0]?.trim().toLowerCase();
if (adminEmail) {
  const u = await sql`SELECT id FROM crm.users WHERE email = ${adminEmail}`;
  if (u.length === 0) {
    await sql`INSERT INTO crm.users (id, email, name, role, is_active)
        VALUES (${`seed-${Date.now()}`}, ${adminEmail}, 'Admin i10', 'admin', true)`;
    console.log(`Seeded admin user ${adminEmail}`);
  } else {
    await sql`UPDATE crm.users SET role = 'admin', is_active = true WHERE email = ${adminEmail}`;
    console.log(`Ensured admin role on ${adminEmail}`);
  }
}

console.log('Seed done.');
