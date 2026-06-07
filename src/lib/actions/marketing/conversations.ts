'use server';

import { eq, desc, and, or, inArray, isNull, type SQL } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import {
  conversations,
  messages,
  userProjects,
  cannedResponses,
  projects,
  campaigns,
  templates,
} from '@/lib/schema-marketing';
import { opportunities, users, pipelineStages, fundebMunicipalities } from '@/lib/schema';
import { requireUser, type SessionUser } from '@/lib/session';
import { isAdmin } from '@/lib/roles';
import { getWhatsAppProvider } from '@/lib/marketing/providers';
import {
  getTemplateApproval,
  getTemplateBody,
  renderTemplateBody,
} from '@/lib/marketing/whatsapp-health';
import { transcodeToMp3 } from '@/lib/marketing/transcode-audio';

export type ConversationRow = typeof conversations.$inferSelect;

// ─── F3 — escopo de visibilidade (papéis & filas por projeto) ──────────────
// SUPERVISOR (admin/gestor): vê TUDO (todos os projetos, inclusive sem projeto).
// AGENTE (consultor): vê só conversas cujo projectId está nas suas memberships
//   (marketing.user_projects) OU que estejam atribuídas diretamente a ele.
//   Conversas com projectId = null NUNCA aparecem para agentes (triagem só
//   admin/gestor) — evita vazar contatos ainda não roteados.

// Carrega os projectIds que o usuário pode ver. Vazio = sem fila atribuída.
async function getUserProjectIds(userId: string): Promise<number[]> {
  const rows = await db
    .select({ projectId: userProjects.projectId })
    .from(userProjects)
    .where(eq(userProjects.userId, userId));
  return rows.map((r) => r.projectId);
}

// Constrói o filtro WHERE de visibilidade do usuário sobre conversations.
// Para admin/gestor → undefined (sem restrição).
// Para agente → (project_id IN memberships) OR (assigned_to = user.id).
//   Se não tem memberships nem nada atribuído, retorna uma condição
//   impossível (id = -1) para garantir resultado vazio sem 500.
async function visibilityWhere(user: SessionUser): Promise<SQL | undefined> {
  if (isAdmin(user.role)) return undefined;
  const projectIds = await getUserProjectIds(user.id);
  const clauses: SQL[] = [eq(conversations.assignedTo, user.id)];
  if (projectIds.length > 0) {
    // projectId IN (...) — implicitamente exclui project_id = null.
    clauses.push(inArray(conversations.projectId, projectIds));
  }
  const combined = or(...clauses);
  return combined ?? eq(conversations.id, -1);
}

// Re-checagem por-conversa (usada após carregar 1 conversa por id).
// Mesma lógica do WHERE, mas aplicada em memória — guarda getConversation/
// sendReply/claim/close contra IDs adivinhados.
function canSeeConversation(
  user: SessionUser,
  conv: Pick<ConversationRow, 'projectId' | 'assignedTo'>,
  projectIds: number[],
): boolean {
  if (isAdmin(user.role)) return true;
  if (conv.assignedTo && conv.assignedTo === user.id) return true;
  if (conv.projectId != null && projectIds.includes(conv.projectId)) return true;
  return false;
}

// true se o usuário tem QUALQUER acesso ao inbox (≥1 membership) ou é admin.
export async function hasConversationAccess(): Promise<boolean> {
  const user = await requireUser();
  if (isAdmin(user.role)) return true;
  const ids = await getUserProjectIds(user.id);
  return ids.length > 0;
}

// Lista conversas escopadas pela visibilidade do caller. Filtro opcional por status.
export async function listConversations(opts?: { status?: string }) {
  const user = await requireUser();
  const vis = await visibilityWhere(user);
  const statusClause = opts?.status ? eq(conversations.status, opts.status) : undefined;
  const where =
    vis && statusClause ? and(vis, statusClause) : (vis ?? statusClause);
  return db
    .select()
    .from(conversations)
    .where(where)
    .orderBy(desc(conversations.lastMessageAt))
    .limit(200);
}

