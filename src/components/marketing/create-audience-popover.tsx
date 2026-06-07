'use client';

import { Popover } from '@/components/ui/popover';
import { createAudienceFromFilter } from '@/lib/actions/marketing/leads';

type FilterSnapshot = {
  q: string;
  source: string;
  uf: string;
  role: string;
  status: string;
  audienceId: string;
};

/**
 * Popover "Criar audiência com este filtro" do Leads Hub. Antes era um
 * `<details>` que não fechava ao clicar fora; agora usa o <Popover>.
 */
export function CreateAudiencePopover({
  projectsList,
  filterSnapshot,
  total,
}: {
  projectsList: { id: number; name: string }[];
  filterSnapshot: FilterSnapshot;
  total: number;
}) {
  return (
    <Popover
      align="end"
      triggerClassName="cursor-pointer rounded-md bg-i10-700 px-4 py-2 text-sm font-medium text-white hover:bg-i10-800"
      trigger="Criar audiência com este filtro"
      panelClassName="w-96 rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
    >
      {projectsList.length === 0 ? (
        <p className="text-sm text-slate-500">
          Crie um projeto em Marketing antes de gerar audiências.
        </p>
      ) : (
        <form action={createAudienceFromFilter} className="space-y-3">
          <input type="hidden" name="q" value={filterSnapshot.q} />
          <input type="hidden" name="source" value={filterSnapshot.source} />
          <input type="hidden" name="uf" value={filterSnapshot.uf} />
          <input type="hidden" name="role" value={filterSnapshot.role} />
          <input type="hidden" name="status" value={filterSnapshot.status} />
          <input type="hidden" name="audienceId" value={filterSnapshot.audienceId} />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Nome da audiência <span className="text-red-500">*</span>
            </label>
            <input
              name="name"
              required
              placeholder="Segmento PB · prefeitos"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Projeto <span className="text-red-500">*</span>
            </label>
            <select
              name="projectId"
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {projectsList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-slate-500">
            Inclui todos os {total.toLocaleString('pt-BR')} contatos do filtro (não só a
            página). Você cai no wizard de campanha com ela pré-selecionada.
          </p>
          <button
            type="submit"
            className="rounded-md bg-i10-700 px-4 py-2 text-sm font-medium text-white hover:bg-i10-800"
          >
            Criar e ir para campanha
          </button>
        </form>
      )}
    </Popover>
  );
}
