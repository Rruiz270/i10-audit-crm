// Exporta as artes de e-mail da campanha como HTML navegável, com as
// variáveis preenchidas por um município de exemplo — é o que o presidente
// de câmara vê na caixa de entrada.
//
//   node scripts/impositivas/exportar-artes.mjs [pasta-destino]
import { config } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '..', '.env.local') });

const { neon } = await import('@neondatabase/serverless');
const sql = neon((process.env.DATABASE_URL ?? '').trim().replace(/^["']|["']$/g, ''));

const OUT = process.argv[2] ?? '/Users/raphaelruiz/Downloads/impositivas-sp-artes-email';
fs.mkdirSync(OUT, { recursive: true });

const LP = 'https://www.institutoi10.com.br/impositivas-sp';
const EXEMPLO = {
  presidente: 'Eder do Nascimento Ruete',
  primeiro_nome: 'Eder',
  nome: 'Eder do Nascimento Ruete',
  municipio: 'Adamantina',
  camara: 'Câmara Municipal de Adamantina',
  link_lp: LP,
  link_aula: `${LP}/aula`,
  link_apresentacao: `${LP}/apresentacao`,
  link_whatsapp: 'https://wa.me/5511947223906',
  unsubscribe_url: '#descadastro',
};

// Descritivo de cada peça: quando sai, para quem e qual o papel dela.
const FICHA = {
  'E1 · Abertura — TCE aponta impropriedades': {
    ordem: '01',
    quando: 'seg 31/08',
    publico: '957 e-mails · todas as 645 câmaras',
    papel:
      'Abre a campanha. Entra pela citação literal de uma impropriedade em relatório de fiscalização e informa que o prazo da Resolução 17/2025 já venceu.',
  },
  'W1 · WhatsApp abertura (cold)': {
    ordem: '02',
    quando: 'ter 01/09',
    publico: '390 celulares válidos',
    papel: 'Reforça o e-mail no WhatsApp. Modelo aprovado pela Meta, com botões de resposta rápida.',
  },
  'E2 · Três pontos que passam batido': {
    ordem: '03',
    quando: 'ter 08/09',
    publico: 'base menos Trilha A e descadastrados',
    papel:
      'Conteúdo de igual para igual: regime opcional, paradoxo do objeto genérico e o rastro que se rompe no empenho. Não explica o básico.',
  },
  'E3 · Três instâncias + autodiagnóstico': {
    ordem: '04',
    quando: 'seg 14/09',
    publico: 'base menos Trilha A e descadastrados',
    papel: 'STF, MP-SP e TCE-SP, e o checklist em cinco perguntas para a Casa responder internamente.',
  },
  'Trilha A · A1 — convite à sessão de 30 min': {
    ordem: '05',
    quando: 'automático · 1 dia após engajar',
    publico: 'quem clicou, baixou, se inscreveu ou respondeu',
    papel: 'Primeira peça da régua quente. Convite para a sessão de diagnóstico.',
  },
  'Trilha A · A2 — checklist em 1 página': {
    ordem: '06',
    quando: 'automático · 3 dias após o A1',
    publico: 'Trilha A que ainda não agendou',
    papel: 'Retoma com o material e repete o convite.',
  },
  'Trilha B · B1 — duas perguntas diretas': {
    ordem: '07',
    quando: 'qui 17/09',
    publico: 'frios (recebeu e não clicou)',
    papel: 'Reativação: duas perguntas do checklist que já viraram apontamento.',
  },
  'Trilha B · B2 — emendas que ficam na mesa': {
    ordem: '08',
    quando: 'qui 24/09',
    publico: 'frios',
    papel: 'Reativação pelo custo de não regulamentar — o que fica na mesa dos dois lados.',
  },
  'B3 · WhatsApp urgência (reativação)': {
    ordem: '09',
    quando: 'qui 01/10',
    publico: 'frios com celular',
    papel: 'Último toque no WhatsApp. Modelo aprovado pela Meta.',
  },
  'Trilha B · B4 — encerramento do ciclo': {
    ordem: '10',
    quando: 'qui 08/10',
    publico: 'frios',
    papel: 'Fecha o ciclo com prazo: as sessões de diagnóstico do semestre estão sendo encerradas.',
  },
};

const render = (tpl, vars) =>
  tpl.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
const slug = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
   .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const rows = await sql`
  SELECT t.name, t.subject, t.html, t.text, t.channel, t.wa_template_name
  FROM marketing.templates t
  JOIN marketing.projects p ON p.id = t.project_id
  WHERE p.slug = 'impositivas-sp' AND t.status = 'active'
  ORDER BY t.id`;

const pecas = [];
for (const t of rows) {
  const ficha = FICHA[t.name];
  if (!ficha) continue;
  const arquivo = `${ficha.ordem}-${slug(t.name)}.html`;
  if (t.channel === 'email') {
    fs.writeFileSync(path.join(OUT, arquivo), render(t.html, EXEMPLO));
  } else {
    // WhatsApp não tem HTML: montamos a prévia da bolha como o destinatário vê.
    const corpo = render(t.text ?? '', { ...EXEMPLO, 1: EXEMPLO.primeiro_nome, 2: EXEMPLO.municipio })
      .replace(/\{\{1\}\}/g, EXEMPLO.primeiro_nome)
      .replace(/\{\{2\}\}/g, EXEMPLO.municipio);
    fs.writeFileSync(
      path.join(OUT, arquivo),
      `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${t.name}</title>
<style>body{margin:0;background:#e5ddd5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:30px}
.phone{max-width:400px;margin:0 auto;background:#e5ddd5;border-radius:20px;border:1px solid #cfc7bd;overflow:hidden}
.top{background:#075e54;color:#fff;padding:12px 16px;font-weight:700;font-size:14px}
.chat{padding:16px 12px}
.bub{background:#fff;border-radius:10px;padding:12px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;box-shadow:0 1px 1px rgba(0,0,0,.08)}
.btn{border-top:1px solid #eee;margin-top:10px;padding-top:9px;text-align:center;color:#0a7cff;font-weight:700;font-size:13px}</style></head>
<body><div class="phone"><div class="top">Instituto i10</div><div class="chat"><div class="bub">${corpo}
<div class="btn">Quero o material</div><div class="btn">Falar com especialista</div></div></div></div></body></html>`,
    );
  }
  pecas.push({ ...ficha, nome: t.name, arquivo, canal: t.channel, assunto: t.subject });
}

pecas.sort((a, b) => a.ordem.localeCompare(b.ordem));

const index = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Artes de e-mail · Campanha Impositivas SP</title>
<style>
 body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#eef2f6;color:#13202e;margin:0;line-height:1.55}
 .wrap{max-width:900px;margin:0 auto;padding:32px 22px 70px}
 h1{font-size:25px;font-weight:800;letter-spacing:-.4px}
 .sub{color:#5b6b7c;font-size:14.5px;margin:6px 0 26px;max-width:640px}
 .peca{background:#fff;border:1px solid #e2e9f0;border-radius:14px;padding:18px 20px;margin-bottom:12px;display:grid;grid-template-columns:46px 1fr auto;gap:4px 16px;align-items:start}
 .n{grid-row:span 3;width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,#1e5bd6,#22b573);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px}
 .tit{font-size:16px;font-weight:800}
 .meta{font-size:12.5px;color:#5b6b7c;margin-top:2px}
 .meta b{color:#123a8f}
 .papel{font-size:13.5px;color:#2c3d4f;margin-top:6px;grid-column:2}
 .abrir{grid-row:span 3;align-self:center;background:#1e5bd6;color:#fff;text-decoration:none;border-radius:9px;padding:9px 18px;font-weight:700;font-size:13.5px;white-space:nowrap}
 .chip{display:inline-block;border-radius:999px;padding:1px 9px;font-size:11px;font-weight:800;margin-left:6px}
 .c-mail{background:#e3edff;color:#123a8f}.c-wa{background:#ddf6e9;color:#158f5a}
 .nota{background:#fff8ec;border-left:4px solid #f5a623;border-radius:0 10px 10px 0;padding:13px 17px;font-size:13px;color:#5a4a1e;margin-top:22px}
</style></head><body><div class="wrap">
<h1>Artes da campanha Impositivas SP</h1>
<p class="sub">As ${pecas.length} peças como o presidente de câmara recebe, com as variáveis preenchidas pelo exemplo de <b>${EXEMPLO.municipio}</b>. Clique para abrir cada arte em tamanho real.</p>
${pecas
  .map(
    (p) => `<div class="peca">
  <div class="n">${p.ordem}</div>
  <div><div class="tit">${p.nome}<span class="chip ${p.canal === 'email' ? 'c-mail' : 'c-wa'}">${p.canal === 'email' ? 'e-mail' : 'WhatsApp'}</span></div>
    <div class="meta"><b>${p.quando}</b> · ${p.publico}${p.assunto ? `<br>Assunto: “${p.assunto.replace(/\{\{municipio\}\}/g, EXEMPLO.municipio)}”` : ''}</div></div>
  <a class="abrir" href="${p.arquivo}">Abrir</a>
  <div class="papel">${p.papel}</div>
</div>`,
  )
  .join('\n')}
<div class="nota">Estas artes são geradas a partir dos templates que estão no CRM — editar as copies em <code>scripts/impositivas/emails.mjs</code>, rodar o seed e exportar de novo mantém tudo em sincronia. Nenhuma peça menciona preço.</div>
</div></body></html>`;

fs.writeFileSync(path.join(OUT, 'index.html'), index);
console.log(`${pecas.length} artes exportadas para ${OUT}`);
pecas.forEach((p) => console.log(`  ${p.ordem} ${p.quando.padEnd(28)} ${p.nome}`));
