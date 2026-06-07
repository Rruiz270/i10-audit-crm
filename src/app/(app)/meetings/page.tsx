import Link from 'next/link';
import { listAllMeetings } from '@/lib/actions/meetings';
import { listOpportunities } from '@/lib/actions/opportunities';
import { KpiTile } from '@/components/ui/kpi-tile';
import { Chip } from '@/components/ui/chip';
import type { Tone } from '@/components/ui/kpi-tile';
import { MeetingScheduler } from '@/components/meeting-scheduler';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  contato_inicial: 'Contato inicial',
  diagnostico: 'Diagnóstico',
  reuniao_auditoria: 'Auditoria',
  negociacao: 'Negociação',
  follow_up: 'Follow-up',
  outra: 'Outra',
};

type MeetingRow = Awaited<ReturnType<typeof listAllMeetings>>[number];

function timeStr(d: Date | string) {
  return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Rótulo do dia: Hoje / Amanhã / dd-mmm
function dayLabel(d: Date, todayStart: number): string {
  const dayStart = new Date(d);
  dayStart.setHours(0, 0, 0, 0);
  const diff = Math.round((dayStart.getTime() - todayStart) / (24 * 3600 * 1000));
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  return dayStart
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    .replace('.', '');
}

export default async function MeetingsPage() {
  const [rows, opportunities] = await Promise.all([listAllMeetings(), listOpportunities()]);
  const now = new Date();
  const nowMs = now.getTime();
  const oneHourAgo = new Date(nowMs - 60 * 60_000);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const endOfToday = todayStart.getTime() + 24 * 3600 * 1000;
  const endOfWeek = todayStart.getTime() + 7 * 24 * 3600 * 1000;
  const since30 = nowMs - 30 * 24 * 3600 * 1000;

  const upcoming = rows.filter((m) => !m.completedAt && new Date(m.scheduledAt) >= oneHourAgo);
  const past = rows.filter((m) => !upcoming.includes(m));

  // KPIs
  const todayCount = upcoming.filter((m) => {
    const t = new Date(m.scheduledAt).getTime();
    return t >= todayStart.getTime() && t < endOfToday;
  }).length;
  const weekCount = upcoming.filter((m) => new Date(m.scheduledAt).getTime() < endOfWeek).length;
  const noMeet = upcoming.filter((m) => !m.meetLink).length;
  const done30 = rows.filter((m) => m.completedAt && new Date(m.completedAt).getTime() >= since30).length;

  // Agrupamento por dia (timeline das próximas).
  const groups = new Map<string, { label: string; items: MeetingRow[] }>();
  for (const m of upcoming) {
    const d = new Date(m.scheduledAt);
    const dayStart = new Date(d);
    dayStart.setHours(0, 0, 0, 0);
    const key = String(dayStart.getTime());
    if (!groups.has(key)) groups.set(key, { label: dayLabel(d, todayStart.getTime()), items: [] });
    groups.get(key)!.items.push(m);
  }
  const orderedGroups = [...groups.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));

  return (
    <div className="max-w-6xl px-8 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-i10-cyan-dark">
            Operação
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
            Reuniões
          </h1>
        </div>
        <MeetingScheduler
          opportunities={opportunities.map((o) => ({ id: o.id, municipalityName: o.municipalityName }))}
        />
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile icon="calendar" tone="navy" value={todayCount} label="Hoje" />
        <KpiTile icon="clock" tone="cyan" value={weekCount} label="Esta semana" />
        <KpiTile
          icon="alert-triangle"
          tone="amber"
          value={noMeet}
          label="Sem link Meet"
          badge={noMeet > 0 ? { text: 'ação', tone: 'amber' } : undefined}
        />
        <KpiTile icon="check" tone="mint" value={done30} label="Concluídas (30d)" />
      </div>

      {rows.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm italic text-slate-500">
          Nenhuma reunião agendada ainda. Agende a primeira pelo botão acima.
        </div>
      )}

      {orderedGroups.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Próximas</h2>
          <div className="space-y-5">
            {orderedGroups.map(([key, g]) => (
              <div key={key}>
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                  {g.label}
                </div>
                <div className="space-y-2">
                  {g.items.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4"
                    >
                      <div className="w-14 shrink-0 text-center">
                        <div className="text-lg font-bold tabular-nums" style={{ color: 'var(--i10-navy)' }}>
                          {timeStr(m.scheduledAt)}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/opportunities/${m.opportunityId}`}
                          className="font-medium text-i10-700 hover:underline"
                        >
                          {m.municipalityName ?? `Oportunidade #${m.opportunityId}`}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Chip tone="cyan">{KIND_LABEL[m.kind] ?? m.kind}</Chip>
                          {m.title && <span className="text-xs text-slate-500">{m.title}</span>}
                          <MeetingStatus m={m} />
                        </div>
                      </div>
                      {m.meetLink && (
                        <a
                          href={m.meetLink}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-i10-cyan to-i10-mint px-3 py-2 text-sm font-semibold text-i10-navy-dark"
                        >
                          Meet →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Histórico</h2>
          <details className="rounded-xl border border-slate-200 bg-white p-4">
            <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-700">
              {past.length} reuniõe{past.length === 1 ? '' : 's'} anteriore{past.length === 1 ? '' : 's'}
            </summary>
            <div className="mt-2">
              {past.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 border-t border-slate-100 py-2.5 text-sm first:border-t-0"
                >
                  <span className="w-32 shrink-0 text-xs text-slate-500">
                    {new Date(m.scheduledAt).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <Link
                    href={`/opportunities/${m.opportunityId}`}
                    className="min-w-0 flex-1 truncate text-slate-700 hover:text-i10-700 hover:underline"
                  >
                    {m.municipalityName ?? `#${m.opportunityId}`}
                    <span className="ml-2 text-xs text-slate-400">{KIND_LABEL[m.kind] ?? m.kind}</span>
                  </Link>
                  <MeetingStatus m={m} />
                </div>
              ))}
            </div>
          </details>
        </section>
      )}
    </div>
  );
}

function MeetingStatus({ m }: { m: MeetingRow }) {
  let tone: Tone = 'slate';
  let label = 'agendada';
  if (m.completedAt) {
    tone = 'slate';
    label = 'concluída';
  } else if (m.googleEventId) {
    tone = 'mint';
    label = 'Calendar';
  }
  return <Chip tone={tone}>{label}</Chip>;
}
