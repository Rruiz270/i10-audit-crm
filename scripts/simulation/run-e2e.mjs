// E2E orchestrator: APM (CRM :3001) → CRM (CRM :3001) → BNCC (BNCC :3000).
// Single browser context que alterna entre os hosts, mantendo cookies separados
// (gate APM no CRM, sessão CRM no CRM, sessão BNCC no BNCC).
//
// Uso: node scripts/simulation/run-e2e.mjs

import { chromium } from 'playwright';
import { neon } from '@neondatabase/serverless';
import { mkdir, writeFile, readFile, readdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildE2EScenes } from './roteiros-e2e.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');

const envFile = resolve(REPO, '.env.local');
try {
  const c = await readFile(envFile, 'utf-8');
  for (const line of c.split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]+)"?$/);
    if (m) process.env[m[1]] = m[2];
  }
} catch {}

const DATABASE_URL = process.env.DATABASE_URL;
const CRM_BASE = 'http://localhost:3001';
const BNCC_BASE = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@i10.crm';
const ADMIN_PASSWORD = 'admin2026';
const CONSULTOR_EMAIL = 'consultor@i10.crm';
const CONSULTOR_PASSWORD = 'consultor2026';

const RUN_TS = `${new Date().toISOString().slice(0, 10)}-e2e`;
const RUN_ROOT = resolve(REPO, '.simulation-runs', RUN_TS);
const CITY_KEY = 'e2e-paulinia';

const sql = neon(DATABASE_URL);

function log(msg, ...rest) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`, ...rest);
}

async function ensureDir(p) {
  if (!existsSync(p)) await mkdir(p, { recursive: true });
}

async function enrichMuni(name) {
  const rows = await sql`
    SELECT id, nome, total_matriculas, receita_total, pot_total, vaar
    FROM fundeb.municipalities WHERE nome = ${name} LIMIT 1
  `;
  const r = rows[0];
  return {
    id: r.id,
    nome: r.nome,
    totalMatriculas: r.total_matriculas,
    receitaTotal: r.receita_total,
    potTotal: r.pot_total,
    recebeVaar: (r.vaar ?? 0) > 0,
    vaarBanco: r.vaar,
  };
}

async function seedFullChain(muni) {
  // Cleanup anteriores
  await sql`DELETE FROM crm.opportunities WHERE notes LIKE 'SIMULAÇÃO E2E%'`;
  await sql`DELETE FROM fundeb.consultorias WHERE notes LIKE 'SIMULAÇÃO E2E%'`;

  // 1. opportunity no CRM (estágio "ganhou" pra mostrar handoff)
  const opp = await sql`
    INSERT INTO crm.opportunities (municipality_id, owner_id, stage, source, estimated_value, close_date, contract_signed, notes, tags, won_at)
    VALUES (
      ${muni.id}, 'test-admin', 'ganhou', 'intake:apm-cadastro', 280000,
      NOW(), true,
      'SIMULAÇÃO E2E — pode ser deletada. Lead da APM virou contrato fechado.',
      ARRAY['simulacao', 'e2e']::text[],
      NOW()
    )
    RETURNING id
  `;
  const oppId = opp[0].id;

  // Contatos
  await sql`
    INSERT INTO crm.contacts (opportunity_id, name, role, email, phone, is_primary)
    VALUES
      (${oppId}, 'Maria Silva (E2E)', 'Secretária de Educação',
       ${'secretaria@' + muni.nome.toLowerCase().replace(/\s/g, '') + '.gov.br'},
       '+5519999990000', true)
  `;

  // 2. consultoria no BNCC (handoff já feito)
  const cons = await sql`
    INSERT INTO fundeb.consultorias
      (municipality_id, status, assigned_consultor_id, assigned_at, notes, consultant_name, secretary_name, start_date, end_date)
    VALUES (
      ${muni.id}, 'active', 'test-consultor', NOW(),
      'SIMULAÇÃO E2E — pode ser deletada. Originada pelo handoff do CRM.',
      'Consultor Sênior (E2E)',
      'Maria Silva',
      NOW(),
      ${new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()}
    )
    RETURNING id
  `;
  const consId = cons[0].id;

  // Linka opportunity → consultoria (handoff completado)
  await sql`
    UPDATE crm.opportunities
    SET handed_off_consultoria_id = ${consId}, handed_off_at = NOW()
    WHERE id = ${oppId}
  `;

  return { oppId, consId };
}

const OVERLAY_INIT = `
  (function() {
    const existing = document.getElementById('sim-overlay');
    if (existing) existing.remove();
    function el(tag, css, parent) {
      const e = document.createElement(tag);
      if (css) e.style.cssText = css;
      if (parent) parent.appendChild(e);
      return e;
    }
    const o = el('div', 'position:fixed;top:12px;right:12px;z-index:99999;max-width:480px;min-width:340px;font-family:-apple-system,sans-serif;pointer-events:none;', document.body);
    o.id = 'sim-overlay';
    const bSecret = el('div', 'background:rgba(255,255,255,0.97);border-left:4px solid #00B4D8;padding:14px 16px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.15);display:none;', o);
    bSecret.id = 'sim-bubble-secret';
    const tagS = el('div', 'font-size:11px;font-weight:bold;color:#00B4D8;letter-spacing:1.5px;margin-bottom:6px;', bSecret);
    tagS.id = 'sim-tag-secret';
    const txtS = el('div', 'font-size:14px;color:#0A2463;line-height:1.5;', bSecret);
    txtS.id = 'sim-text-secret';
    const lbl = el('div', 'margin-top:8px;text-align:right;font-size:11px;color:rgba(0,0,0,0.5);font-weight:600;', o);
    lbl.id = 'sim-stepLabel';
  })();
