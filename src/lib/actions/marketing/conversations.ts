'use server';

import { eq, desc, and, or, inArray, isNull, sql, type SQL } from 'drizzle-orm';
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
  contacts,
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
import { MEDIA_ALLOWED_TYPES } from '@/lib/marketing/media-types';

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

// Envia um arquivo (imagem/documento/vídeo) já hospedado no Vercel Blob.
// Fluxo CLIENT-DIRECT: o browser faz upload do File direto pro Blob via
// `@vercel/blob/client` (rota /api/marketing/blob-upload emite o token), o que
// CONTORNA o limite de body da função serverless (~4.5MB) e o limite de 1MB do
// Server Action. Aqui recebemos só a URL resultante (payload minúsculo) e
// enviamos via Twilio. Erros de negócio voltam {ok,error} (não throw). Mesmos
// guards de visibilidade/janela/allowlist do sendConversationReply.
export async function sendMediaUrlReply(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const conversationId = Number(formData.get('conversationId'));
  const mediaUrl = String(formData.get('mediaUrl') ?? '').trim();
  const contentType = String(formData.get('contentType') ?? '').trim().toLowerCase();
  const filename = String(formData.get('filename') ?? '').trim() || 'arquivo';
  if (!conversationId) throw new Error('conversationId obrigatório');
  if (!mediaUrl) {
    return { ok: false as const, error: 'URL da mídia ausente.' };
  }

  // Validação de tipo (mesma allowlist server-enforced no token de upload).
  if (!MEDIA_ALLOWED_TYPES.has(contentType)) {
    return {
      ok: false as const,
      error: `Tipo de arquivo não suportado (${contentType || 'desconhecido'}).`,
    };
  }

  // Validação de HOST do mediaUrl — só aceitamos Vercel Blob (https). Impede
  // que um cliente forje uma URL arbitrária e force o Twilio a buscá-la (SSRF/
  // abuso). Match por hostname (não substring) p/ não cair em bypass do tipo
  // "https://evil.com/.blob.vercel-storage.com/".
  let parsed: URL;
  try {
    parsed = new URL(mediaUrl);
  } catch {
    return { ok: false as const, error: 'URL da mídia inválida.' };
  }
  if (
    parsed.protocol !== 'https:' ||
    !parsed.hostname.toLowerCase().endsWith('.blob.vercel-storage.com')
  ) {
    return { ok: false as const, error: 'Origem da mídia não permitida.' };
  }

  const conv = await loadVisibleConversation(user, conversationId);

  // Trava da janela de 24h (mídia freeform também é bloqueada fora dela).
  const expired = !conv.windowExpiresAt || new Date(conv.windowExpiresAt).getTime() < Date.now();
  if (expired) {
    return {
      ok: false as const,
      error: 'Janela de 24h expirada — fora dela só template.',
    };
  }

  if (blockedByTestAllowlist(conv.waPhone)) {
    return {
      ok: false as const,
      error: 'Modo de teste: número fora da allowlist (MARKETING_TEST_ALLOWLIST_PHONE).',
    };
  }

  // O WhatsApp recusa mídia > 16MB (erro 63019). Para arquivos grandes,
  // enviamos como LINK de download (URL pública do Blob) em vez de anexo
  // nativo — assim qualquer tamanho chega (o destinatário clica e baixa).
  const WA_MEDIA_MAX = 16 * 1024 * 1024;
  let asLink = false;
  try {
    const head = await fetch(mediaUrl, { method: 'HEAD' });
    if (Number(head.headers.get('content-length') ?? '0') > WA_MEDIA_MAX) asLink = true;
  } catch {
    /* sem content-length → tenta como mídia mesmo */
  }

  const provider = getWhatsAppProvider();
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886';
  const result = asLink
    ? await provider.send({
        fromNumber,
        toNumber: conv.waPhone,
        body: `${filename}\n${mediaUrl}`,
      })
    : await provider.send({ fromNumber, toNumber: conv.waPhone, mediaUrl });

  await db.insert(messages).values({
    conversationId,
    twilioSid: result.ok ? result.providerId : null,
    direction: 'outbound',
    authorUserId: user.id,
    body: asLink ? `[arquivo] ${filename} (link)` : `[arquivo] ${filename}`,
    mediaUrls: [{ url: mediaUrl, contentType, filename }],
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
    return { ok: false as const, error: `Falha no envio do arquivo: ${result.error}` };
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

// ─── Moderação de mensagens no CRM (editar / apagar) ───────────────────────
// IMPORTANTE: edita/apaga só o ESPELHO no nosso banco. NÃO altera nem remove a
// mensagem que já foi entregue no WhatsApp do contato (a API da Meta/Twilio não
// permite "desenviar"). Serve para corrigir registro e esconder do time.
//
// Gate "apenas meu usuário por enquanto": liberado só para role === 'admin'
// (hoje, só o Raphael). Para estender ao time, troque por isAdmin(user.role)
// ou uma allowlist de e-mails; para restringir a 1 e-mail, cheque user.email.
function canModerateMessages(user: SessionUser): boolean {
  return user.role === 'admin';
}

// Carrega a mensagem e garante que o usuário pode moderá-la (admin + vê a
// conversa). Lança em caso contrário. Retorna a linha da mensagem.
async function loadModerableMessage(messageId: number) {
  const user = await requireUser();
  if (!canModerateMessages(user)) throw new Error('FORBIDDEN');
  const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!msg) throw new Error('mensagem não encontrada');
  // Re-checa visibilidade da conversa (não vaza/mexe por id adivinhado).
  await loadVisibleConversation(user, msg.conversationId);
  return msg;
}

// Edita o corpo de uma mensagem no CRM e marca como "editada".
export async function editMessage(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const messageId = Number(formData.get('messageId'));
  const body = String(formData.get('body') ?? '').trim();
  if (!messageId) throw new Error('messageId obrigatório');
  if (!body) return { ok: false as const, error: 'Mensagem vazia.' };

  const msg = await loadModerableMessage(messageId);
  if (msg.deletedAt) return { ok: false as const, error: 'Mensagem apagada não pode ser editada.' };

  await db
    .update(messages)
    .set({ body, editedAt: new Date() })
    .where(eq(messages.id, messageId));
  revalidatePath('/marketing/conversas');
  return { ok: true as const };
}

// Soft-delete: esconde a mensagem do thread, preservando a linha (auditoria).
export async function deleteMessage(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const messageId = Number(formData.get('messageId'));
  if (!messageId) throw new Error('messageId obrigatório');

  await loadModerableMessage(messageId);
  await db
    .update(messages)
    .set({ deletedAt: new Date() })
    .where(eq(messages.id, messageId));
  revalidatePath('/marketing/conversas');
  return { ok: true as const };
}

// Restaura uma mensagem soft-deletada (desfaz o apagar).
export async function restoreMessage(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const messageId = Number(formData.get('messageId'));
  if (!messageId) throw new Error('messageId obrigatório');

  await loadModerableMessage(messageId);
  await db
    .update(messages)
    .set({ deletedAt: null })
    .where(eq(messages.id, messageId));
  revalidatePath('/marketing/conversas');
  return { ok: true as const };
}

// ═══════════════════════════════════════════════════════════════════════════
// F4 — App de Atendimento (/atende) — inbox mobile multiusuário
// ═══════════════════════════════════════════════════════════════════════════
// Mesmo backend do inbox desktop (/marketing/conversas), mas com loaders
// agregados prontos para a UI mobile (lista "meus" + "fila") e para o console
// do supervisor, além da ação de TRANSFERIR atendimento (reatribui assignedTo
// para outro usuário — o claim existente só assume para si mesmo).

const OPEN_STATUSES = ['open', 'pending'] as const;

export type AtendeItem = {
  id: number;
  contactName: string | null;
  waPhone: string;
  muni: string | null;
  uf: string | null;
  projectId: number | null;
  projectName: string | null;
  status: string;
  assignedTo: string | null;
  unread: boolean;
  windowExpiresAt: string | null;
  lastMessageAt: string | null;
  preview: string | null;
  previewOutbound: boolean;
};

export type AtendeInbox = {
  me: { id: string; name: string | null; role: string; isSupervisor: boolean };
  mine: AtendeItem[];
  queue: AtendeItem[];
  projectName: string | null;
};

// Carrega o inbox do atendente: conversas visíveis (F3) separadas em
// "meus atendimentos" (assignedTo = eu, abertas) e "fila" (sem dono, abertas).
// Enriquece com município (contato de marketing), projeto e preview da última
// mensagem — tudo em ≤3 queries (sem N+1).
export async function getAtendeInbox(): Promise<AtendeInbox> {
  const user = await requireUser();
  const supervisor = isAdmin(user.role);
  const vis = await visibilityWhere(user);

  const rows = await db
    .select({
      id: conversations.id,
      contactName: conversations.contactName,
      waPhone: conversations.waPhone,
      muni: contacts.municipio,
      uf: contacts.uf,
      projectId: conversations.projectId,
      projectName: projects.name,
      status: conversations.status,
      assignedTo: conversations.assignedTo,
      unread: conversations.unread,
      windowExpiresAt: conversations.windowExpiresAt,
      lastMessageAt: conversations.lastMessageAt,
    })
    .from(conversations)
    .leftJoin(contacts, eq(conversations.contactId, contacts.id))
    .leftJoin(projects, eq(conversations.projectId, projects.id))
    .where(vis)
    .orderBy(desc(conversations.lastMessageAt))
    .limit(200);

  // Preview da última mensagem por conversa (1 query, agrupado em memória).
  const ids = rows.map((r) => r.id);
  const previewByConv = new Map<number, { body: string | null; outbound: boolean }>();
  if (ids.length) {
    const msgs = await db
      .select({
        conversationId: messages.conversationId,
        body: messages.body,
        direction: messages.direction,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(and(inArray(messages.conversationId, ids), isNull(messages.deletedAt)))
      .orderBy(messages.createdAt);
    for (const m of msgs) {
      // ordenado asc → o último set vence (última mensagem da conversa)
      previewByConv.set(m.conversationId, {
        body: m.body,
        outbound: m.direction === 'outbound',
      });
    }
  }

  const toItem = (r: (typeof rows)[number]): AtendeItem => {
    const p = previewByConv.get(r.id);
    return {
      id: r.id,
      contactName: r.contactName,
      waPhone: r.waPhone,
      muni: r.muni ?? null,
      uf: r.uf ?? null,
      projectId: r.projectId,
      projectName: r.projectName ?? null,
      status: r.status,
      assignedTo: r.assignedTo,
      unread: r.unread,
      windowExpiresAt: r.windowExpiresAt ? new Date(r.windowExpiresAt).toISOString() : null,
      lastMessageAt: r.lastMessageAt ? new Date(r.lastMessageAt).toISOString() : null,
      preview: p?.body ?? null,
      previewOutbound: p?.outbound ?? false,
    };
  };

  const open = rows.filter((r) => (OPEN_STATUSES as readonly string[]).includes(r.status));
  const mine = open.filter((r) => r.assignedTo === user.id).map(toItem);
  const queue = open.filter((r) => r.assignedTo == null).map(toItem);

  // Nome do projeto "principal" do usuário (para o cabeçalho do app).
  let projectName: string | null = null;
  if (!supervisor) {
    const pid = await getUserProjectIds(user.id);
    if (pid.length) {
      const [p] = await db
        .select({ name: projects.name })
        .from(projects)
        .where(eq(projects.id, pid[0]))
        .limit(1);
      projectName = p?.name ?? null;
    }
  }

  return {
    me: { id: user.id, name: user.name, role: user.role, isSupervisor: supervisor },
    mine,
    queue,
    projectName,
  };
}

export type AssignableAgent = { id: string; name: string; role: string; open: number };

// Lista usuários que podem receber uma transferência (aprovados), já com a
// contagem de conversas abertas de cada um. Usado no sheet "Transferir".
export async function listAssignableAgents(): Promise<AssignableAgent[]> {
  await requireUser();
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      displayName: users.displayName,
      role: users.role,
      open: sql<number>`count(${conversations.id}) filter (where ${conversations.status} in ('open','pending'))`,
    })
    .from(users)
    .leftJoin(conversations, eq(conversations.assignedTo, users.id))
    .where(eq(users.approvalStatus, 'approved'))
    .groupBy(users.id, users.name, users.displayName, users.role)
    .orderBy(users.name);
  return rows.map((r) => ({
    id: r.id,
    name: r.displayName || r.name || r.id,
    role: r.role,
    open: Number(r.open ?? 0),
  }));
}

// Transfere o atendimento para OUTRO usuário (reatribui assignedTo). O claim
// existente só assume para si; aqui o dono/supervisor passa a bola. Guarda de
// visibilidade: quem transfere precisa ver a conversa; o destino precisa existir.
export async function transferConversation(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const conversationId = Number(formData.get('conversationId'));
  const toUserId = String(formData.get('toUserId') ?? '').trim();
  if (!conversationId || !toUserId) throw new Error('conversationId e toUserId obrigatórios');

  await loadVisibleConversation(user, conversationId);

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, toUserId), eq(users.approvalStatus, 'approved')))
    .limit(1);
  if (!target) return { ok: false as const, error: 'Usuário destino inválido.' };

  await db
    .update(conversations)
    .set({ assignedTo: toUserId, status: 'open' })
    .where(eq(conversations.id, conversationId));

  revalidatePath('/atende');
  revalidatePath('/marketing/conversas');
  return { ok: true as const };
}

