import { opportunitiesByStage, listUsersForAssignment } from '@/lib/actions/opportunities';
import { listTasksForOpportunity } from '@/lib/actions/tasks';
import { listStages } from '@/lib/actions/stages';
import { getMyPreferences } from '@/lib/actions/me';
import { requireUser } from '@/lib/session';
import { PipelineFilters } from '@/components/pipeline-filters';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { getConsultoriaSignalsBatch } from '@/lib/bncc-signals';
import { STAGES } from '@/lib/pipeline';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ mine?: string }>;
}) {
  const [user, params, prefs, stages] = await Promise.all([
    requireUser(),
    searchParams,
    (async () => {
      const u = await requireUser();
      return getMyPreferences(u.id);
    })(),
    listStages(),
  ]);

  // Resolve filtro: URL param tem precedência, senão usa a preferência padrão
  const mine =
    params.mine === '1' || params.mine === 'true'
      ? true
      : params.mine === '0' || params.mine === 'false'
        ? false
        : prefs.defaultPipelineFilter === 'mine';

  const [rows, team] = await Promise.all([
    opportunitiesByStage(mine ? { ownerId: user.id } : undefined),
    listUsersForAssignment(),
  ]);

  // Para cards "ganhou" já transferidos, busca sinais do BNCC em lote.
  const handedOff = rows.filter((r) => r.handedOffConsultoriaId && r.stage === 'ganhou');
  const signalsMap = handedOff.length
    ? await getConsultoriaSignalsBatch(
        handedOff.map((r) => ({
          consultoriaId: r.handedOffConsultoriaId,
          municipalityId: r.municipalityId,
        })),
      )
    : {};

  // Tasks count per opportunity (overdue + upcoming) para alerta SLA nos cards.
  // nowMs snapshot único para todas as linhas — satisfaz react-hooks/purity.
  const nowMs = new Date().getTime();
  const taskSummaries: Record<number, { open: number; overdue: number; nextDue: string | null }> = {};
  await Promise.all(
    rows.map(async (r) => {
      const ts = await listTasksForOpportunity(r.id);
      const open = ts.filter((t) => !t.completedAt);
      const overdue = open.filter((t) => new Date(t.dueAt).getTime() < nowMs).length;
      const nextDue = open
        .map((t) => new Date(t.dueAt).getTime())
        .filter((ms) => ms >= nowMs)
        .sort((a, b) => a - b)[0];
      taskSummaries[r.id] = {
        open: open.length,
        overdue,
        nextDue: nextDue ? new Date(nextDue).toISOString() : null,
      };
    }),
  );

  // Contato principal por oportunidade (1 query batelada) — habilita as
  // ações rápidas 💬 ✉️ 📞 direto no card do funil.
  const primaryByOpp: Record<
    number,
    {
      name: string;
      role: string | null;
      email: string | null;
      phone: string | null;
      whatsapp: string | null;
      marketingContactId: number | null;
    }
  > = {};
  if (rows.length) {
    const idList = sql.raw(rows.map((r) => r.id).join(','));
    const res = await db.execute(
      sql`SELECT DISTINCT ON (opportunity_id) opportunity_id, name, role, email, phone, whatsapp, marketing_contact_id
          FROM crm.contacts WHERE opportunity_id IN (${idList})
          ORDER BY opportunity_id, is_primary DESC, id ASC`,
    );
    const list = ((res as unknown as { rows?: Record<string, unknown>[] }).rows ??
      []) as Record<string, unknown>[];
    for (const c of list) {
      primaryByOpp[Number(c.opportunity_id)] = {
        name: String(c.name ?? ''),
        role: (c.role as string | null) ?? null,
        email: (c.email as string | null) ?? null,
        phone: (c.phone as string | null) ?? null,
        whatsapp: (c.whatsapp as string | null) ?? null,
        marketingContactId: c.marketing_contact_id != null ? Number(c.marketing_contact_id) : null,
      };
    }
  }

  // Última interação (campanha lida/entregue, resposta no inbox) por contato
  // principal — mesmo dado da Ficha 360, resumido no rodapé do card.
  const LAST_LABEL: Record<string, string> = {
    read: 'leu mensagem',
    delivered: 'recebeu WA',
    replied: 'respondeu',
    failed: 'falha de envio',
    open: 'abriu e-mail',
    click: 'clicou no e-mail',
    download: 'baixou material',
  };
  const lastIntByMk: Record<number, { label: string; at: string }> = {};
  const mkIds = [
    ...new Set(
      Object.values(primaryByOpp)
        .map((c) => c.marketingContactId)
        .filter((v): v is number => v != null),
    ),
  ];
  if (mkIds.length) {
    const mkList = sql.raw(mkIds.join(','));
    const [evRes, cvRes] = await Promise.all([
      db.execute(
        sql`SELECT DISTINCT ON (contact_id) contact_id, type, occurred_at
            FROM marketing.events WHERE contact_id IN (${mkList})
            ORDER BY contact_id, occurred_at DESC`,
      ),
      db.execute(
        sql`SELECT contact_id, last_inbound_at FROM marketing.conversations
            WHERE contact_id IN (${mkList}) AND last_inbound_at IS NOT NULL`,
      ),
    ]);
    const rowsOf = (r: unknown) =>
      (((r as { rows?: unknown[] }).rows ?? []) as Record<string, unknown>[]);
    for (const e of rowsOf(evRes)) {
      lastIntByMk[Number(e.contact_id)] = {
        label: LAST_LABEL[String(e.type)] ?? String(e.type),
        at: String(e.occurred_at),
      };
    }
    for (const c of rowsOf(cvRes)) {
      const mkId = Number(c.contact_id);
      const at = String(c.last_inbound_at);
      const cur = lastIntByMk[mkId];
      if (!cur || new Date(at) > new Date(cur.at)) {
        lastIntByMk[mkId] = { label: 'respondeu no WhatsApp', at };
      }
    }
  }

  const cardsWithExtras = rows.map((r) => {
    const pc = primaryByOpp[r.id] ?? null;
    return {
      ...r,
      bnccSignals:
        signalsMap[`${r.handedOffConsultoriaId ?? ''}:${r.municipalityId ?? ''}`] ?? null,
      taskSummary: taskSummaries[r.id],
      primaryContact: pc,
      lastInteraction:
        pc?.marketingContactId != null ? (lastIntByMk[pc.marketingContactId] ?? null) : null,
    };
  });

  return (
    <div className="p-6">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="i10-eyebrow mb-1">Pipeline · Arraste para mover</div>
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--i10-navy)' }}>
            Funil de captação{mine && ' · minhas'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Regras de qualificação aplicadas no drop · Sinais do BNCC-CAPTACAO em tempo real nos cards ganhos.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {/* Toggle minhas vs todas (URL-driven, controla o fetch do DB) */}
          <SegmentedControl
            value={mine ? 'mine' : 'all'}
            options={[
              { value: 'all', label: 'Todas', href: '/pipeline?mine=0' },
              { value: 'mine', label: 'Minhas', href: '/pipeline?mine=1' },
            ]}
          />
          <div className="text-xs text-slate-500 text-right">
            {rows.length} oportunidade{rows.length === 1 ? '' : 's'} no funil
            {handedOff.length > 0 && (
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--i10-cyan-dark)' }}>
                {handedOff.length} em execução (BNCC)
              </div>
            )}
          </div>
        </div>
      </header>

      <PipelineFilters
        cards={cardsWithExtras}
        stages={stages}
        team={team}
        viewer={{ id: user.id, role: user.role }}
      />

      <div className="mt-8 text-xs text-slate-400">
        Estágios terminais: {STAGES.filter((s) => s.isTerminal).map((s) => s.label).join(' · ')} ·
        {' '}Para mover para <strong>Perdido</strong>, use a página da oportunidade (motivo obrigatório).
      </div>
    </div>
  );
}