export async function getConversation(id: number) {
  const user = await requireUser();
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conv) return null;
  // Re-checagem de visibilidade: não vaza conversa por id adivinhado.
  const projectIds = isAdmin(user.role) ? [] : await getUserProjectIds(user.id);
  if (!canSeeConversation(user, conv, projectIds)) return null;
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);
  return { conversation: conv, messages: msgs };
}

// Carrega a conversa e garante que o usuário pode vê-la. Lança em caso contrário.
async function loadVisibleConversation(user: SessionUser, id: number): Promise<ConversationRow> {
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conv) throw new Error('conversa não encontrada');
  const projectIds = isAdmin(user.role) ? [] : await getUserProjectIds(user.id);
  if (!canSeeConversation(user, conv, projectIds)) throw new Error('FORBIDDEN');
  return conv;
}

// Marca como lida ao abrir
export async function markConversationRead(id: number) {
  const user = await requireUser();
  await loadVisibleConversation(user, id);
  await db.update(conversations).set({ unread: false }).where(eq(conversations.id, id));
}

function blockedByTestAllowlist(phone: string): boolean {
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

// Responde uma conversa com mensagem livre (só dentro da janela de 24h).
export async function sendConversationReply(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const conversationId = Number(formData.get('conversationId'));
  const body = String(formData.get('body') ?? '').trim();
  if (!conversationId || !body) throw new Error('conversationId e body obrigatórios');

  // Re-checa visibilidade ANTES de qualquer mutação (guarda contra id adivinhado).
  const conv = await loadVisibleConversation(user, conversationId);

  // Trava da janela de 24h: fora dela, freeform é bloqueado pela Meta (erro 63016).
  const expired = !conv.windowExpiresAt || new Date(conv.windowExpiresAt).getTime() < Date.now();
  if (expired) {
    return {
      ok: false as const,
      error: 'Janela de 24h expirada — responder fora dela exige template aprovado.',
    };
  }

  if (blockedByTestAllowlist(conv.waPhone)) {
    return {
      ok: false as const,
      error: 'Modo de teste: número fora da allowlist (MARKETING_TEST_ALLOWLIST_PHONE).',
    };
  }

  // Envia via provider WhatsApp (freeform)
  const provider = getWhatsAppProvider();
  const result = await provider.send({
    fromNumber: process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886',
    toNumber: conv.waPhone,
    body,
  });

  await db.insert(messages).values({
    conversationId,
    twilioSid: result.ok ? result.providerId : null,
    direction: 'outbound',
    authorUserId: user.id,
    body,
    status: result.ok ? 'sent' : 'failed',
  });

  await db
    .update(conversations)
    .set({
      lastMessageAt: new Date(),
      unread: false,
      // ao responder, assume a conversa se ninguém tinha
      assignedTo: conv.assignedTo ?? user.id,
      status: conv.status === 'closed' ? 'open' : conv.status,
    })
    .where(eq(conversations.id, conversationId));

  revalidatePath('/marketing/conversas');
  if (!result.ok) {
    return { ok: false as const, error: `Falha no envio: ${result.error}` };
  }
  return { ok: true as const };
}

// Envia uma nota de voz (áudio) na conversa (dentro da janela de 24h).
// Fluxo: cliente grava (MediaRecorder) → envia o blob aqui → guardamos no
// Vercel Blob (URL pública, exigida pelo Twilio pra baixar a mídia) → enviamos
// via provider com mediaUrl → inserimos a mensagem outbound com mediaUrls.
// Erros de negócio voltam {ok,error} (não throw). Mesmos guards de
// visibilidade/janela/allowlist do sendConversationReply.
export async function sendAudioReply(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const conversationId = Number(formData.get('conversationId'));
  const audio = formData.get('audio');
  if (!conversationId) throw new Error('conversationId obrigatório');
  if (!(audio instanceof File) || audio.size === 0) {
    return { ok: false as const, error: 'Áudio ausente ou vazio.' };
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      ok: false as const,
      error: 'Storage de mídia não configurado (BLOB_READ_WRITE_TOKEN).',
    };
  }

  const conv = await loadVisibleConversation(user, conversationId);

  // Trava da janela de 24h (mídia freeform também é bloqueada fora dela).
  const expired = !conv.windowExpiresAt || new Date(conv.windowExpiresAt).getTime() < Date.now();
  if (expired) {
    return {
      ok: false as const,
      error: 'Janela de 24h expirada — enviar fora dela exige template aprovado.',
    };
  }

  if (blockedByTestAllowlist(conv.waPhone)) {
    return {
      ok: false as const,
      error: 'Modo de teste: número fora da allowlist (MARKETING_TEST_ALLOWLIST_PHONE).',
    };
  }

  // Transcoda p/ ogg/opus antes de enviar. O MediaRecorder do Chrome grava
  // audio/webm;codecs=opus, que o Twilio→WhatsApp rejeita com 63021 (formato
  // não suportado). O WhatsApp só aceita ogg(opus)/aac/amr/mp3/mp4 — e só ogg
  // vira nota de voz nativa. Inbound já chega como ogg e toca normalmente.
  const inputBytes = Buffer.from(await audio.arrayBuffer());
  const transcoded = await transcodeToMp3(inputBytes);
  if (!transcoded.ok) {
    return { ok: false as const, error: 'Falha ao converter áudio.' };
  }

  // Upload pro Vercel Blob (público) → URL fetchável pelo Twilio. Sempre ogg.
  const contentType = 'audio/mpeg';
  let blobUrl: string;
  try {
    const { put } = await import('@vercel/blob');
    const blob = await put(
      `marketing/voice/${conversationId}-${Date.now()}.mp3`,
      transcoded.data,
      { access: 'public', contentType, addRandomSuffix: true },
    );
    blobUrl = blob.url;
  } catch (e) {
    return {
      ok: false as const,
      error: `Falha ao armazenar áudio: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const provider = getWhatsAppProvider();
  const result = await provider.send({
    fromNumber: process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886',
    toNumber: conv.waPhone,
    mediaUrl: blobUrl,
  });

  await db.insert(messages).values({
    conversationId,
    twilioSid: result.ok ? result.providerId : null,
    direction: 'outbound',
    authorUserId: user.id,
    body: '[áudio]',
    mediaUrls: [{ url: blobUrl, contentType }],
    status: result.ok ? 'sent' : 'failed',
  });

  await db
    .update(conversations)
    .set({
      lastMessageAt: new Date(),
      unread: false,
      assignedTo: conv.assignedTo ?? user.id,
      status: conv.status === 'closed' ? 'open' : conv.status,
    })
    .where(eq(conversations.id, conversationId));

  revalidatePath('/marketing/conversas');
  if (!result.ok) {
    return { ok: false as const, error: `Falha no envio do áudio: ${result.error}` };
  }
  return { ok: true as const };
}

export async function claimConversation(formData: FormData): Promise<void> {
  const user = await requireUser();
  const conversationId = Number(formData.get('conversationId'));
  await loadVisibleConversation(user, conversationId);
  await db
    .update(conversations)
    .set({ assignedTo: user.id })
    .where(eq(conversations.id, conversationId));
  revalidatePath('/marketing/conversas');
}

export async function closeConversation(formData: FormData): Promise<void> {
  const user = await requireUser();
  const conversationId = Number(formData.get('conversationId'));
  await loadVisibleConversation(user, conversationId);
  await db
    .update(conversations)
    .set({ status: 'closed', closedAt: new Date() })
    .where(eq(conversations.id, conversationId));
  revalidatePath('/marketing/conversas');
}

// ─── F2.1 — inbox power-ups ────────────────────────────────────────────────

// Salva notas internas + tags (csv) de uma conversa. Visibilidade garantida.
export async function saveConversationContext(formData: FormData): Promise<void> {
  const user = await requireUser();
  const conversationId = Number(formData.get('conversationId'));
  if (!conversationId) throw new Error('conversationId obrigatório');
  // Re-checa visibilidade ANTES de qualquer mutação (guarda contra id adivinhado).
  await loadVisibleConversation(user, conversationId);

  const notesRaw = formData.get('notes');
  const tagsRaw = formData.get('tags');

  const set: Partial<typeof conversations.$inferInsert> = {};
  // notes só é atualizado se o campo veio no form (permite salvar só tags).
  if (notesRaw !== null) {
    const notes = String(notesRaw).trim();
    set.notes = notes.length ? notes : null;
  }
  if (tagsRaw !== null) {
    const tags = String(tagsRaw)
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    set.tags = tags;
  }
  if (Object.keys(set).length === 0) return;

  await db.update(conversations).set(set).where(eq(conversations.id, conversationId));
  revalidatePath('/marketing/conversas');
}

export type CannedResponse = typeof cannedResponses.$inferSelect;

// Respostas rápidas: globais + (opcionalmente) as do projeto da conversa.
export async function getCannedResponses(projectId?: number | null): Promise<CannedResponse[]> {
  await requireUser();
  const scopeClause = projectId
    ? or(eq(cannedResponses.scope, 'global'), eq(cannedResponses.projectId, projectId))
    : isNull(cannedResponses.projectId);
  return db
    .select()
    .from(cannedResponses)
    .where(scopeClause)
    .orderBy(cannedResponses.scope, cannedResponses.title);
}

// Envia um template Meta aprovado (contentSid HX...). Funciona mesmo com a
// janela de 24h expirada — é o caminho para reabrir a conversa. Visibilidade
// garantida via loadVisibleConversation (sem vazamento cross-project).
export async function sendTemplateReply(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const conversationId = Number(formData.get('conversationId'));
  const contentSid = String(formData.get('contentSid') ?? '').trim();
  if (!conversationId || !contentSid) throw new Error('conversationId e contentSid obrigatórios');

  const conv = await loadVisibleConversation(user, conversationId);

  if (blockedByTestAllowlist(conv.waPhone)) {
    return {
      ok: false as const,
      error: 'Modo de teste: número fora da allowlist (MARKETING_TEST_ALLOWLIST_PHONE).',
    };
  }

  // Variáveis ordenadas opcionais (var_1, var_2, …) → { "1": ..., "2": ... }
  const variables: Record<string, string> = {};
  for (let i = 1; i <= 10; i++) {
    const v = formData.get(`var_${i}`);
    if (v === null) continue;
    const val = String(v).trim();
    if (val) variables[String(i)] = val;
  }

  const provider = getWhatsAppProvider();
  const result = await provider.send({
    fromNumber: process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886',
    toNumber: conv.waPhone,
    templateName: contentSid,
    // O provider exige templateVariables truthy mesmo p/ templates sem variável.
    templateVariables: variables,
  });

  // Grava o corpo RENDERIZADO (texto real enviado), não o placeholder. Busca o
  // body do template na Content API (cache TTL) e substitui {{1}},{{2}},… pelas
  // variáveis. Se não der pra obter, cai pro placeholder legível.
  const tplBody = await getTemplateBody(contentSid).catch(() => null);
  const body = tplBody
    ? renderTemplateBody(tplBody, variables)
    : `[Template ${contentSid}]${
        Object.keys(variables).length ? ` ${Object.values(variables).join(' · ')}` : ''
      }`;

  await db.insert(messages).values({
    conversationId,
    twilioSid: result.ok ? result.providerId : null,
    direction: 'outbound',
    authorUserId: user.id,
    body,
    isTemplate: true,
    templateSid: contentSid,
    status: result.ok ? 'sent' : 'failed',
  });

  await db
    .update(conversations)
    .set({
      lastMessageAt: new Date(),
      unread: false,
      assignedTo: conv.assignedTo ?? user.id,
      status: conv.status === 'closed' ? 'open' : conv.status,
    })
    .where(eq(conversations.id, conversationId));

  revalidatePath('/marketing/conversas');
  if (!result.ok) {
    return { ok: false as const, error: `Falha no envio do template: ${result.error}` };
  }
  return { ok: true as const };
}

// Enriquecimento do painel de contexto: oportunidade CRM (estágio + dono),
// origem (campanha + projeto). Recebe conversationId e re-carrega com guard de
// visibilidade (F3) — NÃO confiar num ConversationRow vindo do cliente (IDOR).
export async function getConversationContext(conversationId: number): Promise<{
  opportunity: { id: number; municipio: string | null; stageLabel: string; owner: string | null } | null;
  campaignName: string | null;
  projectName: string | null;
}> {
  const user = await requireUser();
  const conv = await loadVisibleConversation(user, conversationId);

  let opportunity: {
    id: number;
    municipio: string | null;
    stageLabel: string;
    owner: string | null;
  } | null = null;
  if (conv.opportunityId) {
    const [row] = await db
      .select({
        id: opportunities.id,
        municipio: fundebMunicipalities.nome,
        stage: opportunities.stage,
        stageLabel: pipelineStages.label,
        owner: users.name,
      })
      .from(opportunities)
      .leftJoin(fundebMunicipalities, eq(opportunities.municipalityId, fundebMunicipalities.id))
      .leftJoin(pipelineStages, eq(opportunities.stage, pipelineStages.key))
      .leftJoin(users, eq(opportunities.ownerId, users.id))
      .where(eq(opportunities.id, conv.opportunityId))
      .limit(1);
    if (row) {
      opportunity = {
        id: row.id,
        municipio: row.municipio,
        stageLabel: row.stageLabel ?? row.stage,
        owner: row.owner,
      };
    }
  }

  let campaignName: string | null = null;
  if (conv.campaignId) {
    const [c] = await db
      .select({ name: campaigns.name })
      .from(campaigns)
      .where(eq(campaigns.id, conv.campaignId))
      .limit(1);
    campaignName = c?.name ?? null;
  }

  let projectName: string | null = null;
  if (conv.projectId) {
    const [p] = await db
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, conv.projectId))
      .limit(1);
    projectName = p?.name ?? null;
  }

  return { opportunity, campaignName, projectName };
}

// Templates WhatsApp aprovados pela Meta, escopados ao projeto da conversa
// (ou globais se sem projeto). Filtra por status de aprovação no Twilio.
export async function getApprovedTemplates(
  projectId?: number | null,
): Promise<{ contentSid: string; name: string }[]> {
  await requireUser();
  // Sem projeto → TODOS os templates WhatsApp ativos (across projects). Muitas
  // conversas de inbound têm projectId = null e antes não viam template algum.
  // Com projectId → filtra por ele.
  const channelClause = and(
    eq(templates.channel, 'whatsapp'),
    eq(templates.status, 'active'),
  );
  const whereClause = projectId
    ? and(eq(templates.projectId, projectId), channelClause)
    : channelClause;
  const rows = await db
    .select({ name: templates.name, waTemplateName: templates.waTemplateName })
    .from(templates)
    .where(whereClause);

  const withSid = rows.filter(
    (r): r is { name: string; waTemplateName: string } =>
      !!r.waTemplateName && r.waTemplateName.startsWith('HX'),
  );

  // Confirma aprovação na Meta/Twilio (best-effort, com cache TTL).
  const checked = await Promise.all(
    withSid.map(async (r) => {
      const approval = await getTemplateApproval(r.waTemplateName);
      return { contentSid: r.waTemplateName, name: r.name, approved: approval.status === 'approved' };
    }),
  );
  return checked.filter((t) => t.approved).map(({ contentSid, name }) => ({ contentSid, name }));
}