// Devolve a conversa para a fila (remove o dono). Só quem enxerga pode.
export async function returnConversationToQueue(
  formData: FormData,
): Promise<{ ok: true }> {
  const user = await requireUser();
  const conversationId = Number(formData.get('conversationId'));
  await loadVisibleConversation(user, conversationId);
  await db
    .update(conversations)
    .set({ assignedTo: null })
    .where(eq(conversations.id, conversationId));
  revalidatePath('/atende');
  revalidatePath('/marketing/conversas');
  return { ok: true as const };
}

export type SupervisorAgent = {
  id: string;
  name: string;
  role: string;
  open: number;
  unread: number;
};

export type SupervisorRow = {
  id: number;
  contactName: string | null;
  muni: string | null;
  uf: string | null;
  projectName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  status: string;
  windowExpiresAt: string | null;
  lastMessageAt: string | null;
};

export type SupervisorData = {
  kpis: { open: number; queue: number; outsideWindow: number; resolvedToday: number };
  agents: SupervisorAgent[];
  rows: SupervisorRow[];
};

// Console do supervisor — visão de TUDO (sem filtro de dono). admin/gestor.
export async function getSupervisorData(): Promise<SupervisorData> {
  const user = await requireUser();
  if (!isAdmin(user.role)) throw new Error('FORBIDDEN');

  const rows = await db
    .select({
      id: conversations.id,
      contactName: conversations.contactName,
      muni: contacts.municipio,
      uf: contacts.uf,
      projectName: projects.name,
      ownerId: conversations.assignedTo,
      ownerName: users.name,
      ownerDisplay: users.displayName,
      status: conversations.status,
      windowExpiresAt: conversations.windowExpiresAt,
      lastMessageAt: conversations.lastMessageAt,
      unread: conversations.unread,
    })
    .from(conversations)
    .leftJoin(contacts, eq(conversations.contactId, contacts.id))
    .leftJoin(projects, eq(conversations.projectId, projects.id))
    .leftJoin(users, eq(conversations.assignedTo, users.id))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(400);

  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const isOpen = (s: string) => s === 'open' || s === 'pending';
  const open = rows.filter((r) => isOpen(r.status));
  const queue = open.filter((r) => r.ownerId == null);
  const outsideWindow = open.filter(
    (r) => !r.windowExpiresAt || new Date(r.windowExpiresAt).getTime() < now,
  );
  const resolvedToday = rows.filter(
    (r) =>
      r.status === 'closed' &&
      r.lastMessageAt &&
      new Date(r.lastMessageAt).getTime() >= startOfToday.getTime(),
  );

  // Agentes: contagem de abertas + não lidas por dono.
  const agentMap = new Map<string, SupervisorAgent>();
  const agentRows = await db
    .select({ id: users.id, name: users.name, displayName: users.displayName, role: users.role })
    .from(users)
    .where(eq(users.approvalStatus, 'approved'))
    .orderBy(users.name);
  for (const a of agentRows) {
    agentMap.set(a.id, {
      id: a.id,
      name: a.displayName || a.name || a.id,
      role: a.role,
      open: 0,
      unread: 0,
    });
  }
  for (const r of open) {
    if (!r.ownerId) continue;
    const a = agentMap.get(r.ownerId);
    if (!a) continue;
    a.open += 1;
    if (r.unread) a.unread += 1;
  }
  const agents = [...agentMap.values()]
    .filter((a) => a.open > 0 || a.role === 'consultor' || a.role === 'gestor')
    .sort((a, b) => b.open - a.open);

  return {
    kpis: {
      open: open.length,
      queue: queue.length,
      outsideWindow: outsideWindow.length,
      resolvedToday: resolvedToday.length,
    },
    agents,
    rows: rows.map((r) => ({
      id: r.id,
      contactName: r.contactName,
      muni: r.muni ?? null,
      uf: r.uf ?? null,
      projectName: r.projectName ?? null,
      ownerId: r.ownerId,
      ownerName: r.ownerDisplay || r.ownerName || null,
      status: r.status,
      windowExpiresAt: r.windowExpiresAt ? new Date(r.windowExpiresAt).toISOString() : null,
      lastMessageAt: r.lastMessageAt ? new Date(r.lastMessageAt).toISOString() : null,
    })),
  };
}
