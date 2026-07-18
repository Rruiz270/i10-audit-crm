'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import { uploadProposal } from '@/lib/actions/proposals';

// Upload manual de proposta pronta (PDF): útil p/ cidades fora de SP ou valor
// negociado, sem passar pelo gerador. Sobe o arquivo direto pro Vercel Blob e
// registra a proposta com externalUrl.
export function ProposalUpload({ opportunityId }: { opportunityId: number }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || pending) return;
    if (file.type !== 'application/pdf') {
      setError('Envie um PDF.');
      return;
    }
    setError(null);
    start(async () => {
      try {
        const blob = await upload(file.name, file, {
          access: 'public',
          handleUploadUrl: '/api/marketing/blob-upload',
          contentType: file.type,
        });
        const fd = new FormData();
        fd.set('opportunityId', String(opportunityId));
        fd.set('externalUrl', blob.url);
        fd.set('filename', file.name);
        if (value.trim()) fd.set('total', value.replace(/[^\d.,]/g, '').replace('.', '').replace(',', '.'));
        const r = await uploadProposal(fd);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setFile(null);
        setValue('');
        if (inputRef.current) inputRef.current.value = '';
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao subir a proposta.');
      }
    });
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3">
      <label className="flex-1 min-w-[180px]">
        <span className="mb-1 block text-[11px] font-semibold text-slate-500">Arquivo PDF</span>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-i10-700 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white hover:file:bg-i10-800"
        />
      </label>
      <label>
        <span className="mb-1 block text-[11px] font-semibold text-slate-500">Valor (R$) — opcional</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="decimal"
          placeholder="Ex.: 90000"
          className="w-36 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={!file || pending}
        className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? 'Enviando…' : '⬆ Subir proposta'}
      </button>
      {error && <span className="w-full text-xs font-medium text-rose-600">{error}</span>}
    </form>
  );
}
