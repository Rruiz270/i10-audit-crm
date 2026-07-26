import { sql, eq, and, lte, isNull, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  sequences,
  sequenceMembers,
  contacts,
  campaigns,
  templates,
  sends,
} from '../schema-marketing';
import { generateTrackingToken } from './template-engine';
import { isSuppressed } from './suppression';
import { bulkEnqueueJobs } from './queue';

// ─── Sequence Runner — avança membros pelos steps ──────────────────────────
// Chamado pelo cron /api/marketing/cron/sequences a cada minuto.
//
// Lógica por member ready (next_send_at <= NOW, não exited):
//   1. Carrega sequence.steps[member.current_step]
//   2. Se step não existe → sequence completa → exit member
//      (e dispara hook pro on_complete: ex. enroll em long_nurture)
//   3. Checa exitOnTag — se contact tem a tag, exit member sem enviar
//   4. Cria send + queue job pro step atual
//   5. Avança current_step + calcula next_send_at do próximo
//
// Schema do steps (jsonb em sequences.steps):
//   [{ templateId: 1, delayDays: 0 }, { templateId: 2, delayDays: 2 }, ...]
//
// Campos opcionais no nível da sequence (em sequences.steps[0] ou settings):
//   exitOnTag: 'webinar_signup_2026'  → exit qualquer member que tenha essa tag
//   onCompleteEnrollSequenceId: 12    → ao completar, enroll em outra sequence

type SequenceStep = {
  templateId: number;
  delayDays: number;
};

type SequenceConfig = {
  steps: SequenceStep[];
  exitOnTag?: string;
  onCompleteEnrollSequenceId?: number;
};

export type RunResult = {
  processed: number;
  sent: number;
  exited: number;
  errors: number;
  enrolledInNext: number;
  durationMs: number;
};

const BATCH_LIMIT = 50;

