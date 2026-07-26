/**
 * Calendário de mandato municipal — janelas de compra do setor público.
 *
 * O ciclo de vendas para prefeituras é regido pelo calendário político-fiscal:
 *   - Mandato 2025–2028 (posse 01/01/2025, fim 31/12/2028).
 *   - Eleições municipais em out/2028 travam contratações novas meses antes
 *     (Lei 9.504/97, art. 73 — condutas vedadas) e a LRF (art. 42) veda
 *     contrair despesa sem cobertura nos últimos 2 quadrimestres do mandato.
 *   - Prestações de contas FUNDEB (parecer do CACS e envio ao SIOPE) ocupam
 *     as secretarias no 1º quadrimestre — bom gancho para o Radar/Auditoria.
 *   - Elaboração da LOA (ago–set) é a janela para entrar no orçamento do ano
 *     seguinte.
 *
 * Tudo aqui é função pura de `now` para ser testável e reutilizável fora do
 * /reports (ex.: alertas no pipeline). Datas são referências nacionais —
 * prazos de TCE variam por estado; tratamos como sinalização, não como prazo
 * jurídico.
 */

export const MANDATE_START = new Date('2025-01-01T00:00:00-03:00');
export const MANDATE_END = new Date('2028-12-31T23:59:59-03:00');
/** 1º domingo de outubro de 2028 (1º turno das eleições municipais). */
export const ELECTION_2028 = new Date('2028-10-01T00:00:00-03:00');
/** LRF art. 42 — últimos 2 quadrimestres do mandato (a partir de 01/05/2028). */
export const LRF_ART42_START = new Date('2028-05-01T00:00:00-03:00');
/** Lei 9.504/97 art. 73 VI — vedações nos 3 meses antes da eleição. */
export const ELECTORAL_BAN_START = new Date('2028-07-01T00:00:00-03:00');

export type MilestoneTone = 'ok' | 'info' | 'warn' | 'urgent';

export type MandateMilestone = {
  key: string;
  date: Date;
  label: string;
  /** O que isso significa para a venda — mostrado no card. */
  impact: string;
  tone: MilestoneTone;
  daysUntil: number;
};

const DAY_MS = 24 * 3600 * 1000;

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * Marcos anuais recorrentes (prestação de contas FUNDEB e ciclo orçamentário)
 * + marcos fixos do mandato/eleição. Retorna apenas os futuros dentro do
 * horizonte, ordenados por data.
 */
