'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';

type Mun = { id: number; nome: string; uf?: string | null; regiao?: string | null };

const UF_LIST = [
  'AC','AL','AM','AP','BA','CE','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
];

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
    ? municipalities.find((m) => m.id === defaultValue) ?? null
    : null;
  const [text, setText] = React.useState(initial?.nome ?? '');
  const [open, setOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<number | null>(defaultValue ?? null);
  const [uf, setUf] = React.useState<string>(initial?.uf ?? '');

  const filtered = React.useMemo(() => {
    const q = text.trim().toLowerCase();
    let pool = municipalities;
    if (uf) pool = pool.filter((m) => m.uf === uf);
    if (!q) return pool.slice(0, 50);
    return pool.filter((m) => m.nome.toLowerCase().includes(q)).slice(0, 50);
  }, [text, uf, municipalities]);

  return (
    <div className="relative flex gap-2">
      <input type="hidden" name={name} value={selectedId ?? ''} required={required} />
      <select
        className="rounded-md border border-slate-200 bg-white px-2 text-sm h-9"
        value={uf}
        onChange={(e) => {
          setUf(e.target.value);
          setText('');
          setSelectedId(null);
          setOpen(true);
        }}
        aria-label="UF"
      >
        <option value="">UF</option>
        {UF_LIST.map((u) => (
          <option key={u} value={u}>{u}</option>
        ))}
      </select>
      <div className="relative flex-1">
        <Input
          placeholder={uf ? `Buscar município de ${uf}…` : 'Selecione uma UF, depois busque…'}
          value={text}
          disabled={!uf && municipalities.length > 200}
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
                  if (m.uf && !uf) setUf(m.uf);
                  setOpen(false);
                }}
              >
                <span className="text-slate-900">{m.nome}</span>
                {m.uf && <span className="ml-2 text-xs font-mono text-slate-500">{m.uf}</span>}
                {m.regiao && <span className="ml-2 text-xs text-slate-500">{m.regiao}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
