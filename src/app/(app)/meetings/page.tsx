import Link from 'next/link';
import { listAllMeetings } from '@/lib/actions/meetings';

export const dynamic = 'force-dynamic';

function formatDateTime(d: Date | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR');
}

const KIND_LABEL: Record<string, string> = {
  contato_inicial: 'Contato inicial',
  diagnostico: 'Diagnóstico',
  reuniao_auditoria: 'Auditoria',
  negociacao: 'Negociação',
  follow_up: 'Follow-up',
  outra: 'Outra',
};

export default async function MeetingsPage() {
  const rows = await listAllMeetings();
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60_000);
  const upcoming = rows.filter((m) => !m.completedAt && new Date(m.scheduledAt) >= oneHourAgo);
  const past = rows.filter((m) => !upcoming.includes(m));

  return (
    <div className="px-8 py-8 max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Reuniões</h1>
        <p className="text-sm text-slate-500 mt-1">
          {rows.length} reuniõe{rows.length === 1 ? '' : 's'} · {upcoming.length} futura{upcoming.length === 1 ? '' : 's'}
        </p>
      </header>

      {rows.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-500 italic">
          Nenhuma reunião agendada ainda. Vá para uma oportunidade e agende a primeira.
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Próximas</h2>
          <MeetingsTable rows={upcoming} />
        </section>
      )}
      {past.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Histórico</h2>
          <MeetingsTable rows={past} />
        </section>
      )}
    </div>
  );
}

function MeetingsTable({
  rows,
}: {
  rows: Awaited<ReturnType<typeof listAllMeetings>>;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wider">Quando</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wider">Oportunidade</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wider">Tipo</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((m) => (
            <tr key={m.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-700">{formatDateTime(m.scheduledAt)}</td>
              <td className="px-4 py-3">
                <Link href={`/opportunities/${m.opportunityId}`} className="text-i10-700 hover:underline">
                  {m.municipalityName ?? `Oportunidade #${m.opportunityId}`}
                </Link>
                <div className="text-xs text-slate-500">{m.title ?? '—'}</div>
              </td>
              <td className="px-4 py-3 text-slate-700">{KIND_LABEL[m.kind] ?? m.kind}</td>
              <td className="px-4 py-3">
                {m.completedAt ? (
                  <span className="text-xs text-slate-500">✓ concluída</span>
                ) : m.googleEventId ? (
                  <span className="text-xs text-emerald-700">✓ Calendar</span>
                ) : (
                  <span className="text-xs text-slate-400">agendada</span>
                )}
                {m.meetLink && (
                  <a href={m.meetLink} target="_blank" rel="noopener" className="ml-2 text-xs text-i10-700 hover:underline">
                    Meet →
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
