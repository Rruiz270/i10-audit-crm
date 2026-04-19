import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { getMyProfile, getMyStats } from '@/lib/actions/me';
import { MyProfileForm } from '@/components/my-profile-form';

export const dynamic = 'force-dynamic';

export default async function MyProfilePage() {
  const session = await requireUser();
  const [profile, stats] = await Promise.all([
    getMyProfile(session.id),
    getMyStats(session.id),
  ]);

  const displayName = profile?.displayName || profile?.name || '—';
  const sinceStr = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('pt-BR')
    : '—';

  return (
    <div className="px-8 py-8 max-w-5xl">
      {/* Hero do perfil */}
      <section
        className="rounded-xl p-6 text-white mb-6"
        style={{ background: 'var(--i10-gradient-main)' }}
      >
        <div className="flex items-start gap-5">
          {profile?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.image}
              alt=""
              className="w-20 h-20 rounded-full ring-4 ring-white/30"
            />
          ) : (
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-extrabold ring-4 ring-white/30"
              style={{ background: 'rgba(255,255,255,0.15)' }}
            >
              {displayName[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div
              className="text-[11px] font-bold uppercase"
              style={{ color: 'var(--i10-cyan-light)', letterSpacing: '3px' }}
            >
              Meu perfil · {session.role}
            </div>
            <h1 className="text-3xl font-extrabold mt-1 truncate">{displayName}</h1>
            <div className="text-sm text-white/80 mt-1">{profile?.email}</div>
            <div className="text-xs text-white/60 mt-2">
              Membro desde {sinceStr}
              {profile?.phone && ` · ${profile.phone}`}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Link
              href="/me/preferences"
              className="text-xs font-semibold px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
            >
              ⚙️ Preferências
            </Link>
            <Link
              href="/tasks?filter=mine"
              className="text-xs font-semibold px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
            >
              ✓ Minhas tarefas
            </Link>
          </div>
        </div>
      </section>

      {/* Stats pessoais */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Oportunidades ativas</div>
          <div className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
            {stats.activeOps}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">total histórico: {stats.totalOps}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Tarefas em aberto</div>
          <div className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
            {stats.openTasks}
          </div>
          <Link
            href="/tasks?filter=mine"
            className="text-[11px] mt-1 inline-block"
            style={{ color: 'var(--i10-cyan-dark)' }}
          >
            ver →
          </Link>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Ganhas (30d)</div>
          <div className="text-2xl font-bold" style={{ color: 'var(--i10-mint-dark)' }}>
            {stats.won30}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">perdidas: {stats.lost30}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Win rate (30d)</div>
          <div className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
            {stats.won30 + stats.lost30 === 0
              ? '—'
              : `${Math.round(stats.winRate30 * 100)}%`}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {stats.activities30} ações registradas
          </div>
        </div>
      </section>

      {/* Profile form */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--i10-navy)' }}>
          Informações pessoais
        </h2>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          Nome e foto vêm do Google por padrão — dá pra sobrescrever o nome aqui se quiser.
          Telefone e assinatura são exclusivos do CRM.
        </p>
        <MyProfileForm
          defaults={{
            googleName: profile?.name ?? '',
            email: profile?.email ?? '',
            displayName: profile?.displayName ?? '',
            phone: profile?.phone ?? '',
            signature: profile?.signature ?? '',
          }}
        />
      </section>
    </div>
  );
}
