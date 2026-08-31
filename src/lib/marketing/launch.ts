import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import {
  campaigns,
  contacts,
  listMembers,
  projects,
  sends,
  templates,
} from '../schema-marketing';
import { generateTrackingToken } from './template-engine';
import { batchIsSuppressed } from './suppression';
import { bulkEnqueueJobs } from './queue';

// ─── Launch — núcleo compartilhado ─────────────────────────────────────────
// Gera 1 send + 1 queue job por contato elegível da audience. Vive aqui (e não
// na server action) porque o disparo agendado é feito por cron, sem sessão.
// A server action `launchCampaign` continua sendo a porta da UI e chama isto.

export type LaunchResult = {
  campaignId: number;
  channel: 'email' | 'whatsapp';
  eligible: number;
  suppressed: number;
  sendsCreated: number;
  dryRun: boolean;
};

export type LaunchOptions = {
  /** Não cria sends — só conta quem receberia. */
  dryRun?: boolean;
  /** Teto de destinatários (usado em teste/dry-run). */
  limit?: number;
};

/**
 * Variáveis disponíveis para os templates, em cima dos atributos do contato.
 * `link_*` só aparecem quando o projeto define `lpBaseUrl` em settings — é o
 * que permite a LP reconhecer quem clicou (o token é único por send).
 */
