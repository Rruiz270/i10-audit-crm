import Link from 'next/link';
import { isAdmin, requireUser } from '@/lib/session';
import { RestrictedGate } from '@/components/restricted-gate';

export const dynamic = 'force-dynamic';

type AdminCard = {
  title: string;
  href: string;
  description: string;
  status: 'ready' | 'stub' | 'planned';
  eyebrow: string;
};

const CARDS: AdminCard[] = [
  {
    title: 'Estágios do pipeline',
    href: '/settings/stages',
    eyebrow: 'Funil',
    description:
      'Adicionar, editar, desativar estágios. Ajustar probabilidades, rot_days e cores. Estágios customizados aparecem no Kanban.',
    status: 'ready',
  },
  {
    title: 'Time & permissões',
    href: '/admin/team',
    eyebrow: 'Acesso',
    description:
      'Convidar consultores, promover a gestor/admin, desativar usuários. Convidados só conseguem logar se tiverem role pré-atribuído.',
    status: 'ready',
  },
  {
    title: 'Saúde da operação',
    href: '/admin/health',
    eyebrow: 'Supervisão',
    description:
      'Leads sem triagem, oportunidades sem contato primário, cards parados há X dias, consultorias BNCC sem sinal recente.',
    status: 'ready',
  },
  {
    title: 'Performance do time',
    href: '/admin/performance',
    eyebrow: 'Gestão',
    description:
      'Por consultor: ganhas/perdidas, taxa de conversão, tempo médio em cada estágio, tarefas concluídas vs atrasadas.',
    status: 'planned',
  },
  {
    title: 'Formulários públicos',
    href: '/admin/lead-forms',
    eyebrow: 'Captação',
    description:
      'Editar os campos do formulário de intake (/intake/[slug]), adicionar novos slugs, ativar/desativar captação pública.',
    status: 'planned',
  },
  {
    title: 'Motivos de perda',
    href: '/admin/lost-reasons',
    eyebrow: 'Taxonomia',
    description:
      'Hoje os 9 códigos estão hardcoded em src/lib/lost-reasons.ts. Admin vai poder adicionar códigos customizados via UI.',
    status: 'planned',
  },
  {
    title: 'Integrações',
    href: '/admin/integrations',
    eyebrow: 'Conectores',
    description:
      'Google Calendar (já), WhatsApp Business API, SendGrid/Resend, webhooks BNCC-CAPTACAO pra sinalização em tempo real.',
    status: 'planned',
  },
  {
    title: 'Auditoria global',
    href: '/admin/audit-log',
    eyebrow: 'Compliance',
    description:
      'Todas as atividades do CRM em uma timeline única: quem criou/editou/moveu/deletou o quê e quando. Exportável.',
    status: 'planned',
  },
];

function StatusPill({ status }: { status: AdminCard['status'] }) {
  const cfg =
    status === 'ready'
      ? { label: 'Pronto', bg: 'var(--i10-mint)', color: 'var(--i10-navy-dark)' }
      : status === 'stub'
        ? { label: 'Em construção', bg: '#FEF3C7', color: '#92400E' }
        : { label: 'No roadmap', bg: '#E2E8F0', color: '#475569' };
  return (
    <span
      className="inline-flex items-center text-[10px] font-semibold uppercase px-2 py-0.5 rounded"
      style={{ background: cfg.bg, color: cfg.color, letterSpacing: '1px' }}
    >
      {cfg.label}
    </span>
  );
}

export default async function SettingsHubPage() {
  const user = await requireUser();
  if (!isAdmin(user.role)) {
    return (
      <RestrictedGate
        required="admin / gestor"
        currentRole={user.role}
        section="área administrativa"
      />
    );
  }

  return (
    <div className="px-8 py-8 max-w-6xl">
      <header className="mb-8">
        <div className="i10-eyebrow mb-2">Administração · Hub central</div>
        <h1 className="text-3xl font-extrabold" style={{ color: 'var(--i10-navy)' }}>
          Configurações e supervisão
        </h1>
        <div className="i10-divider mt-3" />
        <p
          className="text-slate-600 mt-4 max-w-3xl"
          style={{ fontFamily: 'var(--font-source-serif), serif', fontSize: '17px', lineHeight: 1.7 }}
        >
          Aqui é onde admin/gestor configura o funcionamento do CRM — fluxo de
          pipeline, permissões, integrações — e supervisiona a saúde operacional
          do time. Consultores não enxergam esta área.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map((c) => {
          const disabled = c.status === 'planned';
          const inner = (
            <>
              <div className="flex items-start justify-between mb-3">
                <div
                  className="text-[10px] font-bold uppercase"
                  style={{ color: 'var(--i10-cyan-dark)', letterSpacing: '3px' }}
                >
                  {c.eyebrow}
                </div>
                <StatusPill status={c.status} />
              </div>
              <h2 className="text-base font-bold" style={{ color: 'var(--i10-navy)' }}>
                {c.title}
              </h2>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">{c.description}</p>
              {!disabled && (
                <div
                  className="mt-4 text-xs font-semibold inline-flex items-center gap-1"
                  style={{ color: 'var(--i10-cyan-dark)' }}
                >
                  Abrir
                  <span
                    aria-hidden
                    className="group-hover:translate-x-0.5 transition-transform"
                  >
                    →
                  </span>
                </div>
              )}
            </>
          );
          const className = `group block bg-white border border-slate-200 rounded-lg p-5 transition-colors ${
            disabled
              ? 'opacity-60 cursor-not-allowed'
              : 'hover:border-[var(--i10-cyan)] hover:shadow-sm'
          }`;
          return disabled ? (
            <div key={c.href} className={className}>
              {inner}
            </div>
          ) : (
            <Link key={c.href} href={c.href} className={className}>
              {inner}
            </Link>
          );
        })}
      </section>
    </div>
  );
}
