'use client';

import * as React from 'react';
import { submitApmCadastro } from '@/lib/actions/apm-cadastro';

type Municipality = { id: number; nome: string; regiao?: string | null };

type ContactRow = {
  id: string; // client-side stable key
  name: string;
  role: string;
  phone: string;
  email: string;
};

function newRow(): ContactRow {
  return {
    id: crypto.randomUUID(),
    name: '',
    role: '',
    phone: '',
    email: '',
  };
}

export function ApmCadastroForm({ municipalities }: { municipalities: Municipality[] }) {
  const [municipalitySearch, setMunicipalitySearch] = React.useState('');
  const [selectedMun, setSelectedMun] = React.useState<Municipality | null>(null);
  const [munOpen, setMunOpen] = React.useState(false);

  const [apmCaptador, setApmCaptador] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [rows, setRows] = React.useState<ContactRow[]>([newRow()]);

  const [pending, setPending] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<null | {
    municipalityName: string;
    contactCount: number;
  }>(null);

  const filteredMun = React.useMemo(() => {
    const q = municipalitySearch.trim().toLowerCase();
    if (!q) return municipalities.slice(0, 40);
    return municipalities
      .filter((m) => m.nome.toLowerCase().includes(q))
      .slice(0, 40);
  }, [municipalitySearch, municipalities]);

  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }

  function updateRow(id: string, field: keyof Omit<ContactRow, 'id'>, value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);

    // Honeypot check — se o campo hidden "website" estiver preenchido, é bot.
    const fd = new FormData(e.currentTarget);
    if ((fd.get('website') as string)?.length) {
      // silent success pra não dar pista pro bot
      setDone({ municipalityName: '—', contactCount: 0 });
      return;
    }

    if (!selectedMun) {
      setErr('Selecione um município');
      return;
    }
    const validRows = rows.filter((r) => r.name.trim().length >= 2);
    if (validRows.length === 0) {
      setErr('Adicione pelo menos 1 contato com nome');
      return;
    }

    setPending(true);
    const res = await submitApmCadastro({
      municipalityId: selectedMun.id,
      apmCaptador: apmCaptador.trim() || undefined,
      notes: notes.trim() || undefined,
      contacts: validRows.map((r) => ({
        name: r.name.trim(),
        role: r.role.trim() || undefined,
        phone: r.phone.trim() || undefined,
        email: r.email.trim() || undefined,
      })),
    });
    setPending(false);

    if (res.ok) {
      setDone({
        municipalityName: res.municipalityName,
        contactCount: res.contactCount,
      });
      // Reset form pra permitir novo cadastro
      setSelectedMun(null);
      setMunicipalitySearch('');
      setApmCaptador('');
      setNotes('');
      setRows([newRow()]);
    } else {
      setErr(res.error);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ background: 'rgba(0,229,160,0.12)', border: '1px solid #00E5A0' }}>
        <div className="text-5xl mb-3">✓</div>
        <h2 className="text-2xl font-bold" style={{ color: '#0A5C5F' }}>
          Lead cadastrado com sucesso!
        </h2>
        <p className="mt-2 text-slate-700">
          <strong>{done.municipalityName}</strong> — {done.contactCount} contato
          {done.contactCount > 1 ? 's' : ''} registrado
          {done.contactCount > 1 ? 's' : ''}.
        </p>
        <p className="text-sm text-slate-600 mt-1">
          Já apareceu no CRM do i10 como oportunidade no estágio &ldquo;Novo&rdquo;.
        </p>
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setDone(null)}
            className="px-5 py-2.5 rounded-full font-semibold text-white transition-colors"
            style={{ background: 'linear-gradient(135deg, #0A5C5F 0%, #0D7377 50%, #11998E 100%)' }}
          >
            + Cadastrar outro município
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Honeypot anti-spam */}
      <div className="hidden" aria-hidden>
        <label>
          Não preencha:
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {/* Município — searchable dropdown */}
      <div className="relative">
        <label className="block text-sm font-semibold mb-2" style={{ color: '#0A5C5F' }}>
          Município *
        </label>
        {selectedMun ? (
          <div
            className="flex items-center justify-between px-4 py-3 rounded-xl border-2"
            style={{ background: 'rgba(13,115,119,0.08)', borderColor: '#0D7377' }}
          >
            <div>
              <div className="font-semibold" style={{ color: '#0A5C5F' }}>
                {selectedMun.nome}
              </div>
              {selectedMun.regiao && (
                <div className="text-xs text-slate-600">{selectedMun.regiao}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedMun(null);
                setMunicipalitySearch('');
                setMunOpen(true);
              }}
              className="text-xs font-semibold px-3 py-1 rounded-full"
              style={{ color: '#0D7377' }}
            >
              Trocar
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              placeholder="Digite o nome do município..."
              value={municipalitySearch}
              onChange={(e) => {
                setMunicipalitySearch(e.target.value);
                setMunOpen(true);
              }}
              onFocus={() => setMunOpen(true)}
              onBlur={() => setTimeout(() => setMunOpen(false), 150)}
              className="w-full px-4 py-3 rounded-xl border-2 text-sm outline-none focus:border-teal-600 transition-colors"
              style={{ borderColor: '#E2E8F0' }}
            />
            {munOpen && filteredMun.length > 0 && (
              <ul
                className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border-2 bg-white shadow-lg"
                style={{ borderColor: '#E2E8F0' }}
              >
                {filteredMun.map((m) => (
                  <li
                    key={m.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setSelectedMun(m);
                      setMunicipalitySearch(m.nome);
                      setMunOpen(false);
                    }}
                    className="px-4 py-2.5 cursor-pointer hover:bg-teal-50 text-sm flex items-center justify-between"
                  >
                    <span style={{ color: '#0A5C5F' }}>{m.nome}</span>
                    {m.regiao && <span className="text-xs text-slate-500">{m.regiao}</span>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* Captador APM */}
      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: '#0A5C5F' }}>
          Seu nome (captador APM)
        </label>
        <input
          type="text"
          value={apmCaptador}
          onChange={(e) => setApmCaptador(e.target.value)}
          placeholder="Ex: João Silva"
          className="w-full px-4 py-3 rounded-xl border-2 text-sm outline-none focus:border-teal-600"
          style={{ borderColor: '#E2E8F0' }}
        />
      </div>

      {/* Contatos — lista repetível */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-semibold" style={{ color: '#0A5C5F' }}>
            Contatos * ({rows.length})
          </label>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full text-white transition-all hover:shadow-md"
            style={{ background: 'linear-gradient(90deg, #00B4D8 0%, #00E5A0 100%)' }}
          >
            + Adicionar contato
          </button>
        </div>
        <div className="space-y-3">
          {rows.map((r, idx) => (
            <div
              key={r.id}
              className="rounded-xl border-2 p-4 relative"
              style={{ borderColor: '#E2E8F0', background: '#FAFBFC' }}
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-bold"
                  style={{
                    background: idx === 0 ? '#0D7377' : 'rgba(13,115,119,0.15)',
                    color: idx === 0 ? '#fff' : '#0A5C5F',
                  }}
                >
                  {idx === 0 ? 'CONTATO PRINCIPAL' : `CONTATO ${idx + 1}`}
                </span>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(r.id)}
                    className="text-xs text-slate-400 hover:text-rose-600 font-semibold"
                  >
                    Remover
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nome completo *</label>
                  <input
                    type="text"
                    value={r.name}
                    onChange={(e) => updateRow(r.id, 'name', e.target.value)}
                    required={idx === 0}
                    placeholder="Ex: Maria Santos"
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-teal-600"
                    style={{ borderColor: '#E2E8F0' }}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Cargo</label>
                  <select
                    value={r.role}
                    onChange={(e) => updateRow(r.id, 'role', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-teal-600 bg-white"
                    style={{ borderColor: '#E2E8F0' }}
                  >
                    <option value="">Selecione...</option>
                    <option value="Prefeito(a)">Prefeito(a)</option>
                    <option value="Vice-Prefeito(a)">Vice-Prefeito(a)</option>
                    <option value="Secretário(a) de Educação">Secretário(a) de Educação</option>
                    <option value="Secretário(a) de Fazenda">Secretário(a) de Fazenda</option>
                    <option value="Chefe de Gabinete">Chefe de Gabinete</option>
                    <option value="Procurador(a) do Município">Procurador(a) do Município</option>
                    <option value="Técnico(a) da Educação">Técnico(a) da Educação</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Telefone / WhatsApp</label>
                  <input
                    type="tel"
                    value={r.phone}
                    onChange={(e) => updateRow(r.id, 'phone', e.target.value)}
                    placeholder="(00) 00000-0000"
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-teal-600"
                    style={{ borderColor: '#E2E8F0' }}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={r.email}
                    onChange={(e) => updateRow(r.id, 'email', e.target.value)}
                    placeholder="nome@municipio.gov.br"
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-teal-600"
                    style={{ borderColor: '#E2E8F0' }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Observações */}
      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: '#0A5C5F' }}>
          Observações sobre o contato
        </label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Contexto do encontro, interesse demonstrado, próximos passos combinados..."
          className="w-full px-4 py-3 rounded-xl border-2 text-sm outline-none focus:border-teal-600"
          style={{ borderColor: '#E2E8F0' }}
        />
      </div>

      {err && (
        <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: '#FEE2E2', color: '#B91C1C' }}>
          {err}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full px-6 py-4 rounded-2xl font-bold text-white text-base transition-all hover:shadow-lg disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #0A5C5F 0%, #0D7377 35%, #11998E 70%, #1B8A5C 100%)' }}
      >
        {pending ? 'Enviando...' : 'Salvar cadastro no CRM →'}
      </button>
    </form>
  );
}
