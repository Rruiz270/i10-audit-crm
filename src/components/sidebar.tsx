import Link from 'next/link';
import { Wordmark } from '@/components/ui/wordmark';
import { NavLink } from '@/components/ui/nav-link';
import { Icon } from '@/components/ui/icon';
import { isAdmin } from '@/lib/roles';

type NavItem = { href: string; label: string; icon: string };

// Grupos de navegação — compartilhados (na medida do possível) com o mobile-nav.
// Cada item carrega um ícone lucide (via <Icon>) usado pelo NavLink.
const FUNIL_NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: 'layout-grid' },
  { href: '/pipeline', label: 'Pipeline', icon: 'columns' },
  { href: '/opportunities', label: 'Oportunidades', icon: 'briefcase' },
];

const OPERACAO_NAV: NavItem[] = [
  { href: '/tasks', label: 'Tarefas', icon: 'check-square' },
  { href: '/prospeccao', label: 'Prospecção', icon: 'flag' },
  { href: '/leads', label: 'Leads', icon: 'inbox' },
  { href: '/meetings', label: 'Reuniões', icon: 'calendar' },
  { href: '/contacts', label: 'Contatos', icon: 'users' },
  { href: '/reports', label: 'Relatórios', icon: 'chart' },
  { href: '/admin/treinamento', label: 'Treinamento', icon: 'book' },
];

// Nav exclusivo admin/gestor — configuração e supervisão
const ADMIN_NAV: NavItem[] = [
  { href: '/settings', label: 'Administração', icon: 'settings' },
  { href: '/admin/team', label: 'Time & permissões', icon: 'users' },
  { href: '/admin/health', label: 'Saúde operacional', icon: 'activity' },
  { href: '/settings/stages', label: 'Estágios do pipeline', icon: 'git-branch' },
  { href: '/settings/tags', label: 'Tags de oportunidade', icon: 'tag' },
];

const MARKETING_NAV: NavItem[] = [
  { href: '/marketing', label: 'Marketing engine', icon: 'mega' },
];

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mt-5 mb-2 px-3 text-[10px] font-bold uppercase"
      style={{ color: 'var(--i10-cyan-light)', letterSpacing: '3px' }}
    >
      {children}
    </div>
  );
}

// Variante "dark" do NavLink para o gradiente navy da sidebar — o NavLink
// padrão é otimizado para fundo claro; aqui sobrescrevemos as cores via
// className mas mantemos o mesmo estado ativo (gradiente cyan→mint).
const DARK_LINK =
  'text-white/75 hover:bg-white/10 hover:text-white aria-[current=page]:i10-gradient-accent aria-[current=page]:text-i10-navy aria-[current=page]:font-semibold';

export function Sidebar({ userName, userRole }: { userName?: string | null; userRole?: string }) {
  const showAdmin = isAdmin(userRole);
  const marketingOn = process.env.NEXT_PUBLIC_MARKETING_ENABLED === 'true';
  const showMarketing = showAdmin && marketingOn;
  // F3: agentes (consultor) chegam ao inbox por um atalho direto. A página em si
  // redireciona quem não tem nenhuma fila atribuída, e as queries são escopadas.
  const showAgentInbox = !showAdmin && marketingOn;

  const initial =
    (userName?.[0] ?? userRole?.[0] ?? '?').toUpperCase();

  return (
    <aside className="w-60 shrink-0 flex flex-col text-white i10-gradient-dark">
      {/* Header com wordmark sobre o gradient navy */}
      <div className="px-5 py-5 border-b border-white/10">
        <Link href="/" className="block">
          <Wordmark tone="light" size="md" />
          <div
            className="mt-1 text-[10px] font-semibold uppercase text-white/50"
            style={{ letterSpacing: '3px' }}
          >
            Audit CRM
          </div>
        </Link>
        <div className="mt-3 h-0.5 rounded-full i10-gradient-accent" />
      </div>

      {/* Busca global — pessoa achada = pessoa acionável (Ficha 360) */}
      <form action="/search" method="get" className="px-3 pt-3">
        <input
          name="q"
          placeholder="🔎 Buscar contato, município…"
          className="w-full rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white placeholder-white/40 focus:border-cyan-300 focus:outline-none"
        />
      </form>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <GroupLabel>Funil</GroupLabel>
        {FUNIL_NAV.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            className={DARK_LINK}
          />
        ))}

        <GroupLabel>Operação</GroupLabel>
        {OPERACAO_NAV.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            className={DARK_LINK}
          />
        ))}

        {showMarketing && (
          <>
            <GroupLabel>Marketing</GroupLabel>
            {MARKETING_NAV.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                className={DARK_LINK}
              />
            ))}
            <NavLink href="/atende" icon="msg" label="Atendimento (app)" className={DARK_LINK} />
          </>
        )}

        {showAgentInbox && (
          <>
            <GroupLabel>Atendimento</GroupLabel>
            <NavLink
              href="/atende"
              icon="msg"
              label="Meu atendimento"
              className={DARK_LINK}
            />
            <NavLink
              href="/marketing/conversas"
              icon="msg"
              label="Conversas (desktop)"
              className={DARK_LINK}
            />
          </>
        )}

        {showAdmin && (
          <>
            <GroupLabel>Administração</GroupLabel>
            {ADMIN_NAV.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                className={DARK_LINK}
              />
            ))}
          </>
        )}
      </nav>

      {/* Bloco de usuário no rodapé — "Meu perfil" com avatar + sair. */}
      <div className="px-3 py-4 border-t border-white/10">
        <Link
          href="/me"
          aria-current={undefined}
          className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-white/10"
        >
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
            style={{ background: 'var(--i10-gradient-main)' }}
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">
              {userName ?? '—'}
            </div>
            <div
              className="text-[10px] font-semibold uppercase"
              style={{ color: 'var(--i10-cyan-light)', letterSpacing: '2px' }}
            >
              {userRole ?? 'consultor'}
            </div>
          </div>
        </Link>
        <Link
          href="/api/auth/signout"
          className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white/50 transition hover:bg-white/10 hover:text-[var(--i10-cyan-light)]"
        >
          <Icon name="arrow-right" size={14} />
          Sair
        </Link>
      </div>
    </aside>
  );
}
