'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';

type Mun = { id: number; nome: string; regiao?: string | null };

export function MunicipalityPicker({
  name,
  municipalities,
  defaultValue,
  required,
}: {
  name: string;
  municipalities: Mun[];
  defaultValue?: number | null;
  required?: boolean;
}) {
  const initial = defaultValue
    ? municipalities.find((m) => m.id === defaultValue)?.nome ?? ''
    : '';
  const [text, setText] = React.useState(initial);
  const [open, setOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<number | null>(defaultValue ?? null);

  const filtered = React.useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return municipalities.slice(0, 30);
    return municipalities.filter((m) => m.nome.toLowerCase().includes(q)).slice(0, 30);
  }, [text, municipalities]);

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selectedId ?? ''} required={required} />
      <Input
        placeholder="Buscar município…"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setSelectedId(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-md">
          {filtered.map((m) => (
            <li
              key={m.id}
              className="cursor-pointer px-3 py-2 text-sm hover:bg-i10-50"
              onMouseDown={(e) => {
                e.preventDefault();
                setText(m.nome);
                setSelectedId(m.id);
                setOpen(false);
              }}
            >
              <span className="text-slate-900">{m.nome}</span>
              {m.regiao && <span className="ml-2 text-xs text-slate-500">{m.regiao}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
