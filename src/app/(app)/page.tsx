import Link from 'next/link';
import { STAGES } from '@/lib/pipeline';

export default function DashboardPage() {
  return (
    <div className="px-8 py-10 max-w-6xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-600 mt-1">
          Visão geral do pipeline de captação do Instituto i10.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {['Novas', 'Em negociação', 'Ganhas no mês', 'Perdidas no mês'].map((label) => (
          <div key={label} className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="text-3xl font-bold text-slate-900 mt-2">—</div>
          </div>
        ))}
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Pipeline configurado</h2>
        <div className="flex flex-wrap gap-2">
          {STAGES.filter((s) => !s.isTerminal || s.isWon).map((s) => (
            <div
              key={s.key}
              className={`px-3 py-1.5 rounded-full text-xs font-medium text-white bg-${s.color}`}
            >
              {s.order}. {s.label}
            </div>
          ))}
        </div>
        <div className="mt-6">
          <Link
            href="/pipeline"
            className="inline-flex items-center gap-2 text-sm font-medium text-i10-700 hover:text-i10-800"
          >
            Ver Kanban completo →
          </Link>
        </div>
      </section>
    </div>
  );
}
