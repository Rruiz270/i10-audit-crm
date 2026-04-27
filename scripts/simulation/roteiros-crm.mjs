// Roteiros do treinamento do CRM (i10-audit-crm).
// Diálogo entre Consultor júnior (aprendendo) e Consultor sênior i10 (mostrando).
//
// Cada cidade tem 1 opportunity já criada (via seed) que aparece no pipeline.

const PAUSE_LONG = 7500;
const PAUSE_MED = 5500;
const PAUSE_SHORT = 4000;

function buildScenes(muni, opportunityId) {
  const fmt = (v) => (v == null ? '—' : `R$ ${(v / 1e6).toFixed(1)}M`);
  const fmtN = (v) => (v == null ? '—' : v.toLocaleString('pt-BR'));

  return [
    {
      id: 'dashboard',
      url: '/',
      secret: `Bom dia! Acabei de receber acesso ao CRM. Por onde começo?`,
      resp: `Bom dia! O Dashboard é a sua base. Mostra: oportunidades por estágio, tarefas vencendo hoje, reuniões da semana. Tudo o que importa hoje, num lugar só.`,
      actions: [
        { type: 'wait', ms: 2500 },
        { type: 'scroll', selector: 'body', y: 500 },
      ],
      pauseMs: PAUSE_LONG,
    },
    {
      id: 'leads',
      url: '/leads',
      secret: `Como sei quando chega um lead novo?`,
      resp: `Aqui no Leads. Toda vez que alguém preenche o formulário público (intake) ou um APM cadastra prefeito/secretário em campo, vira uma submissão aqui. Você triagem antes de virar oportunidade.`,
      actions: [
        { type: 'wait', ms: 2500 },
        { type: 'scroll', selector: 'body', y: 400 },
      ],
      pauseMs: PAUSE_LONG,
    },
    {
      id: 'pipeline',
      url: '/pipeline',
      secret: `O Pipeline é o kanban?`,
      resp: `Exato. 8 estágios: Novo → Contato Inicial → Diagnóstico Enviado → Follow-up → Reunião → Negociação → Ganhou (vira consultoria FUNDEB) ou Perdido. Você arrasta os cards entre colunas.`,
      actions: [
        { type: 'wait', ms: 2500 },
        { type: 'scroll', selector: 'body', y: 200 },
      ],
      pauseMs: PAUSE_LONG,
    },
    {
      id: 'opportunities',
      url: '/opportunities',
      secret: `E aqui em Oportunidades?`,
      resp: `Visão de tabela com filtros — por dono, estágio, valor, tag. Útil quando o pipeline visual fica grande. Daqui você abre cada oportunidade pra ver detalhes.`,
      actions: [
        { type: 'wait', ms: 2500 },
      ],
      pauseMs: PAUSE_MED,
    },
    {
      id: 'opportunity-detail',
      url: '/opportunities/{opportunityId}',
      secret: `Vamos abrir uma. O que tem aqui dentro?`,
      resp: `Tudo da oportunidade: município (${muni.nome}, ${fmtN(muni.totalMatriculas)} alunos, receita ${fmt(muni.receitaTotal)}), contatos, atividades, tarefas, reuniões agendadas. Cada interação fica registrada.`,
      actions: [
        { type: 'wait', ms: 3000 },
        { type: 'scroll', selector: 'body', y: 500 },
        { type: 'wait', ms: 2000 },
      ],
      pauseMs: PAUSE_LONG,
    },
    {
      id: 'contacts',
      url: '/contacts',
      secret: `Como organizo contatos quando o município tem várias pessoas envolvidas?`,
      resp: `Cada oportunidade pode ter N contatos. Um é marcado como "principal" — geralmente o secretário de educação. Os outros são suporte (financeiro, pedagógico). Centralizada aqui pra busca rápida.`,
      actions: [
        { type: 'wait', ms: 2500 },
      ],
      pauseMs: PAUSE_MED,
    },
    {
      id: 'tasks',
      url: '/tasks',
      secret: `E follow-ups? Como não esqueço de ligar de volta?`,
      resp: `Tarefas com prazo. Você cria daqui ou direto na oportunidade. O sistema te alerta quando tá atrasada — uma "rotting" mostra deals parados há tempo demais sem ação.`,
      actions: [
        { type: 'wait', ms: 2500 },
      ],
      pauseMs: PAUSE_MED,
    },
    {
      id: 'meetings',
      url: '/meetings',
      secret: `Como agendo reunião com a secretaria?`,
      resp: `Reuniões integra com Google Calendar. Cria evento, convida participantes, gera link Meet. Quando a reunião é "diagnóstico" ou "auditoria", o sistema aceita avançar de estágio só após ela ser realizada.`,
      actions: [
        { type: 'wait', ms: 2500 },
      ],
      pauseMs: PAUSE_MED,
    },
    {
      id: 'reports',
      url: '/reports',
      secret: `Como meu gestor acompanha minha performance?`,
      resp: `Relatórios. Mostra forecast (pipeline ponderado por probabilidade de fechamento), win/loss rate, motivos de perda mais comuns, deals parados. Cada consultor vê os seus, gestor vê todos.`,
      actions: [
        { type: 'wait', ms: 2500 },
        { type: 'scroll', selector: 'body', y: 400 },
      ],
      pauseMs: PAUSE_LONG,
    },
    {
      id: 'admin-team',
      url: '/admin/team',
      secret: `Só admin vê isso ne?`,
      resp: `Isso. Time & Permissões — admin aprova novos cadastros (consultores que se inscrevem ficam "pending" até aprovação), promove a gestor, transfere leads entre consultores e desativa contas. Auditoria de cada ação fica em Saúde Operacional.`,
      actions: [
        { type: 'wait', ms: 2500 },
      ],
      pauseMs: PAUSE_MED,
    },
    {
      id: 'admin-health',
      url: '/admin/health',
      secret: `O que é Saúde Operacional?`,
      resp: `Auditoria do sistema: leads não triados há mais de X dias, oportunidades sem dono, deals "rotten", handoffs pendentes. É a tela que o gestor abre toda segunda-feira.`,
      actions: [
        { type: 'wait', ms: 2500 },
      ],
      pauseMs: PAUSE_MED,
    },
    {
      id: 'settings-stages',
      url: '/settings/stages',
      secret: `Posso customizar os estágios do pipeline?`,
      resp: `Pode. Estágios padrão são 8, mas se quiser separar, ex: "Diagnóstico Enviado" em "Enviado" + "Aprovado", você cria estágio custom aqui. Define probabilidade, dias até "rotten" e campos obrigatórios pra avançar.`,
      actions: [
        { type: 'wait', ms: 2500 },
      ],
      pauseMs: PAUSE_MED,
    },
    {
      id: 'me',
      url: '/me',
      secret: `Como configuro minhas notificações?`,
      resp: `No Meu Perfil. Define o nome que aparece pros outros consultores, sua assinatura nos emails, e em Preferências escolhe quando ser notificado: tarefas atrasadas, novos leads, sinais BNCC.`,
      actions: [
        { type: 'wait', ms: 2500 },
      ],
      pauseMs: PAUSE_MED,
    },
    {
      id: 'apm',
      url: '/apm/dashboard',
      secret: `E o módulo APM, é onde os captadores cadastram?`,
      resp: `Sim. APM tem acesso restrito por senha — só o time da APM. Eles cadastram leads em campo (prefeitos, secretários), os leads aparecem aqui no CRM pra triagem. O dashboard APM agora também tem treinamento e métricas.`,
      actions: [
        { type: 'wait', ms: 3000 },
      ],
      pauseMs: PAUSE_LONG,
    },
    {
      id: 'wrap',
      url: '/',
      secret: `Resumindo: posso captar lead, mover pelo pipeline, fazer handoff e o BNCC executa a auditoria?`,
      resp: `Exato. APM gera lead → CRM trabalha o pipeline até "Ganhou" → Handoff cria automaticamente uma consultoria FUNDEB no sistema BNCC Captação → consultor sênior executa as 9 etapas. Aqui você fecha vendas, lá entrega valor.`,
      actions: [
        { type: 'wait', ms: 4000 },
      ],
      pauseMs: 9000,
    },
  ];
}

export const ROTEIROS = [
  { cityKey: 'pequeno-balbinos', cityLabel: 'Balbinos (pequena)', municipalityName: 'Balbinos', expectedSize: 'pequeno', buildScenes },
  { cityKey: 'medio-paulinia',   cityLabel: 'Paulínia (média)',   municipalityName: 'Paulínia', expectedSize: 'medio',   buildScenes },
  { cityKey: 'grande-campinas',  cityLabel: 'Campinas (grande)',  municipalityName: 'Campinas', expectedSize: 'grande',  buildScenes },
];
