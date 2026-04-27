// Pós-simulação: copia vídeos + transcripts + screenshots pra public/treinamento/
// pra que o app sirva como /treinamento/videos/<cityKey>.webm etc.
//
// Roda DEPOIS de scripts/simulation/run.mjs

import { copyFile, readdir, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');

const RUN_TS = process.argv[2] || `${new Date().toISOString().slice(0, 10)}-noite`;
const SRC_ROOT = resolve(REPO, '.simulation-runs', RUN_TS);
const PUBLIC_ROOT = resolve(REPO, 'public', 'treinamento');

if (!existsSync(SRC_ROOT)) {
  console.error(`✗ Não encontrei ${SRC_ROOT}. Use: node scripts/simulation/publish.mjs <RUN_TS>`);
  process.exit(1);
}

async function ensureDir(p) {
  if (!existsSync(p)) await mkdir(p, { recursive: true });
}

const cities = await readdir(SRC_ROOT, { withFileTypes: true });
const cityDirs = cities.filter((d) => d.isDirectory()).map((d) => d.name);

await ensureDir(join(PUBLIC_ROOT, 'videos'));
await ensureDir(join(PUBLIC_ROOT, 'data'));

let copied = 0;
for (const cityKey of cityDirs) {
  const cityDir = join(SRC_ROOT, cityKey);

  // 1. Vídeo
  const webm = join(cityDir, 'video.webm');
  if (existsSync(webm)) {
    const dest = join(PUBLIC_ROOT, 'videos', `${cityKey}.webm`);
    await copyFile(webm, dest);
    console.log(`✓ video → ${dest}`);
    copied++;
  } else {
    console.log(`✗ ${cityKey}: video.webm não encontrado`);
  }

  // 2. Transcript JSON
  const json = join(cityDir, 'transcript.json');
  if (existsSync(json)) {
    const dest = join(PUBLIC_ROOT, 'data', `${cityKey}.json`);
    await copyFile(json, dest);
    console.log(`✓ transcript → ${dest}`);
    copied++;
  }

  // 3. Screenshots — copia o diretório inteiro
  const shotsDir = join(cityDir, 'screenshots');
  if (existsSync(shotsDir)) {
    const targetDir = join(PUBLIC_ROOT, 'data', cityKey, 'screenshots');
    await ensureDir(targetDir);
    const files = await readdir(shotsDir);
    for (const f of files) {
      await copyFile(join(shotsDir, f), join(targetDir, f));
    }
    console.log(`✓ ${files.length} screenshots → ${targetDir}`);
    copied++;
  }
}

console.log(`\n✓ Pronto: ${copied} arquivos copiados pra ${PUBLIC_ROOT}`);
