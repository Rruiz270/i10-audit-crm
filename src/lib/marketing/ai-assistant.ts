import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// ─── IA no Atende ───────────────────────────────────────────────────────────
// Assistente LLM do inbox WhatsApp (/atende): qualifica leads inbound
// (município/cargo/interesse), sugere resposta, resume a conversa para a
// timeline da oportunidade e responde fora do horário comercial.
// Segue o padrão das demais integrações: sem ANTHROPIC_API_KEY, vira no-op
// (feature flag), nunca derruba webhook nem página.

const DEFAULT_MODEL = 'claude-opus-5';
// Fallback server-side: se o classificador de segurança recusar (falso
// positivo), a API re-executa a mesma requisição no modelo abaixo.
const FALLBACK_MODEL = 'claude-opus-4-8';

export function isAiAssistantEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function isAfterHoursReplyEnabled(): boolean {
  return isAiAssistantEnabled() && process.env.ATENDE_AI_AFTER_HOURS === '1';
}

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (!cachedClient) cachedClient = new Anthropic();
  return cachedClient;
}

function getModel(): string {
  return process.env.ATENDE_AI_MODEL?.trim() || DEFAULT_MODEL;
}

// ─── Horário comercial ──────────────────────────────────────────────────────
// ATENDE_AI_BUSINESS_HOURS="8-18" (hora local, seg–sex) no fuso
// GOOGLE_CALENDAR_DEFAULT_TIMEZONE. Fora disso, o auto-atendimento IA pode
// responder (se ATENDE_AI_AFTER_HOURS=1).
export function isWithinBusinessHours(now: Date = new Date()): boolean {
  const tz = process.env.GOOGLE_CALENDAR_DEFAULT_TIMEZONE || 'America/Sao_Paulo';
  const spec = process.env.ATENDE_AI_BUSINESS_HOURS || '8-18';
  const m = spec.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  const start = m ? Number(m[1]) : 8;
  const end = m ? Number(m[2]) : 18;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
      weekday: 'short',
    }).formatToParts(now);
  } catch {
    // Fuso inválido → assume horário comercial (não dispara auto-resposta).
    return true;
  }
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  let hour = Number(parts.find((p) => p.type === 'hour')?.value ?? NaN);
  if (hour === 24) hour = 0; // en-US com hour12:false formata meia-noite como "24"
  if (Number.isNaN(hour)) return true;
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  return hour >= start && hour < end;
}

// Mesma semântica do blockedByTestAllowlist das actions de conversa (que não
// pode ser exportado de um arquivo 'use server'): com a allowlist setada, só
// números listados recebem mensagens.
export function isBlockedByTestAllowlist(phone: string): boolean {
  const allow = process.env.MARKETING_TEST_ALLOWLIST_PHONE;
  if (!allow) return false;
  const digits = phone.replace(/\D/g, '');
  const ok = allow
    .split(',')
    .map((s) => s.trim().replace(/\D/g, ''))
    .filter(Boolean)
    .some((a) => digits.endsWith(a) || a.endsWith(digits));
  return !ok;
}

// ─── Análise da conversa (qualificação + resposta + resumo) ─────────────────

const analysisSchema = z.object({
  qualificacao: z.object({
    municipio: z.string().nullable(),
    cargo: z.string().nullable(),
    interesse: z.enum(['alto', 'medio', 'baixo', 'indefinido']),
    observacao: z.string().nullable(),
  }),
  respostaSugerida: z.string(),
  resumo: z.string(),
});

export type AiAnalysis = z.infer<typeof analysisSchema>;

// JSON Schema equivalente ao zod acima (structured outputs exige
// additionalProperties:false e required em todos os objetos).
const ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    qualificacao: {
      type: 'object',
      properties: {
        municipio: { type: ['string', 'null'], description: 'Município citado na conversa (ou null)' },
        cargo: { type: ['string', 'null'], description: 'Cargo/função do contato (ex.: Secretário de Educação) ou null' },
        interesse: { type: 'string', enum: ['alto', 'medio', 'baixo', 'indefinido'] },
        observacao: { type: ['string', 'null'], description: 'Justificativa curta do nível de interesse' },
      },
      required: ['municipio', 'cargo', 'interesse', 'observacao'],
      additionalProperties: false,
    },
    respostaSugerida: { type: 'string', description: 'Próxima resposta sugerida ao atendente, pronta para enviar' },
    resumo: { type: 'string', description: 'Resumo da conversa para a timeline do CRM' },
  },
  required: ['qualificacao', 'respostaSugerida', 'resumo'],
  additionalProperties: false,
} as const;

