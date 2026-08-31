// Gera o documento do plano de disparo (HTML pronto para virar PDF) lendo o
// estado real do CRM — calendário, sequência e as artes como o destinatário
// recebe. Se a campanha mudar, é só rodar de novo.
//
//   node scripts/impositivas/gerar-plano-disparo.mjs [saida.html]
import { config } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '..', '.env.local') });

const { neon } = await import('@neondatabase/serverless');
const sql = neon((process.env.DATABASE_URL ?? '').trim().replace(/^["']|["']$/g, ''));

const OUT = process.argv[2] ?? '/Users/raphaelruiz/Downloads/impositivas-sp-plano-de-disparo.html';

const EXEMPLO = {
  presidente: 'Eder do Nascimento Ruete',
  primeiro_nome: 'Eder',
  nome: 'Eder do Nascimento Ruete',
  municipio: 'Adamantina',
  camara: 'Câmara Municipal de Adamantina',
  link_lp: 'https://www.institutoi10.com.br/impositivas-sp',
  link_aula: 'https://www.institutoi10.com.br/impositivas-sp/aula',
  link_apresentacao: 'https://www.institutoi10.com.br/impositivas-sp/apresentacao',
  link_whatsapp: 'https://wa.me/5511947223906',
  unsubscribe_url: '#',
};

const PAPEL = {
  E1: 'Abre a campanha pela citação literal de uma impropriedade em relatório de fiscalização, e informa que o prazo da Resolução 17/2025 já venceu.',
  W1: 'Reforça o e-mail no WhatsApp, com botões de resposta rápida. Quem toca recebe o material na hora, por resposta automática.',
  E2: 'Conteúdo de igual para igual: regime opcional, paradoxo do objeto genérico e o rastro que se rompe no empenho.',
  E3: 'STF, MP-SP e TCE-SP, e o checklist em cinco perguntas para a Casa responder internamente.',
  A1: 'Primeira peça da régua quente: convite para a sessão de diagnóstico de 30 minutos.',
  A2: 'Retoma com o material completo e repete o convite para quem ainda não agendou.',
  B1: 'Reativação por duas perguntas do checklist que já viraram apontamento em contas anuais.',
  B5: 'As onze informações que o art. 3º exige em tempo real — e a pergunta se o portal manual sustenta isso por doze meses.',
  B2: 'O custo de não regulamentar: o que fica na mesa, dos dois lados.',
  B6: 'O questionário eletrônico ao Legislativo (GP 46/2025): ou a resposta já existe, ou vira força-tarefa de véspera.',
  B3: 'Último toque no WhatsApp, com o mesmo ângulo de prazo vencido.',
  B7: 'Três itens do checklist a Casa aprova nesta sessão; o quarto ela precisa operar.',
  B4: 'Fecha o ciclo com prazo: as sessões de diagnóstico do semestre estão sendo encerradas.',
};

// O template guardado é um documento HTML completo. Aninhar <html>/<body>
// dentro da página faz o navegador descartar as tags e a arte some — então
// extraímos só o miolo do body antes de embutir.
// Pegamos apenas a tabela de 600px do e-mail, descartando o documento e o
// wrapper de fundo. Três níveis de tabela aninhada travam a paginação do
// Chrome na hora de imprimir, e o miolo é o que interessa na arte.
const miolo = (h) => {
  const s = String(h ?? '');
  const i = s.search(/<table[^>]*width="600"/i);
  if (i >= 0) {
    // fecha na última </table> antes do rodapé do wrapper
    const resto = s.slice(i);
    let nivel = 0;
    for (const m of resto.matchAll(/<\/?table\b/gi)) {
      nivel += m[0].startsWith('</') ? -1 : 1;
      if (nivel === 0) return resto.slice(0, m.index + resto.slice(m.index).indexOf('>') + 1);
    }
  }
  const b = s.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return b ? b[1] : s;
};

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const render = (t, v) => String(t ?? '').replace(/\{\{\s*([a-zA-Z_0-9]+)\s*\}\}/g, (_, k) => v[k] ?? `{{${k}}}`);

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
function quando(ts) {
  if (!ts) return { data: '—', dia: '', hora: '' };
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  // O driver devolve o timestamp naïve como hora local; os componentes locais
  // são exatamente o que foi gravado (UTC), e 12:00Z = 09:00 BRT.
  const hBrt = d.getHours() - 3;
  return {
    data: `${p(d.getDate())}/${p(d.getMonth() + 1)}`,
    dia: DIAS[new Date(d.getFullYear(), d.getMonth(), d.getDate()).getDay()],
    hora: `${p(hBrt)}h`,
    ord: d.getTime(),
  };
}

const [proj] = await sql`SELECT id, name, settings FROM marketing.projects WHERE slug = 'impositivas-sp'`;
const camps = await sql`
  SELECT c.name, c.status, c.scheduled_at, c.sent_count, c.open_count, c.click_count,
         a.name audiencia, a.contact_count publico, t.channel, t.subject, t.html, t.text, t.name tpl
  FROM marketing.campaigns c
  JOIN marketing.audiences a ON a.id = c.audience_id
  JOIN marketing.templates t ON t.id = c.template_id
  WHERE c.project_id = ${proj.id} AND c.name NOT LIKE '[seq:%' AND c.name NOT LIKE 'ZZ%'
  ORDER BY c.scheduled_at`;
const trilhaA = await sql`
  SELECT t.name tpl, t.subject, t.html, t.channel
  FROM marketing.sequences s
  JOIN LATERAL jsonb_array_elements(s.steps->'steps') WITH ORDINALITY AS st(step, ord) ON true
  JOIN marketing.templates t ON t.id = (st.step->>'templateId')::int
  WHERE s.project_id = ${proj.id} AND s.name ILIKE 'Trilha A%'
  ORDER BY st.ord`;

const chave = (nome) => (nome.match(/^([EWAB]\d)/) ?? [])[1] ?? '';

const pecas = [
  ...camps.map((c) => ({
    key: chave(c.name),
    nome: c.name,
    canal: c.channel,
    quando: quando(c.scheduled_at),
    publico: `${c.publico} · ${c.audiencia}`,
    status: c.status,
    subject: render(c.subject, EXEMPLO),
    corpo: c.channel === 'email' ? miolo(render(c.html, EXEMPLO)) : null,
    texto: c.channel === 'whatsapp' ? render(c.text, { ...EXEMPLO, 1: EXEMPLO.primeiro_nome, 2: EXEMPLO.municipio }).replace(/\{\{1\}\}/g, EXEMPLO.primeiro_nome).replace(/\{\{2\}\}/g, EXEMPLO.municipio) : null,
  })),
  ...trilhaA.map((t, i) => ({
    key: chave(t.tpl) || (i === 0 ? 'A1' : 'A2'),
    nome: t.tpl,
    canal: 'email',
    quando: { data: 'automático', dia: '', hora: i === 0 ? 'D+1 do engajamento' : 'D+3 do A1' },
    publico: 'Trilha A · quem engajou',
    status: 'régua automática',
    subject: render(t.subject, EXEMPLO),
    corpo: miolo(render(t.html, EXEMPLO)),
    texto: null,
  })),
].sort((a, b) => (a.quando.ord ?? Infinity) - (b.quando.ord ?? Infinity));

const totalEmail = pecas.filter((p) => p.canal === 'email').length;
const totalWa = pecas.filter((p) => p.canal === 'whatsapp').length;

const linhaCal = (p) => `
  <tr class="${p.canal === 'whatsapp' ? 'wa' : ''}">
    <td class="dt"><b>${esc(p.quando.data)}</b>${p.quando.dia ? `<span>${esc(p.quando.dia)} · ${esc(p.quando.hora)}</span>` : `<span>${esc(p.quando.hora)}</span>`}</td>
    <td><b>${esc(p.nome)}</b><div class="sub">${esc(PAPEL[p.key] ?? '')}</div></td>
    <td class="ch">${p.canal === 'whatsapp' ? '💬 WhatsApp' : '✉ E-mail'}</td>
    <td class="pb">${esc(p.publico)}</td>
  </tr>`;

const bloco = (p, i) => `
  <section class="peca">
    <div class="cab">
      <span class="n">${String(i + 1).padStart(2, '0')}</span>
      <div>
        <h3>${esc(p.nome)}</h3>
        <div class="meta"><b>${esc(p.quando.data)}${p.quando.dia ? ` · ${esc(p.quando.dia)} · ${esc(p.quando.hora)}` : ` · ${esc(p.quando.hora)}`}</b> · ${esc(p.publico)} · ${p.canal === 'whatsapp' ? 'WhatsApp' : 'e-mail'}</div>
        ${p.subject ? `<div class="assunto">Assunto: “${esc(p.subject)}”</div>` : ''}
        <div class="papel">${esc(PAPEL[p.key] ?? '')}</div>
      </div>
    </div>
    ${p.corpo ? `<div class="arte">${p.corpo}</div>` : ''}
    ${p.texto ? `<div class="wa-bolha">${esc(p.texto).replace(/\n/g, '<br>')}<div class="wa-btns"><span>Quero o material</span><span>Falar com especialista</span></div></div>` : ''}
  </section>`;

const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Plano de disparo · Impositivas SP · Instituto i10</title>
<style>
 @page { size: A4; margin: 14mm 12mm; }
 *{box-sizing:border-box}
 body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#13202e;margin:0;line-height:1.55;font-size:13px}
 .wrap{max-width:900px;margin:0 auto;padding:0 18px 50px}
 .capa{background:linear-gradient(135deg,#0e2a5c,#123a8f 45%,#1e5bd6 80%,#22b573 130%);color:#fff;padding:36px 34px;border-radius:16px;margin:22px 0 26px}
 .capa .bars{display:inline-flex;align-items:flex-end;gap:4px;height:30px;margin-bottom:16px}
 .capa .bars i{width:8px;border-radius:3px;display:block}
 .capa h1{font-size:28px;font-weight:800;letter-spacing:-.5px;margin:0 0 8px}
 .capa p{opacity:.93;max-width:640px;margin:0}
 .capa .kpis{display:flex;gap:28px;flex-wrap:wrap;margin-top:22px;border-top:1px solid rgba(255,255,255,.28);padding-top:18px}
 .capa .kpis b{display:block;font-size:22px;letter-spacing:-.5px}
 .capa .kpis span{font-size:12px;opacity:.85}
 h2{font-size:19px;font-weight:800;margin:30px 0 6px;letter-spacing:-.3px}
 h2 .tag{font-size:11px;font-weight:800;background:#e3edff;color:#123a8f;border-radius:999px;padding:2px 10px;vertical-align:middle;margin-left:8px}
 .lead{color:#5b6b7c;margin:0 0 14px;max-width:680px}
 table.cal{width:100%;border-collapse:collapse;font-size:12.5px}
 table.cal th{background:#eef3f9;text-align:left;padding:8px 10px;font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;color:#5b6b7c}
 table.cal td{padding:9px 10px;border-top:1px solid #e2e9f0;vertical-align:top}
 table.cal tr.wa td{background:#f4fcf7}
 td.dt b{display:block}
 td.dt span{font-size:11px;color:#5b6b7c}
 .sub{font-size:11.5px;color:#5b6b7c;margin-top:2px}
 td.ch{white-space:nowrap;font-weight:700;font-size:11.5px}
 td.pb{font-size:11.5px;color:#44566a}
 .trilhas{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:8px}
 .tr{border-radius:12px;padding:16px 18px;border:1.5px solid}
 .tr.a{border-color:#22b573;background:#f2fcf7}
 .tr.b{border-color:#f5a623;background:#fffaf0}
 .tr h3{margin:0 0 4px;font-size:15px}
 .tr .g{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
 .tr.a .g{color:#158f5a}.tr.b .g{color:#a06508}
 .tr ul{margin:0;padding-left:17px;font-size:12.5px}
 .quebra{page-break-before:always;break-before:page}
 .peca{page-break-inside:avoid;break-inside:avoid;margin:22px 0;border:1px solid #e2e9f0;border-radius:14px;overflow:hidden}
 .cab{display:flex;gap:14px;padding:16px 18px;background:#fafbfd;border-bottom:1px solid #e2e9f0}
 .cab .n{flex:none;width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#1e5bd6,#22b573);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800}
 .cab h3{margin:0;font-size:15px}
 .meta{font-size:11.5px;color:#5b6b7c;margin-top:2px}
 .assunto{font-size:12px;color:#123a8f;margin-top:4px;font-weight:600}
 .papel{font-size:12px;color:#44566a;margin-top:5px}
 .arte{padding:14px;background:#eef2f6}
 .arte table{max-width:100%!important}
 .wa-bolha{margin:16px 22px 20px;max-width:420px;background:#fff;border:1px solid #cfc7bd;border-radius:12px;padding:13px 15px;font-size:12.5px;white-space:pre-wrap;box-shadow:0 1px 2px rgba(0,0,0,.06)}
 .wa-btns{border-top:1px solid #eee;margin-top:10px;padding-top:8px;display:flex;flex-direction:column;gap:5px}
 .wa-btns span{color:#0a7cff;font-weight:700;text-align:center;font-size:12px}
 .nota{background:#eef6ff;border-left:4px solid #1e5bd6;border-radius:0 10px 10px 0;padding:12px 16px;font-size:12.5px;color:#274054;margin:16px 0}
 footer{margin-top:34px;text-align:center;color:#5b6b7c;font-size:11px;border-top:1px solid #e2e9f0;padding-top:14px}
 @media print { .peca{box-shadow:none} .capa{-webkit-print-color-adjust:exact;print-color-adjust:exact} body{font-size:12px} }
</style></head><body><div class="wrap">

<div class="capa">
  <span class="bars"><i style="height:12px;background:#9ec3ff"></i><i style="height:21px;background:#cfe4ff"></i><i style="height:30px;background:#7ef0b6"></i></span>
  <h1>Plano de disparo · Emendas Impositivas SP</h1>
  <p>Campanha do Instituto i10, com indicação da APM, para os presidentes das 645 Câmaras Municipais do estado de São Paulo. Envio pelo gateway próprio (Brevo) e WhatsApp oficial. Nenhuma peça menciona preço.</p>
  <div class="kpis">
    <div><b>645</b><span>câmaras · 955 endereços</span></div>
    <div><b>390</b><span>celulares no WhatsApp</span></div>
    <div><b>${totalEmail}</b><span>peças de e-mail</span></div>
    <div><b>${totalWa}</b><span>peças de WhatsApp</span></div>
    <div><b>31/08 → 08/10</b><span>ciclo completo</span></div>
  </div>
</div>

<h2>Como a campanha se ramifica</h2>
<p class="lead">Todos entram pela sequência base. A partir do primeiro disparo, o comportamento de cada câmara decide para onde ela vai — sem intervenção manual.</p>
<div class="trilhas">
  <div class="tr a">
    <div class="g">Trilha A · engajados</div>
    <h3>Quem dá sinal sai da régua de massa</h3>
    <ul>
      <li>Gatilho: clicou, baixou material, se inscreveu na LP ou respondeu no WhatsApp;</li>
      <li>Vira oportunidade no pipeline na hora, já com dona definida;</li>
      <li>Recebe o convite para a sessão de 30 minutos em D+1 e o retoque em D+4;</li>
      <li>Sai de todos os disparos em massa.</li>
    </ul>
  </div>
  <div class="tr b">
    <div class="g">Trilha B · frios</div>
    <h3>Quem recebeu e não clicou</h3>
    <ul>
      <li>Corte em 16/09, depois do E3;</li>
      <li>Duas peças por semana, terças e quintas, até 08/10;</li>
      <li>Cada peça entra por um ângulo normativo diferente, sem repetir o argumento;</li>
      <li>Qualquer clique migra a câmara para a Trilha A na hora.</li>
    </ul>
  </div>
</div>

<h2>Calendário<span class="tag">horário de Brasília</span></h2>
<p class="lead">Datas confirmadas no CRM. Quem lança cada peça é o agendador automático — nada depende de alguém apertar um botão no dia.</p>
<table class="cal">
  <tr><th>Quando</th><th>Peça</th><th>Canal</th><th>Público</th></tr>
  ${pecas.map(linhaCal).join('')}
</table>
<div class="nota">As duas peças da Trilha A não têm data fixa: elas disparam a partir do momento em que a câmara engaja, a qualquer altura do ciclo. As da Trilha B só existem para quem não clicou até o corte de 16/09.</div>

<h2 class="quebra">As artes, como o presidente recebe</h2>
<p class="lead">Variáveis preenchidas com o exemplo de <b>${esc(EXEMPLO.municipio)}</b> — presidente ${esc(EXEMPLO.presidente)}.</p>
${pecas.map(bloco).join('')}

<footer>Instituto i10 · com indicação da APM · i10@i10.org.br · institutoi10.com.br<br>
Documento gerado do estado real do CRM em ${new Date().toLocaleString('pt-BR')}.</footer>
</div></body></html>`;

fs.writeFileSync(OUT, html);
console.log(`documento gerado: ${OUT}`);
console.log(`${pecas.length} peças · ${totalEmail} e-mails · ${totalWa} WhatsApp`);
pecas.forEach((p) => console.log(`  ${String(p.quando.data).padEnd(10)} ${p.nome}`));
