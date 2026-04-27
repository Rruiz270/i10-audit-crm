// Roteiro end-to-end: APM gera lead → CRM fecha pipeline → BNCC executa auditoria.
// Tudo em um único context Playwright que alterna entre :3001 (CRM) e :3000 (BNCC).
// Diálogo entre APM, Consultor i10 e Secretária representa o fluxo real.

const PAUSE_LONG = 8000;
const PAUSE_MED = 5500;

export function buildE2EScenes(muni, opportunityId, consultoriaId) {
  const fmtN = (v) => (v == null ? '—' : v.toLocaleString('pt-BR'));
  const fmt = (v) => (v == null ? '—' : `R$ ${(v / 1e6).toFixed(1)}M`);

  return [
    // ─── FASE 1: APM CAPTA O LEAD ────────────────────────────────
    {
      id: 'apm-gate',
      base: 'crm',
      url: '/apm',
      who: { secret: '🎯 APM CAPTADOR', resp: '' },
      secret: `Vou cadastrar um secretário que acabei de visitar em ${muni.nome}. Onde acesso?`,
      resp: '', // sem resposta — fala única
      actions: [
        { type: 'fill', selector: 'input[type="password"]', value: process.env.APM_GATEWAY_PASSWORD || 'apm2026', optional: true },
        { type: 'wait', ms: 1500 },
        { type: 'click', selector: 'button[type="submit"]', optional: true },
        { type: 'wait', ms: 2500 },
      ],
      pauseMs: PAUSE_MED,
    },
    {
      id: 'apm-cadastro',
      base: 'crm',
      url: '/apm/cadastro',
      who: { secret: '🎯 APM CAPTADOR', resp: '' },
      secret: `Pronto, formulário aberto. Vou registrar o município, contato principal e observações da visita.`,
      resp: '',
      actions: [
        { type: 'wait', ms: 4000 },
        { type: 'scroll', selector: 'body', y: 400 },
        { type: 'wait', ms: 3000 },
      ],
      pauseMs: PAUSE_LONG,
    },

    // ─── FASE 2: CRM RECEBE E TRABALHA ───────────────────────────
    {
      id: 'crm-leads',
      base: 'crm',
      url: '/leads',
      who: { secret: '👨‍💼 CONSULTOR i10', resp: '' },
      secret: `Acabou de chegar um lead novo da APM em ${muni.nome}. Vou abrir e triar.`,
      resp: '',
      actions: [
        { type: 'wait', ms: 3000 },
        { type: 'scroll', selector: 'body', y: 300 },
      ],
      pauseMs: PAUSE_MED,
    },
    {
      id: 'crm-pipeline',
      base: 'crm',
      url: '/pipeline',
      who: { secret: '👨‍💼 CONSULTOR i10', resp: '' },
      secret: `Lead já entrou como oportunidade no estágio "Novo". Conduzo pelas próximas etapas: contato → diagnóstico → reunião → negociação → fecho.`,
      resp: '',
      actions: [
        { type: 'wait', ms: 3500 },
      ],
      pauseMs: PAUSE_MED,
    },
    {
      id: 'crm-opp-detail',
      base: 'crm',
      url: '/opportunities/{opportunityId}',
      who: { secret: '👨‍💼 CONSULTOR i10', resp: '' },
      secret: `Aqui detalho: município ${muni.nome} (${fmtN(muni.totalMatriculas)} alunos), valor estimado da consultoria, data prevista de fechamento. Registro cada interação aqui.`,
      resp: '',
      actions: [
        { type: 'wait', ms: 3000 },
        { type: 'scroll', selector: 'body', y: 400 },
        { type: 'wait', ms: 2500 },
      ],
      pauseMs: PAUSE_LONG,
    },
    {
      id: 'crm-handoff',
      base: 'crm',
      url: '/opportunities/{opportunityId}',
      who: { secret: '👨‍💼 CONSULTOR i10', resp: '' },
      secret: `Reunião de auditoria realizada, contrato assinado. Marco como "Ganhou" — handoff dispara consultoria FUNDEB no sistema BNCC Captação.`,
      resp: '',
      actions: [
        { type: 'wait', ms: 4000 },
      ],
      pauseMs: PAUSE_LONG,
    },

    // ─── FASE 3: BNCC EXECUTA AUDITORIA ──────────────────────────
    {
      id: 'bncc-portfolio',
      base: 'bncc',
      url: '/portfolio',
      who: { secret: '👨‍💼 CONSULTOR SENIOR', resp: '' },
      secret: `Mudo pra plataforma BNCC Captação. Aqui executo a entrega — a consultoria criada pelo handoff já aparece no portfolio.`,
      resp: '',
      actions: [
        { type: 'wait', ms: 3000 },
      ],
      pauseMs: PAUSE_MED,
    },
    {
      id: 'bncc-step-cidade',
      base: 'bncc',
      url: '/wizard/{consultoriaId}/step-1-cidade',
      who: { secret: '👨‍💼 CONSULTOR SENIOR', resp: '' },
      secret: `Etapa 1 do wizard: confirmação dos dados de ${muni.nome}. Receita atual ${fmt(muni.receitaTotal)} e potencial identificado ${fmt(muni.potTotal)}.`,
      resp: '',
      actions: [
        { type: 'wait', ms: 3000 },
        { type: 'scroll', selector: 'body', y: 400 },
      ],
      pauseMs: PAUSE_LONG,
    },
    {
      id: 'bncc-step-diagnostico',
      base: 'bncc',
      url: '/wizard/{consultoriaId}/step-3-diagnostico',
      who: { secret: '🎤 SECRETÁRIA', resp: '' },
      secret: `Mostra pra mim onde estamos perdendo. Quero ver o detalhamento.`,
      resp: '',
      actions: [
        { type: 'wait', ms: 3000 },
        { type: 'scroll', selector: 'body', y: 500 },
      ],
      pauseMs: PAUSE_LONG,
    },
    {
      id: 'bncc-step-simulacao',
      base: 'bncc',
      url: '/wizard/{consultoriaId}/step-4-simulacao',
      who: { secret: '🎤 SECRETÁRIA', resp: '' },
      secret: `E se eu converter mais escolas pra integral? Quanto entra a mais?`,
      resp: '',
      actions: [
        { type: 'wait', ms: 3500 },
      ],
      pauseMs: PAUSE_LONG,
    },
    {
      id: 'bncc-telao',
      base: 'bncc',
      url: '/consultorias/{consultoriaId}/telao',
      who: { secret: '👨‍💼 CONSULTOR SENIOR', resp: '' },
      secret: `Modo telão pra apresentar pro prefeito: ganho garantido pelo cadastro correto + potencial a destravar com compliance.`,
      resp: '',
      actions: [
        { type: 'wait', ms: 5000 },
      ],
      pauseMs: 8000,
    },
    {
      id: 'wrap',
      base: 'bncc',
      url: '/dashboard',
      who: { secret: '🎯 PIPELINE COMPLETO', resp: '' },
      secret: `Fluxo completo: APM gera lead em campo → CRM trabalha pipeline até fechar contrato → BNCC executa auditoria FUNDEB e entrega snapshot. Tudo conectado, dados fluem entre os 3 sistemas.`,
      resp: '',
      actions: [
        { type: 'wait', ms: 4000 },
      ],
      pauseMs: 9000,
    },
  ];
}
