import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { suppressions, consentLog, contacts } from '../schema-marketing';

// ─── Suppression layer — checagem global ANTES de qualquer envio ──────────
// Toda send pipeline DEVE chamar isSuppressed/batchIsSuppressed antes de
// enfileirar. Sem exceção. Adicionar uma linha aqui = silenciamento global
// (todos os projetos, todas as campanhas).

export type SuppressionReason =
  | 'unsubscribe' // usuário clicou descadastrar
  | 'bounce_hard' // email permanentemente inválido (SES bounce hard / Brevo HardBounce)
  | 'complaint' // marcou como spam
  | 'manual' // admin bloqueou via UI
  | 'lgpd_request'; // titular pediu remoção (LGPD art. 18)

export type Channel = 'email' | 'whatsapp';

// Identifier canônico — email lowercase trimmed; phone com prefix 'phone:'
function canonicalize(identifier: string, channel: Channel): string {
  const trimmed = identifier.trim();
  if (channel === 'email') return trimmed.toLowerCase();
  // WhatsApp: normalizar p/ E.164 com prefixo
  return trimmed.startsWith('phone:') ? trimmed : `phone:${trimmed.replace(/[^\d+]/g, '')}`;
}

export async function isSuppressed(
  identifier: string,
  channel: Channel = 'email',
): Promise<boolean> {
  const canonical = canonicalize(identifier, channel);
  const rows = await db
    .select({ id: suppressions.id })
    .from(suppressions)
    .where(and(eq(suppressions.identifier, canonical), eq(suppressions.channel, channel)))
    .limit(1);
  return rows.length > 0;
}

// Batch check — usado antes de enqueueing milhares de sends.
// Retorna Set dos identifiers QUE ESTÃO suprimidos (mais fácil pra filtrar).
export async function batchIsSuppressed(
  identifiers: string[],
  channel: Channel = 'email',
): Promise<Set<string>> {
  if (identifiers.length === 0) return new Set();
  const canonicalized = identifiers.map((i) => canonicalize(i, channel));
  const canonicalToOriginal = new Map<string, string>();
  identifiers.forEach((orig, idx) => canonicalToOriginal.set(canonicalized[idx], orig));

  const rows = await db
    .select({ identifier: suppressions.identifier })
    .from(suppressions)
    .where(and(inArray(suppressions.identifier, canonicalized), eq(suppressions.channel, channel)));

  const suppressedSet = new Set<string>();
  for (const row of rows) {
    const original = canonicalToOriginal.get(row.identifier);
    if (original) suppressedSet.add(original);
  }
  return suppressedSet;
}

export type AddSuppressionInput = {
  identifier: string;
  channel: Channel;
  reason: SuppressionReason;
  // Origem que disparou: 'campaign:42' | 'send:1234' | 'webhook:brevo' | 'admin:user-id'
  sourceRef?: string;
  notes?: string;
  // Quando webhook do provider gera um bounce/complaint, não temos request HTTP do user
  // (sem IP/UA real). Esses campos são pra unsubscribe vindo do form público.
  sourceIp?: string;
  userAgent?: string;
  // Texto exato mostrado ao usuário (importante p/ LGPD audit)
  consentText?: string;
};

// Adiciona suppression + faz upsert no contact (status=unsubscribed/bounced).
// Idempotente — chamadas repetidas não dão erro (UNIQUE constraint no DB).
export async function addSuppression(input: AddSuppressionInput): Promise<void> {
  const canonical = canonicalize(input.identifier, input.channel);

  // Insert suppression — idempotente via ON CONFLICT DO NOTHING
  await db
    .insert(suppressions)
    .values({
      identifier: canonical,
      channel: input.channel,
      reason: input.reason,
      sourceRef: input.sourceRef,
      notes: input.notes,
    })
    .onConflictDoNothing({ target: [suppressions.identifier, suppressions.channel] });

  // Atualizar status do contact (se existir) — apenas pra email; phone TBD
  if (input.channel === 'email') {
    const contactStatus =
      input.reason === 'bounce_hard'
        ? 'bounced'
        : input.reason === 'complaint'
          ? 'complained'
          : 'unsubscribed';
    await db
      .update(contacts)
      .set({ status: contactStatus, updatedAt: new Date() })
      .where(eq(contacts.email, canonical));
  }

  // Log no consent_log — audit trail LGPD
  // Toda suppression é equivalente a opt_out (mesmo bounce — paramos de mandar)
  await db.insert(consentLog).values({
    identifier: canonical,
    channel: input.channel,
    action: input.reason === 'lgpd_request' ? 'data_delete_request' : 'opt_out',
    legalBasis: 'opt_out',
    source:
      input.reason === 'unsubscribe'
        ? 'unsubscribe_link'
        : input.reason === 'manual'
          ? 'admin_manual'
          : 'webhook',
    sourceRef: input.sourceRef,
    sourceIp: input.sourceIp,
    userAgent: input.userAgent,
    consentText: input.consentText,
  });
}

// Remove suppression — uso restrito a admin via UI ("re-engage" raro).
// Não loga em consent_log automaticamente porque é ação admin, não user.
export async function removeSuppression(identifier: string, channel: Channel): Promise<void> {
  const canonical = canonicalize(identifier, channel);
  await db
    .delete(suppressions)
    .where(and(eq(suppressions.identifier, canonical), eq(suppressions.channel, channel)));
}

// Log opt-in (usado quando contato confirma consent voluntariamente)
export async function logOptIn(input: {
  identifier: string;
  channel: Channel;
  source: 'form' | 'api' | 'admin_manual';
  sourceRef?: string;
  sourceIp?: string;
  userAgent?: string;
  consentText?: string;
}): Promise<void> {
  const canonical = canonicalize(input.identifier, input.channel);
  await db.insert(consentLog).values({
    identifier: canonical,
    channel: input.channel,
    action: 'opt_in',
    legalBasis: 'consent',
    source: input.source,
    sourceRef: input.sourceRef,
    sourceIp: input.sourceIp,
    userAgent: input.userAgent,
    consentText: input.consentText,
  });
}
