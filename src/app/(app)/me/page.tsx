import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { getMyProfile, getMyStats } from '@/lib/actions/me';
import { MyProfileForm } from '@/components/my-profile-form';
import { KpiTile } from '@/components/ui/kpi-tile';
import { Icon } from '@/components/ui/icon';

export const dynamic = 'force-dynamic';

export default async function MyProfilePage() {
  const session = await requireUser();
  const [profile, stats] = await Promise.all([
    getMyProfile(),
    getMyStats(),
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
              className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white/20"
            >
              <Icon name="settings" size={14} />
              Preferências
            </Link>
            <Link
              href="/tasks?filter=mine"
              className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white/20"
            >
              <Icon name="check-square" size={14} />
              Minhas tarefas
            </Link>
          </div>
        </div>
      </section>

      {/* Stats pessoais */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <KpiTile
          icon="briefcase"
          tone="navy"
          value={stats.activeOps}
          label={`Oportunidades ativas · total ${stats.totalOps}`}
        />
        <KpiTile
          icon="check-square"
          tone="cyan"
          value={stats.openTasks}
          label="Tarefas em aberto"
          href="/tasks?filter=mine"
        />
        <KpiTile
          icon="flag"
          tone="mint"
          value={stats.won30}
          label={`Ganhas (30d) · perdidas ${stats.lost30}`}
        />
        <KpiTile
          icon="chart"
          tone="navy"
          value={
            stats.won30 + stats.lost30 === 0
              ? '—'
              : `${Math.round(stats.winRate30 * 100)}%`
          }
          label={`Win rate (30d) · ${stats.activities30} ações`}
        />
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
