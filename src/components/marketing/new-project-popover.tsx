'use client';

import { Popover } from '@/components/ui/popover';
import { createProject } from '@/lib/actions/marketing/projects';

/**
 * Popover "Novo projeto" do hub de Marketing. Antes era um `<details>` que
 * nunca fechava ao clicar fora; agora usa o <Popover> reutilizável.
 */
export function NewProjectPopover() {
  return (
    <Popover
      align="end"
      triggerClassName="cursor-pointer rounded-md bg-i10-700 px-4 py-2 text-sm font-medium text-white hover:bg-i10-800"
      trigger="+ Novo projeto"
      panelClassName="w-96 rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
    >
      <form action={createProject} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Nome <span className="text-red-500">*</span>
          </label>
          <input
            name="name"
            type="text"
            required
            placeholder="Webinar FUNDEB Brasil 2026"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Descrição</label>
          <textarea
            name="description"
            rows={2}
            placeholder="Captação de prefeitos e secretários…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-i10-700 px-4 py-2 text-sm font-medium text-white hover:bg-i10-800"
        >
          Criar projeto
        </button>
      </form>
    </Popover>
  );
}
