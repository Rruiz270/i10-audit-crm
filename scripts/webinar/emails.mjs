// Copies da campanha Webinar Impositivas (29/09/2026). Editar aqui e rodar o
// seed de novo atualiza os templates no CRM (upsert por nome).
//
// Origem: kit webinar-emendas-divulgacao.html. A copy do kit foi mantida;
// as mudanças estão anotadas peça a peça e são três:
//   1. o endereço passou do Vercel pessoal para institutoi10.com.br;
//   2. o pedido principal do E5/E6 virou WhatsApp — o CRM não lê resposta de
//      e-mail (inbound.ts só trata Twilio), então "responda com dois horários"
//      produz lead invisível ao pipeline;
//   3. as mensagens de WhatsApp ganharam palavra antes da variável inicial —
//      a Meta recusa template que começa ou termina com variável (2388299).
//
// Variáveis disponíveis (buildMergeVars + attributes do contato):
//   {{presidente}} {{primeiro_nome}} {{nome}} {{municipio}} {{camara}}
//   {{link_lp}} {{link_whatsapp}} {{unsubscribe_url}}
// E, via projects.settings.mergeExtras (chegam depois, perto do evento):
//   {{link_sala}} {{link_gravacao}} {{link_pdf}}

const AZUL = '#1e5bd6';
const VERDE = '#22b573';
const INK = '#13202e';
const MUTED = '#5b6b7c';
const LINE = '#e2e9f0';

const btn = (href, label, cor = `linear-gradient(120deg,${AZUL},${VERDE})`) => `
  <a href="${href}" style="display:inline-block;background:${cor};background-color:${AZUL};color:#ffffff;
     text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:9px;
     margin:6px 0;">${label}</a>`;

const btnWa = (href, label) =>
  btn(href, label, '#25d366').replace(`background-color:${AZUL}`, 'background-color:#25d366');

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
          webinar · 29 de setembro, 9h</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:20px 30px 26px 30px;font-size:15px;line-height:1.6;color:${INK};">