const ANALYSIS_SYSTEM = `Você é o assistente de atendimento do Instituto i10, que ajuda municípios brasileiros a recuperar recursos do FUNDEB por meio de auditoria e consultoria. Você apoia atendentes humanos no inbox de WhatsApp.

Sua tarefa: analisar a transcrição de uma conversa de WhatsApp com um lead (geralmente gestores municipais — prefeitos, secretários de educação/finanças) e devolver:
1. Qualificação: município citado, cargo do contato e nível de interesse (alto/medio/baixo/indefinido), com observação curta.
2. respostaSugerida: a próxima mensagem que o atendente deveria enviar — em português do Brasil, tom cordial e profissional de WhatsApp, curta (até ~500 caracteres), sem markdown, avançando a conversa (tirar dúvida, pedir dado que falta na qualificação ou propor próximo passo, como uma reunião).
3. resumo: resumo objetivo da conversa (3 a 6 frases) para registro no CRM: quem é o contato, o que pediu, o que foi respondido e próximos passos.

Baseie-se apenas na transcrição e no contexto fornecidos. Não invente dados.`;

export type AnalyzeInput = {
  contactName: string | null;
  municipio: string | null;
  projectName: string | null;
  stageLabel: string | null;
  messages: { direction: string; body: string | null; isTemplate?: boolean }[];
};

function buildTranscript(msgs: AnalyzeInput['messages']): string {
  return msgs
    .map((m) => {
      const who = m.direction === 'inbound' ? 'Cliente' : 'Atendente';
      const body = m.body?.trim() || '[mídia/anexo sem texto]';
      return `${who}: ${body}`;
    })
    .join('\n');
}

export async function analyzeConversation(input: AnalyzeInput): Promise<AiAnalysis> {
  const contextLines = [
    input.contactName ? `Contato: ${input.contactName}` : null,
    input.municipio ? `Município (CRM): ${input.municipio}` : null,
    input.projectName ? `Projeto: ${input.projectName}` : null,
    input.stageLabel ? `Etapa no funil: ${input.stageLabel}` : null,
  ].filter(Boolean);

  const prompt = [
    contextLines.length > 0 ? `Contexto do CRM:\n${contextLines.join('\n')}` : null,
    `Transcrição da conversa (mais antiga → mais recente):\n${buildTranscript(input.messages)}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const response = await getClient().beta.messages.create({
    model: getModel(),
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-06-01'],
    fallbacks: [{ model: FALLBACK_MODEL }],
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: ANALYSIS_JSON_SCHEMA },
    },
    system: ANALYSIS_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('A IA não pôde analisar esta conversa.');
  }

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const parsed = analysisSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new Error('Resposta da IA em formato inesperado.');
  }
  return parsed.data;
}

// ─── Auto-resposta fora do horário comercial ────────────────────────────────

const AFTER_HOURS_FALLBACK =
  'Olá! Aqui é o assistente virtual do Instituto i10. 👋 Nosso time responde em horário comercial (seg–sex). Enquanto isso, pode me adiantar o seu município e o seu cargo na prefeitura ou secretaria? Assim já preparamos o seu atendimento.';

const AFTER_HOURS_SYSTEM = `Você é o assistente virtual do Instituto i10 (auditoria e recuperação de recursos do FUNDEB para municípios) respondendo no WhatsApp fora do horário comercial.

Escreva UMA mensagem curta (até ~450 caracteres), em português do Brasil, tom cordial de WhatsApp, sem markdown, que:
- se identifique como assistente virtual do Instituto i10;
- reconheça a mensagem recebida (se fizer sentido, responda dúvidas simples sobre o que o Instituto faz);
- avise que o time humano responde no horário comercial (seg–sex);
- peça, se ainda não souber, o município e o cargo da pessoa, para adiantar o atendimento.

Responda apenas com o texto da mensagem, nada mais.`;

export async function generateAfterHoursReply(input: {
  contactName: string | null;
  lastMessage: string;
}): Promise<string> {
  if (!isAiAssistantEnabled()) return AFTER_HOURS_FALLBACK;
  try {
    // Webhook do Twilio tem timeout curto — se a IA demorar, usa o texto fixo.
    const generate = async () => {
      const response = await getClient().beta.messages.create({
        model: getModel(),
        max_tokens: 1000,
        betas: ['server-side-fallback-2026-06-01'],
        fallbacks: [{ model: FALLBACK_MODEL }],
        output_config: { effort: 'low' },
        system: AFTER_HOURS_SYSTEM,
        messages: [
          {
            role: 'user',
            content: `${input.contactName ? `Nome do contato: ${input.contactName}\n` : ''}Mensagem recebida agora:\n${input.lastMessage.slice(0, 1000) || '[mídia sem texto]'}`,
          },
        ],
      });
      if (response.stop_reason === 'refusal') return AFTER_HOURS_FALLBACK;
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      return text || AFTER_HOURS_FALLBACK;
    };
    const timeout = new Promise<string>((resolve) =>
      setTimeout(() => resolve(AFTER_HOURS_FALLBACK), 8000),
    );
    return await Promise.race([generate(), timeout]);
  } catch (err) {
    console.error('generateAfterHoursReply falhou (usando texto fixo):', err);
    return AFTER_HOURS_FALLBACK;
  }
}
