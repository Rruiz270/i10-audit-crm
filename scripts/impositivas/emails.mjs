// Copies da campanha Impositivas SP. Editar aqui e rodar o seed de novo
// atualiza os templates no CRM (upsert por nome).
//
// Variáveis disponíveis (vêm de buildMergeVars + attributes do contato):
//   {{presidente}} {{primeiro_nome}} {{municipio}} {{camara}}
//   {{link_lp}} {{link_aula}} {{link_apresentacao}} {{link_whatsapp}}
//   {{unsubscribe_url}}  ← obrigatório no rodapé (LGPD)

const AZUL = '#1e5bd6';
const AZUL_ESC = '#123a8f';
const VERDE = '#22b573';
const INK = '#13202e';
const MUTED = '#5b6b7c';
const LINE = '#e2e9f0';

const btn = (href, label, cor = `linear-gradient(120deg,${AZUL},${VERDE})`) => `
  <a href="${href}" style="display:inline-block;background:${cor};background-color:${AZUL};color:#ffffff;
     text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:9px;
     margin:6px 0;">${label}</a>`;

const btnWa = (href, label) => btn(href, label, '#25d366') .replace(`background-color:${AZUL}`, 'background-color:#25d366');

export function layout(inner) {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef2f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0"
         style="width:600px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;
                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <tr><td style="padding:22px 30px 0 30px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:9px;">
          <span style="display:inline-block;width:6px;height:10px;background:${AZUL};border-radius:2px;"></span>
          <span style="display:inline-block;width:6px;height:16px;background:#4f80dd;border-radius:2px;"></span>
          <span style="display:inline-block;width:6px;height:22px;background:${VERDE};border-radius:2px;"></span>
        </td>
        <td style="font-size:15px;font-weight:700;color:${INK};">Instituto i10</td>
        <td style="font-size:11.5px;color:${MUTED};padding-left:9px;border-left:1px solid ${LINE};">
          em parceria com a APM</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:20px 30px 26px 30px;font-size:15px;line-height:1.6;color:${INK};">
${inner}
    </td></tr>
    <tr><td style="padding:16px 30px;background:#fafbfd;border-top:1px solid ${LINE};
                   font-size:11px;line-height:1.55;color:${MUTED};">
      Você recebeu este e-mail por ser presidente de Câmara Municipal do estado de São Paulo,
      em iniciativa do Instituto i10 com indicação da APM — Associação Paulista de Municípios.<br>
      Instituto i10 · i10@i10.org.br ·
      <a href="{{unsubscribe_url}}" style="color:${AZUL};">Não quero mais receber</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

const p = (t) => `      <p style="margin:0 0 14px 0;">${t}</p>`;
const ul = (items) =>
  `      <ul style="margin:0 0 14px 0;padding-left:20px;">${items
    .map((i) => `<li style="margin-bottom:7px;">${i}</li>`)
    .join('')}</ul>`;
const quote = (t, fonte) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px 0;">
        <tr><td style="border-left:3px solid #e05252;background:#fdf6f6;padding:12px 16px;
                       border-radius:0 8px 8px 0;font-size:13.5px;color:#5a3030;">
          ${t}<br><span style="font-size:11.5px;opacity:.8;">${fonte}</span>
        </td></tr></table>`;

// ─── As peças ──────────────────────────────────────────────────────────────
export const EMAILS = [
  {
    key: 'E1',
    name: 'E1 · Abertura — TCE aponta impropriedades',
    subject: '{{municipio}}: o TCE-SP começou a apontar impropriedades nas emendas impositivas das Câmaras',
    body: [
      p('Presidente <strong>{{presidente}}</strong>,'),
      p(
        'nos relatórios de contas anuais mais recentes, o Tribunal de Contas do Estado passou a verificar, item a item, como cada Câmara Municipal trata as suas emendas impositivas. E já está registrando <strong>impropriedades</strong> — por exemplo:',
      ),
      quote(
        '“A não instituição de manual orientativo para disciplinar os procedimentos de indicação e execução das emendas parlamentares desatende aos pressupostos do planejamento orçamentário (art. 165 da CF) e ao princípio da eficiência (art. 37, caput).”',
        'TCE-SP · Relatório de Fiscalização, Contas Anuais 2025',
      ),
      p(
        'Não é um movimento isolado: desde maio de 2025 são <strong>6 atos normativos do TCE-SP</strong> sobre o tema — incluindo a exigência de <strong>conta bancária específica por emenda</strong> (Comunicado Audesp 09) — depois que o STF encerrou o orçamento secreto e as “emendas Pix” (ADPF 854 e ADI 7697).',
      ),
      p(
        'O Instituto i10, por indicação da <strong>APM</strong>, preparou um diagnóstico rápido para as Câmaras paulistas: em poucos minutos você vê onde a Câmara de {{municipio}} está diante do checklist que os auditores aplicam.',
      ),
      `      <p style="margin:18px 0 6px 0;">${btn('{{link_lp}}', 'Verificar a situação da minha Câmara →')}</p>`,
      `      <p style="margin:0 0 14px 0;">${btnWa('{{link_whatsapp}}', '💬 Prefiro conversar por WhatsApp')}</p>`,
      p(
        `<span style="color:${MUTED};font-size:13.5px;">Atenciosamente,<br><strong>Equipe Instituto i10</strong> · institutoi10.com.br</span>`,
      ),
    ],
  },
  {
    key: 'E2',
    name: 'E2 · Aula aberta 20 min',
    subject: 'Aula aberta (20 min): quem decide onde o dinheiro do seu município vai parar',
    body: [
      p('Presidente <strong>{{presidente}}</strong>,'),
      p(
        'na semana passada escrevemos sobre o que o TCE-SP passou a cobrar das Câmaras. Hoje queremos entregar algo prático: uma <strong>aula aberta de 20 minutos</strong> que explica o tema do zero — sem juridiquês.',
      ),
      p('O que você leva da aula:'),
      ul([
        '<strong>2015, o ano em que o pedido virou ordem</strong> — as 4 emendas constitucionais que mudaram a relação entre Câmara e Prefeitura;',
        '<strong>O filtro que sumiu</strong> — por que a obrigatoriedade sem exame técnico criou um efeito colateral que hoje cai na conta da Câmara;',
        '<strong>Emenda genérica é a única que o vereador não consegue exigir</strong> — o paradoxo do objeto vago;',
        '<strong>O que olhar no portal da sua cidade</strong> — o teste que qualquer auditor pode fazer hoje.',
      ]),
      `      <p style="margin:18px 0 10px 0;">${btn('{{link_aula}}', '▶ Assistir à aula agora (20 min)')}</p>`,
      p(
        `<span style="color:${MUTED};font-size:13.5px;">P.S.: quem preferir ler, a apresentação técnica completa — com a linha do tempo dos atos do TCE-SP — está <a href="{{link_apresentacao}}" style="color:${AZUL};">disponível aqui</a>.</span>`,
      ),
    ],
  },
  {
    key: 'E3',
    name: 'E3 · Três instâncias + autodiagnóstico',
    subject: 'STF, MP-SP e TCE-SP: três instâncias de olho nas emendas da sua Câmara',
    body: [
      p('Presidente <strong>{{presidente}}</strong>,'),
      p(
        'as emendas impositivas deixaram de ser assunto interno da Câmara. Hoje <strong>três instâncias</strong> atuam sobre elas: o <strong>STF</strong> fixou as regras (transparência e rastreabilidade ponta a ponta), o <strong>MP-SP</strong> instaura inquéritos civis e acompanha conflitos de interesse — sobretudo com o terceiro setor — e o <strong>TCE-SP</strong> confere a conformidade nas contas anuais.',
      ),
      p('<strong>Autodiagnóstico — responda em 1 minuto:</strong>'),
      ul([
        'A Lei Orgânica de {{municipio}} prevê o regime de emendas impositivas (art. 166)?',
        'O Regimento Interno disciplina prazos e critérios de <strong>impedimento técnico</strong>?',
        'A Câmara instituiu <strong>manual orientativo</strong> de indicação e execução?',
        'Cada emenda tem <strong>plano de trabalho</strong> com metas e objeto delimitado, aderente a PPA/LDO/LOA?',
        'Existe <strong>conta específica por emenda</strong> e rastreabilidade até o beneficiário final?',
      ]),
      p(
        'Um único “não” (ou “não sei”) já foi suficiente para gerar apontamento de impropriedade em contas anuais de Câmaras paulistas.',
      ),
      `      <p style="margin:18px 0 6px 0;">${btn('{{link_lp}}', 'Quero verificar a situação da minha Câmara →')}</p>`,
      `      <p style="margin:0;">${btnWa('{{link_whatsapp}}', '💬 Conversar por WhatsApp')}</p>`,
    ],
  },
  {
    key: 'A1',
    name: 'Trilha A · A1 — convite à sessão de 30 min',
    subject: '{{municipio}}: podemos revisar a conformidade da sua Câmara em 30 minutos?',
    body: [
      p('Presidente <strong>{{presidente}}</strong>,'),
      p(
        'vimos que o tema das emendas impositivas chamou a sua atenção — e faz sentido: é hoje um dos pontos mais novos do checklist do TCE-SP para as Câmaras.',
      ),
      p(
        'Queremos oferecer uma <strong>sessão on-line de 30 minutos</strong>, sem custo e sem compromisso, em que nossa equipe:',
      ),
      ul([
        'percorre com você o checklist que os auditores aplicam, ponto a ponto, na realidade de {{municipio}};',
        'mostra o sistema que organiza o ciclo completo — plano de trabalho, admissibilidade, conta específica, portal de transparência e relatórios prontos para o TCE.',
      ]),
      `      <p style="margin:18px 0 6px 0;">${btn('{{link_lp}}', 'Escolher um horário →')}</p>`,
      `      <p style="margin:0 0 14px 0;">${btnWa('{{link_whatsapp}}', '💬 Agendar pelo WhatsApp')}</p>`,
      p(
        `<span style="color:${MUTED};font-size:13.5px;">Se preferir, basta responder este e-mail com dois horários que fiquem bem para você.</span>`,
      ),
    ],
  },
  {
    key: 'A2',
    name: 'Trilha A · A2 — checklist em 1 página',
    subject: 'O checklist que o TCE-SP aplica — para a {{municipio}} se antecipar',
    body: [
      p('Presidente <strong>{{presidente}}</strong>,'),
      p(
        'para facilitar a conversa interna na Câmara, condensamos em <strong>uma página</strong> o checklist de conformidade das emendas impositivas — os mesmos itens que aparecem nos relatórios de fiscalização do TCE-SP, das exigências de Lei Orgânica e Regimento até conta específica e contabilidade segregada padrão Audesp.',
      ),
      `      <p style="margin:16px 0;">${btn('{{link_apresentacao}}', '⬇ Baixar o material completo')}</p>`,
      p(
        'E o convite continua de pé: em 30 minutos, on-line, percorremos o checklist na realidade do seu município e mostramos o sistema funcionando.',
      ),
      `      <p style="margin:6px 0 0 0;">${btn('{{link_lp}}', 'Agendar a sessão →')}</p>`,
    ],
  },
  {
    key: 'B1',
    name: 'Trilha B · B1 — duas perguntas diretas',
    subject: 'A Câmara de {{municipio}} passaria hoje no checklist do TCE-SP?',
    body: [
      p('Presidente <strong>{{presidente}}</strong>, duas perguntas diretas:'),
      ul([
        'A Câmara tem <strong>manual orientativo</strong> de indicação e execução das emendas?',
        'Alguém consegue seguir o dinheiro de cada emenda <strong>até o beneficiário final</strong>?',
      ]),
      p(
        'Nas contas anuais de 2025, responder “não” a qualquer uma delas já rendeu <strong>apontamento de impropriedade</strong> a Câmaras paulistas. E a régua segue subindo: desde março de 2026 o TCE-SP exige <strong>conta bancária específica por emenda</strong>.',
      ),
      p('Em 3 minutos você vê onde sua Câmara está — e o que é prioridade resolver antes da próxima fiscalização.'),
      `      <p style="margin:18px 0 0 0;">${btn('{{link_lp}}', 'Ver a situação da minha Câmara →')}</p>`,
    ],
  },
  {
    key: 'B2',
    name: 'Trilha B · B2 — emendas que ficam na mesa',
    subject: 'Emendas que ficam na mesa: o custo de não regulamentar',
    body: [
      p('Presidente <strong>{{presidente}}</strong>,'),
      p(
        'o regime impositivo municipal é <strong>opcional</strong> — cada cidade o adota (ou não) na própria Lei Orgânica, com o percentual que definir. E aí mora o custo invisível, dos dois lados:',
      ),
      ul([
        '<strong>Quem não regulamenta:</strong> as indicações dos vereadores continuam dependendo da boa vontade do Executivo — a emenda volta a ser moeda de negociação, e obras e serviços apontados pelo mandato <strong>ficam na mesa</strong>;',
        '<strong>Quem regulamenta sem estrutura:</strong> a execução vira obrigação sem controle — objeto genérico, rastro rompido e impropriedade na fiscalização.',
      ]),
      p(
        'O Instituto i10 mantém uma base inédita de emendas impositivas municipais paulistas, com valores indicados e o que de fato chegou à execução.',
      ),
      p('Quer entender em que grupo a Câmara de {{municipio}} está — e como sair dele com segurança?'),
      `      <p style="margin:18px 0 6px 0;">${btn('{{link_lp}}', 'Ver o diagnóstico da minha Câmara →')}</p>`,
      `      <p style="margin:0;">${btnWa('{{link_whatsapp}}', '💬 Conversar por WhatsApp')}</p>`,
    ],
  },
  {
    key: 'B4',
    name: 'Trilha B · B4 — encerramento do ciclo',
    subject: 'Encerrando as sessões de diagnóstico deste semestre — {{municipio}}',
    body: [
      p('Presidente <strong>{{presidente}}</strong>,'),
      p(
        'este é o último e-mail deste ciclo. Nas últimas semanas, dezenas de Câmaras paulistas verificaram sua situação frente às novas exigências do TCE-SP para as emendas impositivas, e estamos fechando as <strong>sessões de diagnóstico do semestre</strong>.',
      ),
      p('Se o tema ficou para depois — compreensível, a pauta da presidência não é pequena —, deixamos dois atalhos:'),
      ul([
        '<strong>3 minutos:</strong> o diagnóstico on-line, no seu ritmo;',
        '<strong>30 minutos:</strong> uma sessão com nossa equipe, on-line e sem custo, antes do fim do mês.',
      ]),
      p('Depois disso, o próximo ciclo de agendas fica para 2027 — e a fiscalização das contas de 2026 não espera.'),
      `      <p style="margin:18px 0 6px 0;">${btn('{{link_lp}}', 'Garantir minha sessão de diagnóstico →')}</p>`,
      `      <p style="margin:0 0 14px 0;">${btnWa('{{link_whatsapp}}', '💬 Falar com a equipe agora')}</p>`,
      p(
        `<span style="color:${MUTED};font-size:13.5px;">Responder este e-mail também funciona — chega direto na nossa equipe.</span>`,
      ),
    ],
  },
];

export function renderEmail(e) {
  return layout(e.body.join('\n'));
}

// ─── WhatsApp (Twilio Content API → aprovação Meta) ────────────────────────
export const WA_TEMPLATES = [
  {
    key: 'W1',
    name: 'impositivas_conformidade_sp',
    friendly: 'W1 · WhatsApp abertura (cold)',
    category: 'MARKETING',
    body:
      'Olá, {{1}}! Aqui é do Instituto i10, em parceria com a APM.\n\n' +
      'O TCE-SP publicou novas regras para as emendas impositivas — inclusive conta bancária específica por emenda — e os relatórios de contas anuais das Câmaras já registram impropriedades no tema.\n\n' +
      'Preparamos um material gratuito de 20 minutos para a Câmara de {{2}} verificar se está em conformidade. Posso te enviar?',
    buttons: [{ id: 'quero', title: 'Quero o material' }, { id: 'falar', title: 'Falar com especialista' }],
    variables: ['primeiro_nome', 'municipio'],
  },
  {
    key: 'B3',
    name: 'impositivas_urgencia_sp',
    friendly: 'B3 · WhatsApp urgência (reativação)',
    category: 'MARKETING',
    // A Meta recusa template que começa (ou termina) com variável — por isso
    // "Presidente" antes do {{1}}.
    body:
      'Presidente {{1}}, um alerta rápido do Instituto i10 (parceria APM):\n\n' +
      'o TCE-SP passou a exigir conta bancária específica por emenda impositiva e já registra impropriedades em contas de Câmaras sem manual orientativo e sem rastreabilidade.\n\n' +
      'A Câmara de {{2}} já se adequou? Em 3 minutos dá para verificar.',
    buttons: [{ id: 'verificar', title: 'Verificar minha Câmara' }, { id: 'falar', title: 'Falar com especialista' }],
    variables: ['primeiro_nome', 'municipio'],
  },
];
