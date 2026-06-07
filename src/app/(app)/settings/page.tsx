import Link from 'next/link';
import { isAdmin, requireUser } from '@/lib/session';
import { RestrictedGate } from '@/components/restricted-gate';
import { Icon } from '@/components/marketing-hub';

export const dynamic = 'force-dynamic';

type AdminCard = {
  title: string;
  href: string;
  description: string;
  status: 'ready' | 'stub' | 'planned';
  section: string;
  icon: string;
};

const CARDS: AdminCard[] = [
  {
    title: 'Estágios do pipeline',
    href: '/settings/stages',
    section: 'Funil & Taxonomia',
    icon: 'git-branch',
    description:
      'Adicionar, editar, desativar estágios. Ajustar probabilidades, rot_days e cores. Estágios customizados aparecem no Kanban.',
    status: 'ready',
  },
  {
    title: 'Tags de oportunidade',
    href: '/settings/tags',
    section: 'Funil & Taxonomia',
    icon: 'tag',
    description:
      'Taxonomia gerenciada de tags (origem/produto). Auto-aplicadas na criação (manual, formulário, APM, webinar). Adicionar tags customizadas, cores e ativar/desativar.',
    status: 'ready',
  },
  {
    title: 'Time & permissões',
    href: '/admin/team',
    section: 'Acesso',
    icon: 'users',
    description:
      'Convidar consultores, promover a gestor/admin, desativar usuários. Convidados só conseguem logar se tiverem role pré-atribuído.',
    status: 'ready',
  },
  {
    title: 'Saúde da operação',
    href: '/admin/health',
    section: 'Supervisão',
    icon: 'activity',
    description:
      'Leads sem triagem, oportunidades sem contato primário, cards parados há X dias, consultorias BNCC sem sinal recente.',
    status: 'ready',
  },
  {
    title: 'Performance do time',
    href: '/admin/performance',
    section: 'Roadmap',
    icon: 'chart',
    description:
      'Por consultor: ganhas/perdidas, taxa de conversão, tempo médio em cada estágio, tarefas concluídas vs atrasadas.',
    status: 'planned',
  },
  {
    title: 'Formulários públicos',
    href: '/admin/lead-forms',
    section: 'Roadmap',
    icon: 'file',
    description:
      'Editar os campos do formulário de intake (/intake/[slug]), adicionar novos slugs, ativar/desativar captação pública.',
    status: 'planned',
  },
  {
    title: 'Motivos de perda',
    href: '/admin/lost-reasons',
    section: 'Roadmap',
    icon: 'x-circle',
    description:
      'Hoje os 9 códigos estão hardcoded em src/lib/lost-reasons.ts. Admin vai poder adicionar códigos customizados via UI.',
    status: 'planned',
  },
  {
    title: 'Integrações',
    href: '/admin/integrations',
    section: 'Roadmap',
    icon: 'settings',
    description:
      'Google Calendar (já), WhatsApp Business API, SendGrid/Resend, webhooks BNCC-CAPTACAO pra sinalização em tempo real.',
    status: 'planned',
  },
  {
    title: 'Auditoria global',
    href: '/admin/audit-log',
    section: 'Roadmap',
    icon: 'book',
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

// Ordem das seções "ao vivo" — planned colapsa em "No roadmap" no fim.
const LIVE_SECTIONS = ['Funil & Taxonomia', 'Acesso', 'Supervisão'];

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

  const liveCards = CARDS.filter((c) => c.status !== 'planned');
  const roadmapCards = CARDS.filter((c) => c.status === 'planned');

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

      {LIVE_SECTIONS.map((section) => {
        const cards = liveCards.filter((c) => c.section === section);
        if (cards.length === 0) return null;
        return (
          <section key={section} className="mb-8">
            <h2
              className="mb-3 text-[11px] font-bold uppercase"
              style={{ color: 'var(--i10-cyan-dark)', letterSpacing: '3px' }}
            >
              {section}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cards.map((c) => (
                <Link
                  key={c.href}
                  href={c.href}
                  className="group relative block rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-lg"
                >
                  <div className="flex items-start justify-between">
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-i10-navy-pale text-i10-navy">
                      <Icon name={c.icon} size={24} />
                    </div>
                    <StatusPill status={c.status} />
                  </div>
                  <h3
                    className="mt-3 text-[15px] font-semibold"
                    style={{ color: 'var(--i10-navy)' }}
                  >
                    {c.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                    {c.description}
                  </p>
                  <div className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-cyan-700">
                    Abrir
                    <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                      →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {roadmapCards.length > 0 && (
        <section className="mb-4">
          <h2
            className="mb-3 text-[11px] font-bold uppercase text-slate-400"
            style={{ letterSpacing: '3px' }}
          >
            No roadmap
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {roadmapCards.map((c) => (
              <div
                key={c.href}
                className="relative rounded-xl border border-slate-200 bg-white p-4 opacity-60"
              >
                <div className="flex items-start justify-between">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-500">
                    <Icon name={c.icon} size={20} />
                  </div>
                  <StatusPill status={c.status} />
                </div>
                <h3
                  className="mt-2.5 text-sm font-semibold"
                  style={{ color: 'var(--i10-navy)' }}
                >
                  {c.title}
                </h3>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  {c.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