${inner}
    </td></tr>
    <tr><td style="padding:16px 30px;background:#fafbfd;border-top:1px solid ${LINE};
                   font-size:11px;line-height:1.55;color:${MUTED};">
      Você recebeu este e-mail por ser presidente de Câmara Municipal do estado de São Paulo.
      Instituto i10 · Sapiens Park, Florianópolis/SC · i10@i10.org.br<br>
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
const ficha = (linhas) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">
        <tr><td style="border-left:3px solid ${VERDE};background:#f4fbf7;padding:13px 16px;
                       border-radius:0 8px 8px 0;font-size:14px;color:${INK};">
          ${linhas.join('<br>')}
        </td></tr></table>`;

const ASSINATURA = p(
  `<span style="color:${MUTED};font-size:13.5px;">Atenciosamente,<br>` +
    `<strong>Heitor Caldeira do Nascimento</strong><br>` +
    `Gerente de Relações Institucionais · Instituto i10<br>` +
    `+55 48 98816-6723 · heitor.caldeira@i10.org.br</span>`,
);

// ─── E-mails ───────────────────────────────────────────────────────────────
export const EMAILS = [
  {
    key: 'E0',
    name: 'E0 · Convite VIP (já levantou a mão)',
    subject: '{{municipio}}: fiquei devendo uma conversa — e preparei uma hora para todas as Câmaras',
    // Peça nova, fora do kit. Existe porque a campanha Impositivas SP deixou
    // 126 oportunidades paradas no primeiro estágio: mandar a mesma peça fria
    // para quem já levantou a mão é o que queimaria o contato.
    body: [
      p('Presidente <strong>{{presidente}}</strong>,'),
      p(
        'o senhor demonstrou interesse no material sobre emendas impositivas nas últimas semanas, e eu fiquei devendo uma conversa. Em vez de pedir vinte minutos da agenda da Câmara de {{municipio}}, preparei <strong>uma hora para todas as Câmaras ao mesmo tempo</strong>.',
      ),
      ficha([
        '<strong>Webinar gratuito · gestão das emendas impositivas</strong>',
        '🗓 Terça, 29 de setembro, das 9h às 10h (horário de Brasília) · on-line',
        '📌 O caminho da emenda em 5 etapas · as conferências que a comissão faz à mão (cota, reserva da saúde, dotação, entidade) · o que o Tribunal de Contas costuma perguntar · demonstração sobre um PL da LOA 2027',
      ]),
      p(
        'É a mesma matéria que o senhor pediu, com a vantagem de poder trazer a Diretoria-geral, a Comissão de Orçamento e a Procuradoria junto. A gravação fica disponível para quem se inscrever.',
      ),
      `      <p style="margin:18px 0 6px 0;">${btn('{{link_lp}}', 'Reservar vaga para a Câmara de {{municipio}} →')}</p>`,
      `      <p style="margin:0 0 14px 0;">${btnWa('{{link_whatsapp}}', '💬 Falar comigo no WhatsApp')}</p>`,
      p('A inscrição leva um minuto e aceita mais de uma pessoa da mesma Câmara.'),
      ASSINATURA,
    ],
  },
  {
    key: 'E1',
    name: 'E1 · Convite (base completa)',
    subject: '{{municipio}}: webinar gratuito sobre emendas impositivas na Câmara — 29/09, 9h',
    body: [
      p('Presidente <strong>{{presidente}}</strong>,'),
      p(
        'com o PL da LOA 2027 chegando à Câmara de {{municipio}} nas próximas semanas, o Instituto i10 — ICT do Sapiens Park, em Florianópolis — preparou um <strong>webinar gratuito para Câmaras Municipais</strong> sobre a gestão das emendas parlamentares impositivas, da apresentação pelo gabinete ao pagamento pela Prefeitura.',
      ),
      ficha([
        '🗓 <strong>Terça, 29 de setembro, das 9h às 10h</strong> (horário de Brasília)',
        '💻 On-line, pelo navegador, sem instalar nada',
        '🎥 Gravação disponível para quem se inscrever',
      ]),
      p('<strong>Em uma hora:</strong>'),
      ul([
        'o regime impositivo e o calendário da LOA 2027 — o que é decisão da Lei Orgânica de {{municipio}} e não da norma federal;',
        'o caminho da emenda em <strong>cinco etapas</strong>, da indicação do gabinete ao pagamento;',
        'as <strong>conferências que a comissão faz à mão</strong>: cota do vereador, reserva da saúde, dotação disponível, habilitação da entidade;',
        'o que o <strong>Tribunal de Contas</strong> costuma perguntar — e o que já virou impropriedade em relatório de fiscalização;',
        'demonstração prática sobre um PL da LOA 2027 real.',
      ]),
      p(
        'É pensado para <strong>Mesa Diretora, Diretoria-geral, Comissão de Orçamento, gabinetes, Procuradoria e Controle interno</strong> — e a inscrição aceita mais de uma pessoa da mesma Câmara.',
      ),
      `      <p style="margin:18px 0 6px 0;">${btn('{{link_lp}}', 'Inscrever a Câmara de {{municipio}} →')}</p>`,
      p(
        `<span style="color:${MUTED};font-size:13.5px;">A inscrição leva um minuto. Se preferir, responda este e-mail com os nomes e eu inscrevo a equipe.</span>`,
      ),
      ASSINATURA,
    ],
  },
  {
    key: 'ECONF',
    name: 'ECONF · Confirmação de inscrição',
    subject: 'Inscrição confirmada — webinar de emendas impositivas, 29/09 às 9h',
    // Peça que hoje NÃO existe: o Resend do Heitor está em sandbox e só entrega
    // na caixa dele. Sai no ato da inscrição, pelo Brevo.
    body: [
      p('{{primeiro_nome}}, sua inscrição está confirmada.'),
      ficha([
        '🗓 <strong>Terça, 29 de setembro, das 9h às 10h</strong> (horário de Brasília)',
        '🔗 Link da sala: <a href="{{link_sala}}" style="color:' + AZUL + ';">{{link_sala}}</a>',
        '💻 Entra pelo navegador, sem instalar nada — a sala abre às 8h45',
      ]),
      p(
        '<strong>Guarde este e-mail</strong> — é por ele que se entra na sala. Vamos reenviar o link na véspera e na manhã do evento, mas ele já é este.',
      ),
      `      <p style="margin:18px 0 6px 0;">${btn('{{link_sala}}', 'Entrar na sala em 29/09 →')}</p>`,
      p('<strong>O que já está garantido:</strong>'),
      ul([
        'a <strong>gravação</strong> completa, enviada no mesmo dia;',
        'o <strong>roteiro das cinco etapas</strong> e a lista de conferências da comissão, em PDF;',
        'as <strong>perguntas enviadas na inscrição são respondidas primeiro</strong>.',
      ]),
      p(
        'Se quiser inscrever mais alguém da Câmara de {{municipio}} — Diretoria-geral, Comissão de Orçamento, Procuradoria — é só encaminhar este link: <a href="{{link_lp}}" style="color:' +
          AZUL +
          ';">{{link_lp}}</a>',
      ),
      `      <p style="margin:0 0 14px 0;">${btnWa('{{link_whatsapp}}', '💬 Tirar uma dúvida no WhatsApp')}</p>`,
      ASSINATURA,
    ],
  },
  {
    key: 'E2',
    name: 'E2 · Conteúdo (não inscritos)',
    subject: 'As cinco conferências que a comissão de {{municipio}} faz à mão',
    body: [
      p('Presidente <strong>{{presidente}}</strong>,'),
      p(
        'retomo o convite de terça com uma pergunta concreta, porque ela costuma ser mais útil do que o convite em si.',
      ),
      p(
        '<strong>Quando um vereador de {{municipio}} pergunta quanto ainda tem de cota e em que etapa está cada emenda dele, quem responde — e de onde vem o número?</strong>',
      ),
      p(
        'Na maioria das Câmaras, a resposta passa por uma planilha que uma pessoa mantém e por um telefonema para a Prefeitura. Funciona, até o ano em que a planilha e o sistema contábil divergem — e aí ninguém consegue dizer qual dos dois está certo.',
      ),
      p('Antes de cada emenda entrar, alguém confere à mão, uma a uma:'),
      ul([
        '<strong>a cota do vereador</strong> — quanto já foi usado e quanto resta no exercício;',
        '<strong>a reserva da saúde</strong> — o percentual mínimo que a Lei Orgânica exige;',
        '<strong>a dotação</strong> — se existe, no PL da LOA, dotação compatível com o objeto;',
        '<strong>a habilitação da entidade</strong> — se a beneficiária pode receber;',
        '<strong>a viabilidade do objeto</strong> — se é específico o bastante para ser executado e cobrado.',
      ]),
      p(
        'Cada uma dessas conferências é uma consulta a uma fonte diferente. É por isso que a emenda volta da comissão — e é exatamente esse bloco que vamos percorrer no webinar, com as dotações reais de um PL da LOA 2027.',
      ),
      ficha([
        '🗓 <strong>Terça, 29 de setembro, das 9h às 10h</strong> (horário de Brasília) · on-line',
        '🎥 Gravação para quem se inscrever',
      ]),
      `      <p style="margin:18px 0 6px 0;">${btn('{{link_lp}}', 'Inscrever a Câmara de {{municipio}} →')}</p>`,
      ASSINATURA,
    ],
  },
  {
    key: 'E3',
    name: 'E3 · Véspera (inscritos)',
    subject: 'Amanhã, 9h — link da sala do webinar de emendas impositivas',
    body: [
      p('{{primeiro_nome}}, é amanhã.'),
      ficha([
        '🗓 <strong>Terça, 29 de setembro, 9h às 10h</strong> (horário de Brasília)',
        '🔗 Link da sala: <a href="{{link_sala}}" style="color:' + AZUL + ';">{{link_sala}}</a>',
        '💻 Entra pelo navegador, sem instalar nada',
      ]),
      `      <p style="margin:18px 0 6px 0;">${btn('{{link_sala}}', 'Entrar na sala →')}</p>`,
      p(
        'Se puder, <strong>entre cinco minutos antes</strong> — a sala abre às 8h45. As perguntas enviadas na inscrição serão respondidas primeiro; se quiser mandar mais alguma, basta responder este e-mail ou me chamar no WhatsApp.',
      ),
      p(
        'Se alguém mais da Câmara de {{municipio}} for acompanhar, encaminhe este e-mail — o link é o mesmo para todos.',
      ),
      `      <p style="margin:0 0 14px 0;">${btnWa('{{link_whatsapp}}', '💬 Mandar uma pergunta agora')}</p>`,
      ASSINATURA,
    ],
  },
  {
    key: 'E4',
    name: 'E4 · Dia (inscritos)',
    subject: 'Hoje às 9h — webinar de emendas impositivas (link da sala)',
    body: [
      p('{{primeiro_nome}}, começamos às 9h.'),
      ficha([
        '🔗 Link da sala: <a href="{{link_sala}}" style="color:' + AZUL + ';">{{link_sala}}</a>',
      ]),
      `      <p style="margin:18px 0 6px 0;">${btn('{{link_sala}}', 'Entrar na sala →')}</p>`,
      p('Até já,'),
      ASSINATURA,
    ],
  },
  {
    key: 'E5',
    name: 'E5 · Gravação + material (presentes)',
    subject: 'Gravação e roteiro das 5 etapas — webinar de emendas impositivas',
    body: [
      p('{{primeiro_nome}},'),
      p('obrigado por participar hoje. Como prometido:'),
      ficha([
        '🎥 <strong>Gravação:</strong> <a href="{{link_gravacao}}" style="color:' + AZUL + ';">{{link_gravacao}}</a>',
        '📄 <strong>Roteiro das cinco etapas e lista de conferências da comissão (PDF):</strong> <a href="{{link_pdf}}" style="color:' +
          AZUL +
          ';">{{link_pdf}}</a>',
      ]),
      p(
        'Sobre o que ficou para o fim: para a Câmara que quiser, montamos uma <strong>demonstração sobre o próprio PL da LOA 2027 de {{municipio}}</strong>. A base de dotações entra sem digitação e percorremos as cinco etapas com os números reais do município — 20 minutos, on-line, no horário que for melhor para a Câmara.',
      ),
      // Mudança em relação ao kit: o pedido era "responda com dois horários".
      // Resposta de e-mail não chega ao CRM (não há leitura de caixa), então o
      // lead mais valioso da campanha ficaria invisível ao pipeline.
      p('<strong>Faz sentido para {{municipio}}?</strong> Me chame no WhatsApp que marcamos:'),
      `      <p style="margin:18px 0 6px 0;">${btnWa('{{link_whatsapp}}', '💬 Quero a demonstração para {{municipio}}')}</p>`,
      p(
        `<span style="color:${MUTED};font-size:13.5px;">Se preferir e-mail, responder esta mensagem com dois horários possíveis também funciona.</span>`,
      ),
      ASSINATURA,
    ],
  },
  {
    key: 'E6',
    name: 'E6 · Não compareceu (inscritos ausentes)',
    subject: 'A gravação do webinar de ontem — e o bloco que mais rende',
    body: [
      p('{{primeiro_nome}},'),
      p(
        'sentimos sua falta ontem. A gravação está disponível, e vale o atalho: <strong>o bloco das conferências da comissão</strong> — cota, reserva da saúde, dotação e habilitação da entidade — é o que gerou mais pergunta na sala.',
      ),
      ficha([
        '🎥 <strong>Gravação:</strong> <a href="{{link_gravacao}}" style="color:' + AZUL + ';">{{link_gravacao}}</a>',
        '📄 <strong>Roteiro das cinco etapas (PDF):</strong> <a href="{{link_pdf}}" style="color:' +
          AZUL +
          ';">{{link_pdf}}</a>',
      ]),
      p(
        'Se preferir ver direto com as dotações do PL da LOA 2027 de {{municipio}}, em vez de assistir uma hora de gravação, preparo uma <strong>demonstração de 20 minutos</strong> sobre a base do próprio município.',
      ),
      `      <p style="margin:18px 0 6px 0;">${btnWa('{{link_whatsapp}}', '💬 Prefiro a demonstração de 20 min')}</p>`,
      ASSINATURA,
    ],
  },
  {
    key: 'E7',
    name: 'E7 · Gravação para quem não se inscreveu',
    subject: 'A gravação do webinar de emendas impositivas está disponível',
    // Peça nova, fora do kit: é a única forma de o não inscrito virar contato
    // quente depois do evento. Cria uma entrega que a página passa a honrar.
    body: [
      p('Presidente <strong>{{presidente}}</strong>,'),
      p(
        'o webinar sobre gestão das emendas impositivas aconteceu ontem, e a Câmara de {{municipio}} não chegou a se inscrever. <strong>A gravação continua disponível</strong> — basta pedir pela mesma página:',
      ),
      ficha([
        '🎥 <strong>Uma hora de gravação</strong>, com o caminho da emenda em cinco etapas',
        '📄 <strong>Roteiro e lista de conferências da comissão</strong>, em PDF',
        '🔎 O bloco sobre <strong>o que o Tribunal de Contas pergunta</strong>',
      ]),
      `      <p style="margin:18px 0 6px 0;">${btn('{{link_lp}}', 'Receber a gravação →')}</p>`,
      p(
        'É o mesmo formulário de um minuto da inscrição. Quem pediu recebe o link no mesmo dia.',
      ),
      ASSINATURA,
    ],
  },
];

export function renderEmail(e) {
  return layout(e.body.join('\n'));
}

// ─── WhatsApp (Twilio Content API → aprovação Meta) ────────────────────────
//
// Cinco templates para nove momentos. Um template serve W3 e W4 (e W5/W5b)
// porque a diferença entre eles está em variável, não em estrutura — cada
// submissão é um pedido a mais na fila da Meta, e a fila é o recurso escasso.
//
// Dois cuidados pagos em campanha anterior:
//   · a Meta recusa template que começa OU termina com variável (2388299) —
//     por isso "Olá, {{1}}" e nunca "{{1}}, ...";
//   · os templates da Impositivas SP marcam 0 cliques porque são quick-reply
//     com o link solto no corpo. Aqui o convite usa BOTÃO DE URL, que é o que
//     faz o clique ser contabilizado e a origem ?o=wa viajar junto.
export const WA_TEMPLATES = [
  {
    key: 'W1',
    name: 'webinar_convite_camara',
    friendly: 'W1 · Convite ao webinar (com botão de URL)',
    category: 'MARKETING',
    body:
      'Olá, {{1}}, tudo bem? Aqui é Heitor Caldeira, do Instituto i10 — ICT do Sapiens Park, em Florianópolis.\n\n' +
      'No dia 29/09 (terça), às 9h, fazemos um webinar gratuito para Câmaras Municipais sobre a gestão das emendas impositivas: o caminho da emenda em 5 etapas, as conferências que a comissão faz à mão (cota, reserva da saúde, dotação, entidade) e o que o Tribunal de Contas costuma perguntar.\n\n' +
      'Uma hora, on-line, com gravação para os inscritos. Com o PL da LOA 2027 chegando à Câmara de {{2}}, achei que valia o convite.\n\n' +
      'A inscrição leva um minuto:',
    // Botão de URL — é o que faltava nos dois disparos anteriores.
    urlButton: { title: 'Fazer a inscrição', url: 'https://www.institutoi10.com.br/webinar-impositivas?o=wa' },
    variables: ['primeiro_nome', 'municipio'],
  },
  {
    key: 'W2',
    name: 'webinar_reforco_camara',
    friendly: 'W2 · Reforço do convite (não inscritos)',
    category: 'MARKETING',
    body:
      'Olá, {{1}}, só retomando o convite de terça.\n\n' +
      'Uma pergunta que vamos responder no webinar: quando um vereador de {{2}} pergunta quanto ainda tem de cota e em que etapa está cada emenda dele, quem responde — e de onde vem o número?\n\n' +
      'Se hoje a resposta passa por planilha e telefonema, vale a hora de terça (29/09, às 9h). A gravação fica para quem se inscrever.\n\n' +
      'Se não for o momento, é só me dizer que encerro por aqui.',
    urlButton: { title: 'Fazer a inscrição', url: 'https://www.institutoi10.com.br/webinar-impositivas?o=wa2' },
    variables: ['primeiro_nome', 'municipio'],
  },
  {
    key: 'W34',
    name: 'webinar_lembrete_sala',
    friendly: 'W3/W4 · Lembrete com link da sala (inscritos)',
    category: 'UTILITY',
    // UTILITY e não MARKETING: é lembrete de evento para quem se inscreveu.
    // A categoria certa aprova mais rápido e não conta como conversa de
    // marketing no teto da Meta.
    // {{3}} carrega "é amanhã" (W3) ou "é hoje" (W4) — mesma estrutura, texto
    // diferente, um único pedido na fila.
    body:
      'Olá, {{1}}! Lembrete: o webinar sobre emendas impositivas {{3}}, às 9h (horário de Brasília).\n\n' +
      'Link da sala: {{4}}\n\n' +
      'Entra pelo navegador, sem instalar nada. Se puder, entre 5 minutos antes — a sala abre às 8h45.\n\n' +
      'As perguntas enviadas na inscrição serão respondidas primeiro. Se quiser mandar mais alguma, é por aqui mesmo.',
    variables: ['primeiro_nome', 'municipio', 'quando', 'link_sala'],
  },
  {
    key: 'W55b',
    name: 'webinar_pos_gravacao',
    friendly: 'W5/W5b · Gravação + material (pós-evento)',
    category: 'MARKETING',
    // {{3}} carrega "Obrigado por participar hoje" (W5) ou "Sentimos sua falta
    // hoje" (W5b) — é a bifurcação presente/ausente em uma variável.
    body:
      'Olá, {{1}}! {{3}}\n\n' +
      'Gravação: {{4}}\n' +
      'Roteiro das 5 etapas e lista de conferências (PDF): {{5}}\n\n' +
      'Como falei no fim: para a Câmara que quiser, montamos uma demonstração sobre o próprio PL da LOA 2027 de {{2}} — a base entra sem digitação e a gente percorre as etapas com as dotações reais. São 20 minutos, on-line, no horário que for melhor.\n\n' +
      'Faz sentido para vocês?',
    variables: ['primeiro_nome', 'municipio', 'abertura', 'link_gravacao', 'link_pdf'],
  },
  {
    key: 'W6',
    name: 'webinar_encerramento',
    friendly: 'W6 · Encerramento do ciclo',
    category: 'MARKETING',
    body:
      'Olá, {{1}}. Deixo o material da plataforma e fico à disposição quando a Câmara de {{2}} for organizar as emendas de 2027.\n\n' +
      'Obrigado pela atenção — e, se preferir não receber mais mensagens, é só me responder com "sair" que removo o contato.',
    urlButton: { title: 'Ver o material', url: 'https://www.institutoi10.com.br/webinar-impositivas?o=wa6' },
    variables: ['primeiro_nome', 'municipio'],
  },
];
