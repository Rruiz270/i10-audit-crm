import Link from 'next/link';
import { notFound } from 'next/navigation';
import { startConversationWithContact } from '@/lib/actions/marketing/inbox-contacts';
import { getContactFicha, type TimelineItem } from '@/lib/queries/contact-ficha';

export const dynamic = 'force-dynamic';

// ─── Ficha Contato 360 ───────────────────────────────────────────────────────
// Uma pessoa da base única: cabeçalho + ações rápidas (💬 ✉️ 📞) + timeline
// unificada (campanhas + inbox + CRM) + oportunidades vinculadas via ponte.

function digits(s: string | null): string {
  return (s ?? '').replace(/\D/g, '');
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const SRC_STYLE: Record<TimelineItem['src'], string> = {
  marketing: 'bg-cyan-50 text-cyan-700',
  inbox: 'bg-emerald-50 text-emerald-700',
  crm: 'bg-slate-100 text-slate-600',
};

function iconFor(kind: string): string {
  if (kind.startsWith('msg:in')) return '💬';
  if (kind.startsWith('msg:out')) return '📤';
  if (kind.includes('read') || kind.includes('open')) return '✓✓';
  if (kind.includes('click')) return '🔗';
  if (kind.includes('delivered')) return '✓';
  if (kind.includes('failed') || kind.includes('bounce')) return '⚠️';
  if (kind === 'meeting') return '🤝';
  if (kind.startsWith('activity:call') || kind.includes('ligacao')) return '📞';
  if (kind.startsWith('activity:stage')) return '▸';
  if (kind.startsWith('activity')) return '📝';
  if (kind.startsWith('send')) return '📨';
  return '•';
}

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

export default async function ContactFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getContactFicha(Number(id));
  if (!data) notFound();

  const { contact, opps, conversationId, windowOpen, summary, timeline } = data;
  const wa = digits(contact.whatsapp) || digits(contact.phone);
  const initials = (contact.name ?? '?')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="max-w-5xl px-8 py-8">
      <Link href="/contacts" className="text-xs text-slate-500 hover:text-slate-700">
        ← Contatos
      </Link>

      {/* Header */}
      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-emerald-400 text-base font-extrabold text-slate-900">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold" style={{ color: 'var(--i10-navy)' }}>
              {contact.name ?? '(sem nome)'}
              {contact.whatsapp && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                  💬 WhatsApp {contact.whatsapp}
                </span>
              )}
              {opps.length > 0 && (
                <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-bold text-cyan-700">
                  em oportunidade
                </span>
              )}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {[contact.role, contact.municipio && `${contact.municipio}${contact.uf ? `/${contact.uf}` : ''}`, contact.source && `origem: ${contact.source}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>

        {/* Ações rápidas — barra no estilo Ficha 360 do mockup */}
        <div className="mt-4 -mx-6 -mb-6 flex flex-wrap items-center gap-2 rounded-b-xl border-t border-slate-100 bg-gradient-to-b from-white to-slate-50 px-6 py-3">
          {wa ? (
            <details className="group relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600 [&::-webkit-details-marker]:hidden">
                💬 WhatsApp <span className="text-xs opacity-80">▾</span>
              </summary>
              <div className="absolute left-0 top-[calc(100%+6px)] z-20 min-w-[290px] rounded-xl border border-slate-200 bg-white py-1 text-left shadow-xl">
                {conversationId ? (
                  <>
                    <div className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Conversa aberta
                    </div>
                    <Link
                      href={`/marketing/conversas?c=${conversationId}`}
                      className="block px-4 py-2 text-sm hover:bg-slate-50"
                    >
                      <span className="block font-semibold text-slate-900">Abrir no inbox</span>
                      <span className="text-xs text-slate-500">
                        {windowOpen ? 'janela de 24h aberta — resposta livre' : 'fora da janela — envio via template'}
                      </span>
                    </Link>
                    <div className="my-1 border-t border-slate-100" />
                  </>
                ) : null}
                <div className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {conversationId ? 'Ou recomeçar' : 'Iniciar conversa'}
                </div>
                <form action={startConversationWithContact}>
                  <input type="hidden" name="contactId" value={contact.id} />
                  <button type="submit" className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50">
                    <span className="block font-semibold text-slate-900">
                      {conversationId ? 'Ir para a conversa' : 'Iniciar com template aprovado'}
                    </span>
                    <span className="text-xs text-slate-500">
                      abre o inbox com o seletor de templates da Meta
                    </span>
                  </button>
                </form>
              </div>
            </details>
          ) : (
            <span className="rounded-md bg-slate-100 px-4 py-2 text-sm text-slate-400">💬 sem WhatsApp</span>
          )}
          {contact.email ? (
            <a
              href={`mailto:${contact.email}`}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-cyan-400"
            >
              ✉️ E-mail <span className="font-normal text-slate-400">{contact.email}</span>
            </a>
          ) : null}
          {wa ? (
            <a
              href={`tel:+${wa.startsWith('55') ? wa : `55${wa}`}`}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-cyan-400"
            >
              📞 Ligar <span className="font-normal text-slate-400">{contact.whatsapp ?? contact.phone}</span>
            </a>
          ) : null}
          <span className="flex-1" />
          <Link
            href="/opportunities/new"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-cyan-400"
          >
            ＋ Oportunidade
          </Link>
        </div>
      </div>

      {/* Corpo: timeline + sidebar */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">
            Linha do tempo — todas as interações
          </h2>
          {timeline.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
              Nenhuma interação registrada ainda — este contato nunca foi contactado.
            </div>
          ) : (
            <div className="relative space-y-0 rounded-xl border border-slate-200 bg-white p-6">
              <div className="absolute bottom-6 left-[35px] top-6 w-px bg-slate-200" />
              {timeline.map((t, i) => (
                <div key={i} className="relative flex gap-4 pb-5 last:pb-0">
                  <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-[10px] shadow-sm ring-1 ring-slate-200">
                    {iconFor(t.kind)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-slate-800">{t.title}</div>
                    {t.detail && <div className="text-xs text-slate-500">{t.detail}</div>}
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                      {fmtDate(t.at)}
                      <span className={`rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wide ${SRC_STYLE[t.src]}`}>
                        {t.src}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Resumo de interações
            </h3>
            <dl className="space-y-1.5 text-sm">
              <Row k="Campanhas recebidas" v={summary.campaigns} />
              <Row k="Leituras / aberturas" v={summary.reads} />
              <Row k="Cliques" v={summary.clicks} />
              <Row k="Mensagens recebidas" v={summary.inboundMessages} />
              <Row k="Reuniões" v={summary.meetings} />
              <Row k="Atividades CRM" v={summary.activities} />
            </dl>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Oportunidades
            </h3>
            {opps.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhuma — use “＋ Oportunidade”.</p>
            ) : (
              <div className="space-y-2">
                {opps.map((o) => (
                  <Link
                    key={o.oppId}
                    href={`/opportunities/${o.oppId}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-slate-100 px-2.5 py-2 text-sm hover:border-cyan-300"
                  >
                    <span className="truncate font-medium text-slate-800">
                      #{o.oppId} {o.municipio ? `· ${o.municipio}` : ''}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
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
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Dados</h3>
            <dl className="space-y-1.5 text-sm">
              {contact.whatsapp && <Row k="WhatsApp" v={contact.whatsapp} />}
              {contact.phone && contact.phone !== contact.whatsapp && <Row k="Telefone" v={contact.phone} />}
              {contact.email && <Row k="E-mail" v={contact.email} small />}
              {contact.municipio && <Row k="Município" v={`${contact.municipio}${contact.uf ? `/${contact.uf}` : ''}`} />}
              {contact.lgpdBasis && <Row k="LGPD" v={contact.lgpdBasis} />}
              <Row k="Status" v={contact.status ?? '—'} />
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v, small }: { k: string; v: string | number; small?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-slate-400">{k}</dt>
      <dd className={`text-right font-medium text-slate-800 ${small ? 'break-all text-xs' : ''}`}>{v}</dd>
    </div>
  );
}
