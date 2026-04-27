// Orchestrator de simulação do CRM (i10-audit-crm).
// 3 cidades, ~15 cenas cada. Usa test-admin pra ter acesso a todas as áreas.
// Uso: node scripts/simulation/run-crm.mjs

import { chromium } from 'playwright';
import { neon } from '@neondatabase/serverless';
import { mkdir, writeFile, readFile, readdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROTEIROS } from './roteiros-crm.mjs';

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
const BASE_URL = process.env.SIMULATION_BASE_URL || 'http://localhost:3001';
const LOGIN_EMAIL = process.env.SIMULATION_EMAIL || 'admin@i10.crm';
const LOGIN_PASSWORD = process.env.SIMULATION_PASSWORD || 'admin2026';

const RUN_TS = `${new Date().toISOString().slice(0, 10)}-crm`;
const RUN_ROOT = resolve(REPO, '.simulation-runs', RUN_TS);

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
    SELECT id, nome, total_matriculas, receita_total, pot_total
    FROM fundeb.municipalities WHERE nome = ${name} LIMIT 1
  `;
  if (rows.length === 0) throw new Error(`Município não encontrado: ${name}`);
  const r = rows[0];
  return {
    id: r.id,
    nome: r.nome,
    totalMatriculas: r.total_matriculas,
    receitaTotal: r.receita_total,
    potTotal: r.pot_total,
  };
}

async function seedOpportunity(muni, ownerId = 'test-admin') {
  await sql`DELETE FROM crm.opportunities WHERE municipality_id = ${muni.id} AND notes LIKE 'SIMULAÇÃO CRM%'`;

  const opp = await sql`
    INSERT INTO crm.opportunities (municipality_id, owner_id, stage, source, estimated_value, close_date, notes, tags)
    VALUES (
      ${muni.id}, ${ownerId}, 'reuniao_auditoria', 'intake:apm-cadastro', 250000,
      ${new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()},
      'SIMULAÇÃO CRM — pode ser deletada. Lead promissor.',
      ARRAY['simulacao', 'fundeb-2026']::text[]
    )
    RETURNING id
  `;
  const oppId = opp[0].id;

  await sql`
    INSERT INTO crm.contacts (opportunity_id, name, role, email, phone, is_primary, notes)
    VALUES
      (${oppId}, 'Maria Silva (simulação)', 'Secretária de Educação',
       ${'secretaria@' + muni.nome.toLowerCase().replace(/\s/g, '') + '.gov.br'},
       '+5519999990000', true, 'Contato principal — interessada em melhorar captação FUNDEB'),
      (${oppId}, 'João Santos (simulação)', 'Diretor Financeiro', null, '+5519988880000', false, 'Apoio operacional')
  `;

  await sql`
    INSERT INTO crm.tasks (opportunity_id, title, description, due_at, assigned_to, created_by, priority)
    VALUES
      (${oppId}, 'Enviar diagnóstico preliminar', 'Compilar dados públicos + pré-análise',
       ${new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString()}, ${ownerId}, ${ownerId}, 'high'),
      (${oppId}, 'Follow-up pós reunião', 'Confirmar interesse e próximos passos',
       ${new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()}, ${ownerId}, ${ownerId}, 'normal')
  `;

  await sql`
    INSERT INTO crm.activities (opportunity_id, type, subject, body, actor_id, metadata)
    VALUES
      (${oppId}, 'call', 'Primeiro contato telefônico', 'Secretária mostrou interesse, pediu apresentação por email', ${ownerId}, '{}'::jsonb),
      (${oppId}, 'email', 'Diagnóstico preliminar enviado', 'PDF com 3 oportunidades T1, T2, T6 identificadas', ${ownerId}, '{}'::jsonb),
      (${oppId}, 'meeting', 'Reunião de auditoria realizada', 'Apresentação de 1h via Meet, secretária presente', ${ownerId}, '{}'::jsonb)
  `;

  return oppId;
}

async function cleanupOldSimulations() {
  await sql`DELETE FROM crm.opportunities WHERE notes LIKE 'SIMULAÇÃO CRM%'`;
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
    const o = el('div', 'position:fixed;top:12px;right:12px;z-index:99999;max-width:480px;min-width:320px;font-family:-apple-system,sans-serif;pointer-events:none;', document.body);
    o.id = 'sim-overlay';

    const bSecret = el('div', 'background:rgba(255,255,255,0.97);border-left:4px solid #00B4D8;padding:12px 14px;margin-bottom:8px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.15);display:none;', o);
    bSecret.id = 'sim-bubble-secret';
    const tagS = el('div', 'font-size:10px;font-weight:bold;color:#00B4D8;letter-spacing:1.5px;margin-bottom:4px;', bSecret);
    tagS.textContent = '🎓 CONSULTOR JUNIOR';
    const txtS = el('div', 'font-size:14px;color:#0A2463;line-height:1.4;', bSecret);
    txtS.id = 'sim-text-secret';

    const bResp = el('div', 'background:rgba(10,36,99,0.97);border-left:4px solid #00E5A0;padding:12px 14px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.15);display:none;', o);
    bResp.id = 'sim-bubble-resp';
    const tagR = el('div', 'font-size:10px;font-weight:bold;color:#00E5A0;letter-spacing:1.5px;margin-bottom:4px;', bResp);
    tagR.textContent = '👨‍💼 CONSULTOR SENIOR i10';
    const txtR = el('div', 'font-size:14px;color:white;line-height:1.4;', bResp);
    txtR.id = 'sim-text-resp';

    const lbl = el('div', 'margin-top:8px;text-align:right;font-size:11px;color:rgba(0,0,0,0.5);font-weight:600;', o);
    lbl.id = 'sim-stepLabel';
  })();
`;