export async function runSequences(): Promise<RunResult> {
  const start = Date.now();
  const result: RunResult = {
    processed: 0,
    sent: 0,
    exited: 0,
    errors: 0,
    enrolledInNext: 0,
    durationMs: 0,
  };

  // Pega members prontos pra avançar — limitado pra não estourar timeout
  const ready = await db
    .select({
      memberId: sequenceMembers.id,
      sequenceId: sequenceMembers.sequenceId,
      contactId: sequenceMembers.contactId,
      currentStep: sequenceMembers.currentStep,
    })
    .from(sequenceMembers)
    .where(
      and(
        isNull(sequenceMembers.exitedAt),
        lte(sequenceMembers.nextSendAt, new Date()),
      ),
    )
    .limit(BATCH_LIMIT);

  if (ready.length === 0) {
    result.durationMs = Date.now() - start;
    return result;
  }

  // Pré-carregar sequences únicas (evita query por member)
  const sequenceIds = Array.from(new Set(ready.map((m) => m.sequenceId)));
  const sequenceRows = await db
    .select()
    .from(sequences)
    .where(inArray(sequences.id, sequenceIds));
  const sequenceMap = new Map(sequenceRows.map((s) => [s.id, s]));

  // Pré-carregar contacts únicos
  const contactIds = Array.from(new Set(ready.map((m) => m.contactId)));
  const contactRows = await db
    .select()
    .from(contacts)
    .where(inArray(contacts.id, contactIds));
  const contactMap = new Map(contactRows.map((c) => [c.id, c]));

  // Pré-carregar canal ('email' | 'whatsapp') dos templates dos steps atuais
  const stepTemplateIds = new Set<number>();
  for (const member of ready) {
    const seq = sequenceMap.get(member.sequenceId);
    if (!seq) continue;
    const cfg = (seq.steps ?? []) as unknown as
      | SequenceStep[]
      | { steps?: SequenceStep[] };
    const steps = Array.isArray(cfg) ? cfg : (cfg.steps ?? []);
    const step = steps[member.currentStep];
    if (step) stepTemplateIds.add(step.templateId);
  }
  const templateRows = stepTemplateIds.size
    ? await db
        .select({ id: templates.id, channel: templates.channel })
        .from(templates)
        .where(inArray(templates.id, Array.from(stepTemplateIds)))
    : [];
  const templateChannelMap = new Map(templateRows.map((t) => [t.id, t.channel]));

  for (const member of ready) {
    result.processed += 1;
    try {
      const seq = sequenceMap.get(member.sequenceId);
      if (!seq) {
        await exitMember(member.memberId, 'sequence_missing');
        result.errors += 1;
        continue;
      }

      const config = (seq.steps ?? []) as unknown as
        | SequenceStep[]
        | { steps: SequenceStep[] } & Partial<SequenceConfig>;

      // Suporta 2 formatos: array direto OU objeto { steps, exitOnTag, ... }
      const steps: SequenceStep[] = Array.isArray(config)
        ? config
        : (config.steps ?? []);
      const seqConfig: Partial<SequenceConfig> = Array.isArray(config) ? {} : config;

      const stepIdx = member.currentStep;
      const step = steps[stepIdx];

      // Sequence completed
      if (!step) {
        await exitMember(member.memberId, 'completed');
        result.exited += 1;
        // Hook on_complete: enroll em outra sequence
        if (seqConfig.onCompleteEnrollSequenceId) {
          await enrollContactInSequence(
            member.contactId,
            seqConfig.onCompleteEnrollSequenceId,
          );
          result.enrolledInNext += 1;
        }
        continue;
      }

      const contact = contactMap.get(member.contactId);
      if (!contact || contact.status !== 'active') {
        await exitMember(member.memberId, `contact_${contact?.status ?? 'missing'}`);
        result.exited += 1;
        continue;
      }

      // Exit-on-tag check
      if (seqConfig.exitOnTag) {
        const attrs = (contact.attributes ?? {}) as Record<string, unknown>;
        const tags = Array.isArray(attrs.tags) ? (attrs.tags as string[]) : [];
        if (tags.includes(seqConfig.exitOnTag)) {
          await exitMember(member.memberId, `tag:${seqConfig.exitOnTag}`);
          result.exited += 1;
          continue;
        }
      }

      // Canal do step vem do template: 'whatsapp' → job send_whatsapp;
      // qualquer outra coisa (ou template desconhecido) → email, como antes.
      const channel =
        templateChannelMap.get(step.templateId) === 'whatsapp'
          ? 'whatsapp'
          : 'email';
      const phone = contact.whatsapp ?? contact.phone;

      // Suppression check antes de criar send (o handler de WhatsApp já
      // checa suppression do phone por conta própria em send-pipeline.ts)
      if (
        channel === 'email' &&
        contact.email &&
        (await isSuppressed(contact.email, 'email'))
      ) {
        await exitMember(member.memberId, 'suppressed');
        result.exited += 1;
        continue;
      }

      // Cria send + queue job pro step atual
      // Precisa de uma campanha — sequence step usa templateId + cria
      // "campaign virtual" por sequence ou usa primeira campaign do projeto?
      // Decisão: cada step da sequence cria sends linkados a uma campaign
      // que representa o step. Pra simplificar, vamos exigir que sequence
      // tenha 1 campaign por step (criada na hora se não existir).

      const campaignId = await ensureCampaignForSequenceStep(
        member.sequenceId,
        stepIdx,
        step.templateId,
        seq.projectId,
      );

      const trackingToken = generateTrackingToken();
      const mergeVars: Record<string, unknown> = {
        ...((contact.attributes ?? {}) as Record<string, unknown>),
        nome: contact.name ?? ((contact.attributes as Record<string, unknown> | null)?.nome ?? ''),
        ibge: contact.ibge,
        municipio: contact.municipio,
        uf: contact.uf,
        email: contact.email,
        link_inscricao: contact.ibge
          ? `https://webinar-fundeb.institutoi10.org.br/?ibge=${contact.ibge}`
          : 'https://institutoi10.org.br',
      };

      const [sendRow] = await db
        .insert(sends)
        .values({
          campaignId,
          contactId: contact.id,
          toEmail: channel === 'email' ? contact.email : null,
          toPhone: channel === 'whatsapp' ? phone : null,
          mergeVars,
          status: 'queued',
          trackingToken,
        })
        .returning({ id: sends.id });

      await bulkEnqueueJobs([
        {
          type: channel === 'whatsapp' ? 'send_whatsapp' : 'send_email',
          payload: { sendId: sendRow.id },
          // WhatsApp compartilha o bucket do provider ('twilio') pra respeitar
          // o pause-on-saturation do send-pipeline; email mantém 'sequence'.
          rateBucket: channel === 'whatsapp' ? 'twilio' : 'sequence',
        },
      ]);

      // Avança step e calcula next_send_at
      const nextStep = steps[stepIdx + 1];
      const nextSendAt = nextStep
        ? new Date(Date.now() + nextStep.delayDays * 86_400_000)
        : null; // último step — proxima execução vai marcar como completed

      await db
        .update(sequenceMembers)
        .set({
          currentStep: stepIdx + 1,
          nextSendAt: nextSendAt ?? new Date(), // se acabou, força próxima execução p/ completar
        })
        .where(eq(sequenceMembers.id, member.memberId));

      result.sent += 1;
    } catch (err) {
      result.errors += 1;
      console.error(
        `[sequence-runner] member ${member.memberId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  result.durationMs = Date.now() - start;
  return result;
}

async function exitMember(memberId: number, reason: string): Promise<void> {
  await db
    .update(sequenceMembers)
    .set({ exitedAt: new Date(), exitReason: reason })
    .where(eq(sequenceMembers.id, memberId));
}

// Garante que existe uma campaign representando este step da sequence.
// Idempotente — busca por (sequenceId, stepIdx) embeddado no nome.
async function ensureCampaignForSequenceStep(
  sequenceId: number,
  stepIdx: number,
  templateId: number,
  projectId: number,
): Promise<number> {
  const campaignName = `[seq:${sequenceId}:step:${stepIdx}]`;
  const existing = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.projectId, projectId), eq(campaigns.name, campaignName)))
    .limit(1);
  if (existing[0]) return existing[0].id;

  // Pega audienceId qualquer do projeto (sequence usa audience implícita
  // — aqui só precisamos de um valor pra satisfazer FK)
  const someAudience = await db
    .select({ id: sql<number>`MIN(id)` })
    .from(sql`marketing.audiences`)
    .where(sql`project_id = ${projectId}`)
    .limit(1);

  const audienceId = (someAudience[0] as unknown as { id: number })?.id;
  if (!audienceId) {
    throw new Error(`No audience in project ${projectId} for sequence campaign`);
  }

  const [created] = await db
    .insert(campaigns)
    .values({
      projectId,
      audienceId,
      templateId,
      name: campaignName,
      status: 'sending',
      provider: null,
      ratePerMinute: 60,
      totalRecipients: 0,
    })
    .returning({ id: campaigns.id });
  return created.id;
}

// Helper: enroll contact em uma sequence. Idempotente.
export async function enrollContactInSequence(
  contactId: number,
  sequenceId: number,
  startDelayMs = 0,
): Promise<{ enrolled: boolean; reason?: string }> {
  // Dedupe — não enroll se já tá ativo
  const existing = await db
    .select({ id: sequenceMembers.id, exitedAt: sequenceMembers.exitedAt })
    .from(sequenceMembers)
    .where(
      and(
        eq(sequenceMembers.sequenceId, sequenceId),
        eq(sequenceMembers.contactId, contactId),
      ),
    )
    .limit(1);

  if (existing[0] && !existing[0].exitedAt) {
    return { enrolled: false, reason: 'already_active' };
  }

  await db.insert(sequenceMembers).values({
    sequenceId,
    contactId,
    currentStep: 0,
    nextSendAt: new Date(Date.now() + startDelayMs),
  });
  return { enrolled: true };
}

// Helper: bulk enroll todos contacts de uma audience. Útil pra start campaign.
export async function enrollAudienceInSequence(
  sequenceId: number,
  audienceId: number,
): Promise<{ enrolled: number; skipped: number }> {
  // Pega todos contacts ativos da audience que NÃO estão em sequence ativa
  const result = await db.execute(sql`
    INSERT INTO marketing.sequence_members (sequence_id, contact_id, current_step, next_send_at)
    SELECT ${sequenceId}, lm.contact_id, 0, NOW()
    FROM marketing.list_members lm
    INNER JOIN marketing.contacts c ON lm.contact_id = c.id
    WHERE lm.audience_id = ${audienceId}
      AND c.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM marketing.sequence_members sm
        WHERE sm.sequence_id = ${sequenceId}
          AND sm.contact_id = lm.contact_id
          AND sm.exited_at IS NULL
      )
    RETURNING id
  `);
  const rows = (result as unknown as { rows: Array<unknown> }).rows ?? [];
  const total = await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM marketing.list_members WHERE audience_id = ${audienceId}
  `);
  const totalRows =
    (total as unknown as { rows: Array<{ c: number }> }).rows?.[0]?.c ?? 0;
  return {
    enrolled: rows.length,
    skipped: totalRows - rows.length,
  };
}