export function upcomingMilestones(now: Date, horizonDays = 400): MandateMilestone[] {
  const fixed: Array<Omit<MandateMilestone, 'daysUntil'>> = [
    {
      key: 'lrf_art42',
      date: LRF_ART42_START,
      label: 'LRF art. 42 — últimos 2 quadrimestres do mandato',
      impact: 'Prefeituras evitam despesa nova sem caixa. Feche contratos plurianuais antes.',
      tone: 'warn',
    },
    {
      key: 'vedacao_eleitoral',
      date: ELECTORAL_BAN_START,
      label: 'Início das vedações eleitorais (Lei 9.504/97)',
      impact: 'Contratações e publicidade institucional travam. Última chamada do mandato.',
      tone: 'urgent',
    },
    {
      key: 'eleicoes_2028',
      date: ELECTION_2028,
      label: 'Eleições municipais 2028 (1º turno)',
      impact: 'Deals param até a posse. Prepare relacionamento com candidatos e transição.',
      tone: 'urgent',
    },
    {
      key: 'fim_mandato',
      date: MANDATE_END,
      label: 'Fim do mandato 2025–2028',
      impact: 'Nova gestão assume em jan/2029 — reinicia o ciclo de prospecção.',
      tone: 'info',
    },
  ];

  // Recorrências anuais: geramos para o ano corrente e o seguinte e filtramos.
  const yearly: Array<{
    key: string;
    month: number; // 1-12
    day: number;
    label: (year: number) => string;
    impact: string;
    tone: MilestoneTone;
  }> = [
    {
      key: 'parecer_cacs',
      month: 3,
      day: 31,
      label: (y) => `Parecer do CACS-Fundeb sobre as contas de ${y - 1} (referência)`,
      impact: 'Secretarias focadas em prestação de contas — gancho para auditoria FUNDEB.',
      tone: 'info',
    },
    {
      key: 'siope',
      month: 4,
      day: 30,
      label: (y) => `Prazo SIOPE / prestação de contas FUNDEB ${y - 1} (referência)`,
      impact: 'Dados de execução fecham — melhor momento para diagnóstico com números novos.',
      tone: 'info',
    },
    {
      key: 'ploa',
      month: 8,
      day: 31,
      label: (y) => `Elaboração da LOA ${y + 1} (PLOA até fim de agosto/setembro)`,
      impact: 'Janela para entrar no orçamento do ano seguinte — proponha antes do envio.',
      tone: 'warn',
    },
  ];

  const out: MandateMilestone[] = [];
  const horizon = new Date(now.getTime() + horizonDays * DAY_MS);

  for (const m of fixed) {
    if (m.date > now && m.date <= horizon) {
      out.push({ ...m, daysUntil: daysBetween(now, m.date) });
    }
  }
  for (const y of [now.getFullYear(), now.getFullYear() + 1]) {
    for (const r of yearly) {
      const date = new Date(y, r.month - 1, r.day, 23, 59, 59);
      if (date > now && date <= horizon) {
        out.push({
          key: `${r.key}_${y}`,
          date,
          label: r.label(y),
          impact: r.impact,
          tone: r.tone,
          daysUntil: daysBetween(now, date),
        });
      }
    }
  }

  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export type BuyingWindow = {
  /** 1..4 dentro do mandato 2025–2028; null fora dele. */
  mandateYear: number | null;
  phase: 'pre_mandato' | 'lua_de_mel' | 'execucao' | 'ano_eleitoral' | 'vedacao' | 'transicao';
  label: string;
  /** Recomendação comercial curta para o momento atual. */
  advice: string;
  tone: MilestoneTone;
};

/**
 * Em que fase da janela de compra o setor público está agora.
 * Heurística do mercado GovTech: anos 1–2 do mandato são os melhores para
 * vender (orçamento novo + agenda política); o ano eleitoral degrada rápido.
 */
export function currentBuyingWindow(now: Date): BuyingWindow {
  if (now < MANDATE_START) {
    return {
      mandateYear: null,
      phase: 'pre_mandato',
      label: 'Pré-mandato',
      advice: 'Mapeie equipes de transição e prepare propostas para janeiro.',
      tone: 'info',
    };
  }
  if (now > MANDATE_END) {
    return {
      mandateYear: null,
      phase: 'transicao',
      label: 'Transição de mandato',
      advice: 'Nova gestão assumindo — reinicie prospecção com os eleitos.',
      tone: 'info',
    };
  }
  const mandateYear = now.getFullYear() - MANDATE_START.getFullYear() + 1;
  if (now >= ELECTORAL_BAN_START) {
    return {
      mandateYear,
      phase: 'vedacao',
      label: 'Vedação eleitoral',
      advice: 'Contratações novas travadas — foque renovações e relacionamento pós-eleição.',
      tone: 'urgent',
    };
  }
  if (now >= LRF_ART42_START || mandateYear === 4) {
    return {
      mandateYear,
      phase: 'ano_eleitoral',
      label: 'Ano eleitoral',
      advice: 'Janela fechando: priorize deals em negociação e contratos até abril.',
      tone: 'warn',
    };
  }
  if (mandateYear <= 2) {
    return {
      mandateYear,
      phase: 'lua_de_mel',
      label: `Ano ${mandateYear} do mandato — janela quente`,
      advice: 'Melhor momento do ciclo: gestão nova, orçamento em formação. Acelere prospecção.',
      tone: 'ok',
    };
  }
  return {
    mandateYear,
    phase: 'execucao',
    label: `Ano ${mandateYear} do mandato — execução`,
    advice: 'Gestão busca resultados para reeleição — venda impacto rápido e mensurável.',
    tone: 'info',
  };
}
