import Link from 'next/link';
import { ilike, or, sql, eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { contacts as mk, conversations } from '@/lib/schema-marketing';
import { opportunities, fundebMunicipalities } from '@/lib/schema';
import { Icon } from '@/components/ui/icon';
import { startConversationWithContact } from '@/lib/actions/marketing/inbox-contacts';

export const dynamic = 'force-dynamic';

// ─── Busca global — contatos (base única) + oportunidades + conversas ───────
// Pessoa achada = pessoa acionável: cada resultado leva à Ficha 360 e traz as
// ações rápidas. Municípios acham oportunidades; texto acha conversas.

const STAGE_PT: Record<string, string> = {
  novo: 'Novo',
  contato_inicial: 'Oportunidades',
  diagnostico_enviado: 'Diagnóstico Enviado',
  follow_up: 'Follow-up',
  reuniao_auditoria: 'Reunião de Auditoria',
  negociacao: 'Negociação',
  ganhou: 'Ganhou',
  perdido: 'Perdido',
};

export default async function GlobalSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const { q } = await searchParams;
  const query = (q ?? '').trim();

  let contactRows: Array<{
    id: number;
    name: string | null;
    role: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    municipio: string | null;
    uf: string | null;
  }> = [];
  let oppRows: Array<{ id: number; stage: string; municipio: string | null; uf: string | null }> = [];
  let convRows: Array<{ id: number; contactName: string | null; waPhone: string; lastMessageAt: Date | null }> = [];

  if (query.length >= 2) {
    const term = `%${query}%`;
    [contactRows, oppRows, convRows] = await Promise.all([
      db
        .select({
          id: mk.id,
          name: mk.name,
          role: mk.role,
          email: mk.email,
          phone: mk.phone,
          whatsapp: mk.whatsapp,
          municipio: mk.municipio,
          uf: mk.uf,
        })
        .from(mk)
        .where(
          or(
            ilike(mk.name, term),
            ilike(mk.email, term),
            ilike(mk.phone, term),
            ilike(mk.whatsapp, term),
            ilike(mk.municipio, term),
          ),
        )
        .orderBy(desc(mk.createdAt))
        .limit(10),
      db
        .select({
          id: opportunities.id,
          stage: opportunities.stage,
          municipio: fundebMunicipalities.nome,
          uf: fundebMunicipalities.uf,
        })
        .from(opportunities)
        .leftJoin(fundebMunicipalities, eq(opportunities.municipalityId, fundebMunicipalities.id))
        .where(
          or(
            ilike(fundebMunicipalities.nome, term),
            sql`${opportunities.notes} ILIKE ${term}`,
          ),
        )
        .orderBy(desc(opportunities.createdAt))
        .limit(8),
      db
        .select({
          id: conversations.id,
          contactName: conversations.contactName,
          waPhone: conversations.waPhone,
          lastMessageAt: conversations.lastMessageAt,
        })
        .from(conversations)
        .where(or(ilike(conversations.contactName, term), ilike(conversations.waPhone, term)))
        .orderBy(desc(conversations.lastMessageAt))
        .limit(6),
    ]);
  }

  return (
    <div className="max-w-3xl px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
          Busca global
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Contatos da base única, oportunidades e conversas — num só lugar.
        </p>
      </header>

      <form action="/search" method="get" className="mb-6 flex gap-2">
        <input
          name="q"
          defaultValue={query}
          autoFocus
          placeholder="Nome, e-mail, telefone, município…"
          className="w-full rounded-lg border-2 border-cyan-300 px-4 py-2.5 text-sm shadow-sm focus:border-cyan-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-i10-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-i10-800"
        >
          Buscar
        </button>
      </form>

      {query.length < 2 ? (
        <p className="text-sm text-slate-400">Digite pelo menos 2 caracteres.</p>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              Contatos (base única) · {contactRows.length}
            </h2>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {contactRows.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-slate-400">Nenhum contato.</div>
              )}
              {contactRows.map((c) => {
                const wa = (c.whatsapp ?? c.phone ?? '').replace(/[^+\d]/g, '');
                return (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <Link href={`/contacts/${c.id}`} className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-900 hover:text-i10-700">
                        {c.name ?? '(sem nome)'}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {[c.role, c.municipio && `${c.municipio}${c.uf ? `/${c.uf}` : ''}`, c.email]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </Link>
                    <div className="flex shrink-0 items-center gap-2.5">
                      {wa ? (
                        <form action={startConversationWithContact} className="inline-flex">
                          <input type="hidden" name="contactId" value={c.id} />
                          <button
                            type="submit"
                            className="text-emerald-600 hover:text-emerald-700"
                            title="WhatsApp — abrir/iniciar conversa"
                          >
                            <Icon name="msg" size={16} />
                          </button>
                        </form>
                      ) : null}
                      {c.email ? (
                        <a href={`mailto:${c.email}`} className="text-sky-600 hover:text-sky-700" title={c.email}>
                          <Icon name="mail" size={16} />
                        </a>
                      ) : null}
                      {wa ? (
                        <a href={`tel:${wa}`} className="text-slate-500 hover:text-slate-700" title="Ligar">
                          <Icon name="phone" size={16} />
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              Oportunidades · {oppRows.length}
            </h2>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {oppRows.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-slate-400">Nenhuma oportunidade.</div>
              )}
              {oppRows.map((o) => (
                <Link
                  key={o.id}
                  href={`/opportunities/${o.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                >
                  <span className="truncate text-sm font-semibold text-slate-900">
                    #{o.id} · {o.municipio ?? 'Oportunidade'}
                    {o.uf ? `/${o.uf}` : ''}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      o.stage === 'ganhou'
                        ? 'bg-emerald-50 text-emerald-700'
                        : o.stage === 'perdido'
                          ? 'bg-slate-100 text-slate-500'
                          : 'bg-cyan-50 text-cyan-700'
                    }`}
                  >
                    {STAGE_PT[o.stage] ?? o.stage}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              Conversas WhatsApp · {convRows.length}
            </h2>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {convRows.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-slate-400">Nenhuma conversa.</div>
              )}
              {convRows.map((cv) => (
                <Link
                  key={cv.id}
                  href={`/marketing/conversas?c=${cv.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                >
                  <span className="truncate text-sm font-semibold text-slate-900">
                    💬 {cv.contactName ?? cv.waPhone}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {cv.lastMessageAt
                      ? new Date(cv.lastMessageAt).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: 'short',
                        })
                      : ''}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