function overlayUpdateScript(secret, resp, stepLabel) {
  return [
    "(function() {",
    "  const bSecret = document.getElementById('sim-bubble-secret');",
    "  const bResp = document.getElementById('sim-bubble-resp');",
    "  const tSecret = document.getElementById('sim-text-secret');",
    "  const tResp = document.getElementById('sim-text-resp');",
    "  const lbl = document.getElementById('sim-stepLabel');",
    "  if (!bSecret || !bResp) return;",
    "  bSecret.style.display = 'block';",
    "  bResp.style.display = 'none';",
    `  tSecret.textContent = ${JSON.stringify(secret)};`,
    `  lbl.textContent = ${JSON.stringify(stepLabel)};`,
    "  setTimeout(function() {",
    "    bResp.style.display = 'block';",
    `    tResp.textContent = ${JSON.stringify(resp)};`,
    "  }, 2200);",
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
      } else if (!a.optional) {
        throw new Error(`Elemento não visível: ${a.selector}`);
      }
    } else if (a.type === 'scroll') {
      await page.evaluate(({ y }) => window.scrollBy(0, y || 300), { y: a.y });
    }
  } catch (e) {
    if (!a.optional) throw e;
  }
}

async function loginAs(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  await emailInput.waitFor({ timeout: 8000 });
  await emailInput.fill(LOGIN_EMAIL);
  const passInput = page.locator('input[type="password"], input[name="password"]').first();
  await passInput.fill(LOGIN_PASSWORD);
  await passInput.press('Enter');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function runSimulation(roteiro, runDir, browser) {
  const muni = await enrichMuni(roteiro.municipalityName);
  log(`▶ Iniciando ${roteiro.cityLabel}: ${muni.nome}`);

  const cityDir = join(runDir, roteiro.cityKey);
  await ensureDir(cityDir);
  await ensureDir(join(cityDir, 'screenshots'));

  const opportunityId = await seedOpportunity(muni);
  log(`  opportunity #${opportunityId} seedada`);

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: cityDir, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();

  const transcript = [];
  const errors = [];
  const startTime = Date.now();

  try {
    await loginAs(page);
    await page.evaluate(OVERLAY_INIT);
    log(`  logado, overlay injetado`);

    const scenes = roteiro.buildScenes(muni, opportunityId);

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const url = scene.url.replace('{opportunityId}', String(opportunityId));
      const stepLabel = `Cena ${i + 1}/${scenes.length} · ${scene.id}`;
      log(`  ▷ ${stepLabel} → ${url}`);

      try {
        await page.goto(`${BASE_URL}${url}`, { waitUntil: 'networkidle', timeout: 20000 });
      } catch (e) {
        errors.push({ scene: scene.id, error: `nav: ${e.message}` });
      }

      await page.evaluate(OVERLAY_INIT).catch(() => {});
      await page.waitForTimeout(800);
      await page.evaluate(overlayUpdateScript(scene.secret, scene.resp, stepLabel)).catch(() => {});
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
        sceneId: scene.id, url, stepLabel,
        secretQuestion: scene.secret,
        consultorResponse: scene.resp,
        screenshotPre: `screenshots/${String(i + 1).padStart(2, '0')}-${scene.id}-pre.png`,
        screenshotPost: `screenshots/${String(i + 1).padStart(2, '0')}-${scene.id}-post.png`,
        ts: new Date().toISOString(),
      });

      await page.waitForTimeout(scene.pauseMs);
    }
  } catch (e) {
    errors.push({ scene: 'fatal', error: e.message, stack: e.stack });
    log(`  ✗ ERRO FATAL: ${e.message}`);
  } finally {
    await page.close();
    await context.close();
  }

  const files = await readdir(cityDir);
  const webm = files.find((f) => f.endsWith('.webm'));
  if (webm) await rename(join(cityDir, webm), join(cityDir, 'video.webm')).catch(() => {});

  const duration = (Date.now() - startTime) / 1000;
  log(`  ✓ ${roteiro.cityLabel}: ${duration.toFixed(0)}s, ${transcript.length} cenas, ${errors.length} erros`);

  await writeFile(
    join(cityDir, 'transcript.json'),
    JSON.stringify({ muni, opportunityId, scenes: transcript, errors, durationSec: duration }, null, 2),
  );

  return { roteiro, muni, opportunityId, transcript, errors, durationSec: duration };
}

async function main() {
  await ensureDir(RUN_ROOT);
  log(`Output: ${RUN_ROOT}`);
  await cleanupOldSimulations();

  const browser = await chromium.launch({ headless: true });

  const results = [];
  for (const roteiro of ROTEIROS) {
    try {
      const r = await runSimulation(roteiro, RUN_ROOT, browser);
      results.push(r);
    } catch (e) {
      log(`✗ Falhou ${roteiro.cityLabel}: ${e.message}`);
      results.push({ roteiro, error: e.message });
    }
  }

  await browser.close();

  const readme = [
    `# Simulações CRM ${RUN_TS}`,
    ``,
    ...results.map((r) => {
      if (r.error) return `- ❌ **${r.roteiro.cityLabel}**: ${r.error}`;
      return `- ✅ **${r.roteiro.cityLabel}** — ${r.transcript.length} cenas, ${r.errors.length} erros, ${r.durationSec.toFixed(0)}s`;
    }),
    ``,
  ].join('\n');
  await writeFile(join(RUN_ROOT, 'README.md'), readme);
  log(`\n✓ DONE. Tudo em ${RUN_ROOT}`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
