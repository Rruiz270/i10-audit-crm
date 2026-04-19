'use client';

import * as React from 'react';
import { signupConsultor } from '@/lib/actions/signup';

export function SignupForm() {
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await signupConsultor(fd);
    setPending(false);
    if (res.ok) setDone(true);
    else setErr(res.error);
  }

  if (done) {
    return (
      <div
        className="rounded-md p-5 text-center"
        style={{ background: 'var(--i10-mint-wash)', border: '1px solid var(--i10-mint)' }}
      >
        <div
          className="text-3xl mb-3"
          style={{ color: 'var(--i10-mint-dark)' }}
          aria-hidden
        >
          📨
        </div>
        <h2
          className="text-lg font-bold"
          style={{ color: 'var(--i10-navy-dark)' }}
        >
          Cadastro recebido
        </h2>
        <p className="text-sm text-slate-700 mt-2">
          Um admin vai revisar em breve. Assim que aprovado, você já consegue
          entrar usando o email e senha que cadastrou.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Nome completo</label>
        <input
          name="name"
          type="text"
          required
          minLength={2}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm"
          placeholder="Fulano de Tal"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Email institucional</label>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm"
          placeholder="fulano@i10.org"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Senha</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm"
          placeholder="mínimo 8 caracteres"
        />
      </div>

      {err && (
        <div className="rounded-md bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
          {err}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full text-white font-semibold rounded-md py-2.5 transition-colors disabled:opacity-50"
        style={{ background: 'var(--i10-navy)' }}
      >
        {pending ? 'Enviando…' : 'Solicitar acesso'}
      </button>
    </form>
  );
}
