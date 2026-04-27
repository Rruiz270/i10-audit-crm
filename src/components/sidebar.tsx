import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Wordmark } from '@/components/ui/wordmark';
import { isAdmin } from '@/lib/roles';

type NavItem = { href: string; label: string };

// Nav do consultor — trabalho diário na captação
const USER_NAV: NavItem[] = [
  { href: '/', label: 'Dashboard' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/opportunities', label: 'Oportunidades' },
  { href: '/tasks', label: 'Tarefas' },
  { href: '/leads', label: 'Leads' },
  { href: '/meetings', label: 'Reuniões' },
  { href: '/contacts', label: 'Contatos' },
  { href: '/reports', label: 'Relatórios' },
  { href: '/admin/treinamento', label: 'Treinamento' },
  { href: '/me', label: 'Meu perfil' },
];

// Nav exclusivo admin/gestor — configuração e supervisão
const ADMIN_NAV: NavItem[] = [
  { href: '/settings', label: 'Administração' },
  { href: '/admin/team', label: 'Time & permissões' },
  { href: '/admin/health', label: 'Saúde operacional' },
  { href: '/settings/stages', label: 'Estágios do pipeline' },
];

export function Sidebar({ userName, userRole }: { userName?: string | null; userRole?: string }) {
  const showAdmin = isAdmin(userRole);
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

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {USER_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'block px-3 py-2 rounded-md text-sm font-medium',
              'text-white/75 hover:bg-white/10 hover:text-white transition-colors',
            )}
          >
            {item.label}
          </Link>
        ))}

        {showAdmin && (
          <>
            <div
              className="mt-5 mb-2 px-3 text-[10px] font-bold uppercase"
              style={{ color: 'var(--i10-cyan-light)', letterSpacing: '3px' }}
            >
              Administração
            </div>
            {ADMIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'block px-3 py-2 rounded-md text-sm font-medium',
                  'text-white/75 hover:bg-white/10 hover:text-white transition-colors',
                )}
              >
                {item.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="px-4 py-4 border-t border-white/10 text-xs">
        <div className="font-semibold text-white truncate">{userName ?? '—'}</div>
        <div
          className="mt-0.5 font-semibold uppercase"
          style={{ color: 'var(--i10-cyan-light)', letterSpacing: '2px' }}
        >
          {userRole ?? 'consultor'}
        </div>
        <Link
          href="/api/auth/signout"
          className="mt-3 block text-white/50 hover:text-[var(--i10-cyan-light)]"
        >
          Sair
        </Link>
      </div>
    </aside>
  );
}