export function buildMergeVars(
  contact: {
    id: number;
    email: string | null;
    name: string | null;
    ibge: string | null;
    municipio: string | null;
    uf: string | null;
    attributes: unknown;
  },
  trackingToken: string,
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const attrs = (contact.attributes ?? {}) as Record<string, unknown>;
  const vars: Record<string, unknown> = {
    ...attrs,
    nome: contact.name ?? attrs.nome ?? '',
    primeiro_nome: attrs.primeiro_nome ?? String(contact.name ?? '').split(' ')[0] ?? '',
    ibge: contact.ibge,
    municipio: contact.municipio,
    uf: contact.uf,
    email: contact.email,
    link_inscricao: contact.ibge
      ? `https://webinar-fundeb.institutoi10.org.br/?ibge=${contact.ibge}`
      : 'https://institutoi10.org.br',
  };

  const lpBaseUrl = typeof settings.lpBaseUrl === 'string' ? settings.lpBaseUrl : null;
  if (lpBaseUrl) {
    const q = `?t=${encodeURIComponent(trackingToken)}${contact.ibge ? `&ibge=${contact.ibge}` : ''}`;
    vars.link_lp = `${lpBaseUrl}${q}`;
    vars.link_aula = `${lpBaseUrl}/aula${q}`;
    vars.link_apresentacao = `${lpBaseUrl}/apresentacao${q}`;
  }
  const waNumber = typeof settings.waNumber === 'string' ? settings.waNumber : null;
  if (waNumber) {
    const msg = `Olá! Sou ${vars.nome || 'presidente'} da Câmara de ${contact.municipio ?? ''} e quero saber sobre as emendas impositivas.`;
    vars.link_whatsapp = `https://wa.me/${waNumber.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
  }
  return vars;
}

export async function launchCampaignCore(
  campaignId: number,
  options: LaunchOptions = {},
): Promise<LaunchResult> {
  const limit = options.limit && options.limit > 0 ? options.limit : Infinity;

  const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!camp) throw new Error('campaign não encontrada');
  if (camp.status === 'sent' || camp.status === 'sending') {
    throw new Error(`campaign já está ${camp.status}`);
  }

  const [tpl] = await db
    .select({ channel: templates.channel })
    .from(templates)
    .where(eq(templates.id, camp.templateId))
    .limit(1);
  const isWhatsApp = tpl?.channel === 'whatsapp';

  const [proj] = await db
    .select({ settings: projects.settings })
    .from(projects)
    .where(eq(projects.id, camp.projectId))
    .limit(1);
  const settings = (proj?.settings ?? {}) as Record<string, unknown>;

  const audienceContacts = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      phone: contacts.phone,
      whatsapp: contacts.whatsapp,
      name: contacts.name,
      ibge: contacts.ibge,
      municipio: contacts.municipio,
      uf: contacts.uf,
      attributes: contacts.attributes,
    })
    .from(listMembers)
    .innerJoin(contacts, eq(listMembers.contactId, contacts.id))
    .where(and(eq(listMembers.audienceId, camp.audienceId), eq(contacts.status, 'active')));

  if (audienceContacts.length === 0) throw new Error('audience vazia ou sem contatos ativos');

  const destOf = (c: (typeof audienceContacts)[number]) =>
    isWhatsApp ? c.whatsapp ?? c.phone ?? null : c.email ?? null;
  const dests = audienceContacts.map(destOf).filter((d): d is string => Boolean(d));
  const suppressedSet = await batchIsSuppressed(dests, isWhatsApp ? 'whatsapp' : 'email');
  const eligible = audienceContacts.filter((c) => {
    const d = destOf(c);
    return d && !suppressedSet.has(d);
  });
  const final = eligible.slice(0, limit);

  const base: LaunchResult = {
    campaignId,
    channel: isWhatsApp ? 'whatsapp' : 'email',
    eligible: eligible.length,
    suppressed: audienceContacts.length - eligible.length,
    sendsCreated: 0,
    dryRun: Boolean(options.dryRun),
  };
  if (options.dryRun) return { ...base, sendsCreated: final.length };

  // Trava de quota Meta: estourar o tier de conversas iniciadas em 24h queima
  // o número. Vale para o disparo agendado também — é justamente ele que sai
  // sozinho de madrugada, sem ninguém para ler um aviso na tela.
  if (isWhatsApp) {
    // Import sob demanda: whatsapp-health é 'server-only' e, carregado no topo,
    // quebraria qualquer teste que importe este módulo.
    const { getWaQuotaStatus } = await import('./whatsapp-health');
    const quota = await getWaQuotaStatus();
    if (final.length > quota.remaining) {
      throw new Error(
        `Quota Meta insuficiente: ${quota.used.toLocaleString('pt-BR')} de ` +
          `${quota.limit.toLocaleString('pt-BR')} conversas iniciadas nas últimas 24h ` +
          `(restam ${quota.remaining.toLocaleString('pt-BR')}) e este launch criaria ` +
          `${final.length.toLocaleString('pt-BR')}.`,
      );
    }
  }

  await db
    .update(campaigns)
    .set({ status: 'sending', startedAt: new Date(), totalRecipients: final.length })
    .where(eq(campaigns.id, campaignId));

  const chunkSize = 500;
  let sendsCreated = 0;
  for (let i = 0; i < final.length; i += chunkSize) {
    const chunk = final.slice(i, i + chunkSize);
    const inserted = await db
      .insert(sends)
      .values(
        chunk.map((c) => {
          const trackingToken = generateTrackingToken();
          return {
            campaignId,
            contactId: c.id,
            toEmail: isWhatsApp ? null : c.email,
            toPhone: isWhatsApp ? c.whatsapp ?? c.phone : null,
            mergeVars: buildMergeVars(c, trackingToken, settings),
            status: 'queued',
            trackingToken,
          };
        }),
      )
      .returning({ id: sends.id });
    sendsCreated += inserted.length;

    await bulkEnqueueJobs(
      inserted.map((s, idx) => ({
        type: (isWhatsApp ? 'send_whatsapp' : 'send_email') as 'send_whatsapp' | 'send_email',
        payload: { sendId: s.id },
        runAt: new Date(Date.now() + ((i + idx) / (camp.ratePerMinute ?? 60)) * 60_000),
        rateBucket: camp.provider ?? (isWhatsApp ? 'twilio' : 'brevo'),
      })),
    );
  }

  // Sem destinatário elegível a campanha nunca sairia de "sending".
  if (sendsCreated === 0) {
    await db.update(campaigns).set({ status: 'sent', completedAt: new Date() }).where(eq(campaigns.id, campaignId));
  }

  return { ...base, sendsCreated };
}