`;

function overlayUpdate(actorTag, text, stepLabel) {
  return [
    "(function() {",
    "  const bSecret = document.getElementById('sim-bubble-secret');",
    "  const tagS = document.getElementById('sim-tag-secret');",
    "  const tSecret = document.getElementById('sim-text-secret');",
    "  const lbl = document.getElementById('sim-stepLabel');",
    "  if (!bSecret) return;",
    "  bSecret.style.display = 'block';",
    `  tagS.textContent = ${JSON.stringify(actorTag)};`,
    `  tSecret.textContent = ${JSON.stringify(text)};`,
    `  lbl.textContent = ${JSON.stringify(stepLabel)};`,
    "})();",
  ].join('\n');
}

async function performAction(page, a) {
  try {
    if (a.type === 'wait') await page.waitForTimeout(a.ms);
    else if (a.type === 'click') {
      const loc = page.locator(a.selector).first();
      if (await loc.count() > 0 && await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
        await loc.click({ timeout: 3000 }).catch((e) => { if (!a.optional) throw e; });
      } else if (!a.optional) throw new Error(`Elemento não visível: ${a.selector}`);
    } else if (a.type === 'fill') {
      const loc = page.locator(a.selector).first();
      if (await loc.count() > 0) {
        await loc.fill(a.value, { timeout: 3000 });
      } else if (!a.optional) throw new Error(`Input não encontrado: ${a.selector}`);
    } else if (a.type === 'scroll') {
      await page.evaluate(({ y }) => window.scrollBy(0, y || 300), { y: a.y });
    }
  } catch (e) {
    if (!a.optional) throw e;
  }
}

async function loginCrm(page) {
  await page.goto(`${CRM_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const email = page.locator('input[type="email"], input[name="email"]').first();
  await email.waitFor({ state: 'visible', timeout: 30000 });
  await email.fill(ADMIN_EMAIL);
  const pass = page.locator('input[type="password"], input[name="password"]').first();
  await pass.waitFor({ state: 'visible', timeout: 5000 });
  await pass.fill(ADMIN_PASSWORD);
  await pass.press('Enter');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function loginBncc(page) {
  await page.goto(`${BNCC_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Espera o input email aparecer (até 30s pra acomodar primeira compilação)
  const email = page.locator('input[type="email"], input[name="email"]').first();
  await email.waitFor({ state: 'visible', timeout: 30000 });
  await email.fill(CONSULTOR_EMAIL);
  const pass = page.locator('input[type="password"], input[name="password"]').first();
  await pass.waitFor({ state: 'visible', timeout: 5000 });
  await pass.fill(CONSULTOR_PASSWORD);
  await pass.press('Enter');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function main() {
  await ensureDir(RUN_ROOT);
  log(`Output: ${RUN_ROOT}`);

  const muni = await enrichMuni('Paulínia');
  const { oppId, consId } = await seedFullChain(muni);
  log(`▶ E2E Paulínia: opp=#${oppId} cons=#${consId} muni=#${muni.id}`);

  const cityDir = join(RUN_ROOT, CITY_KEY);
  await ensureDir(cityDir);
  await ensureDir(join(cityDir, 'screenshots'));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: cityDir, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();

  // Login uma vez — cookies do NextAuth (localhost) já vazam entre :3000 e :3001
  // como o BNCC e o CRM compartilham crm.users, qualquer usuário aprovado
  // serve. Vou logar como admin (acessa tudo nos dois apps).
  await loginCrm(page);
  log('  CRM logado (cookie vaza pro BNCC)');
  // Verifica se o BNCC reconhece a sessão:
  await page.goto(`${BNCC_BASE}/portfolio`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  if (page.url().includes('/login')) {
    log('  BNCC pediu login — fazendo loginBncc');
    await loginBncc(page);
  } else {
    log('  BNCC já reconhece sessão');
  }

  const transcript = [];
  const errors = [];
  const startTime = Date.now();
  const scenes = buildE2EScenes(muni, oppId, consId);

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const baseUrl = scene.base === 'bncc' ? BNCC_BASE : CRM_BASE;
    const url = scene.url
      .replace('{opportunityId}', String(oppId))
      .replace('{consultoriaId}', String(consId));
    const stepLabel = `Cena ${i + 1}/${scenes.length} · ${scene.id} · ${scene.base.toUpperCase()}`;
    log(`  ▷ ${stepLabel} → ${baseUrl}${url}`);

    try {
      await page.goto(`${baseUrl}${url}`, { waitUntil: 'networkidle', timeout: 20000 });
    } catch (e) {
      errors.push({ scene: scene.id, error: `nav: ${e.message}` });
    }

    await page.evaluate(OVERLAY_INIT).catch(() => {});
    await page.waitForTimeout(800);
    await page.evaluate(overlayUpdate(scene.who.secret, scene.secret, stepLabel)).catch(() => {});
    await page.waitForTimeout(2500);

    const shotPre = join(cityDir, 'screenshots', `${String(i + 1).padStart(2, '0')}-${scene.id}-pre.png`);
    await page.screenshot({ path: shotPre, fullPage: false }).catch(() => {});

    for (const action of scene.actions || []) {
      try { await performAction(page, action); }
      catch (e) { errors.push({ scene: scene.id, error: `action: ${e.message}` }); }
    }

    const shotPost = join(cityDir, 'screenshots', `${String(i + 1).padStart(2, '0')}-${scene.id}-post.png`);
    await page.screenshot({ path: shotPost, fullPage: false }).catch(() => {});

    transcript.push({
      sceneId: scene.id,
      url: `${scene.base}:${url}`,
      stepLabel,
      secretQuestion: scene.secret,
      consultorResponse: scene.who.secret,
      screenshotPre: `screenshots/${String(i + 1).padStart(2, '0')}-${scene.id}-pre.png`,
      screenshotPost: `screenshots/${String(i + 1).padStart(2, '0')}-${scene.id}-post.png`,
      ts: new Date().toISOString(),
    });

    await page.waitForTimeout(scene.pauseMs);
  }

  await page.close();
  await context.close();

  const files = await readdir(cityDir);
  const webm = files.find((f) => f.endsWith('.webm'));
  if (webm) await rename(join(cityDir, webm), join(cityDir, 'video.webm')).catch(() => {});

  await browser.close();

  const duration = (Date.now() - startTime) / 1000;
  log(`\n✓ E2E: ${duration.toFixed(0)}s, ${transcript.length} cenas, ${errors.length} erros`);

  await writeFile(
    join(cityDir, 'transcript.json'),
    JSON.stringify({ muni, oppId, consId, scenes: transcript, errors, durationSec: duration }, null, 2),
  );

  log(`\n✓ DONE. Tudo em ${cityDir}`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
