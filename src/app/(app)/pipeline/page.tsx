import { STAGES, ACTIVE_STAGES } from '@/lib/pipeline';

export default function PipelinePage() {
  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Pipeline</h1>
        <p className="text-sm text-slate-500 mt-1">
          Kanban de oportunidades por estágio
        </p>
      </header>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {ACTIVE_STAGES.map((stage) => (
          <div
            key={stage.key}
            className="shrink-0 w-72 bg-white border border-slate-200 rounded-lg"
          >
            <div className={`px-4 py-3 border-b border-slate-200 border-t-4 border-t-${stage.color} rounded-t-lg`}>
              <div className="flex items-center justify-between">
                <div className="font-medium text-slate-900 text-sm">{stage.label}</div>
                <div className="text-xs text-slate-400">0</div>
              </div>
              <div className="text-xs text-slate-500 mt-1">{stage.description}</div>
            </div>
            <div className="p-3 min-h-[400px] text-center text-xs text-slate-400 italic">
              (cards aparecem aqui)
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 text-xs text-slate-400">
        Estágios terminais: {STAGES.filter((s) => s.isTerminal).map((s) => s.label).join(' · ')}
      </div>
    </div>
  );
}
