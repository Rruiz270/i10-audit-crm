'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wordmark } from '@/components/ui/wordmark';
import { NavLink } from '@/components/ui/nav-link';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { isAdmin } from '@/lib/roles';
import {
  requestNotificationPermission,
  notifyLocal,
} from '@/components/pwa-register';

type NavItem = { href: string; label: string; icon: string };

const FUNIL_NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: 'layout-grid' },
  { href: '/pipeline', label: 'Pipeline', icon: 'columns' },
  { href: '/opportunities', label: 'Oportunidades', icon: 'briefcase' },
];

const OPERACAO_NAV: NavItem[] = [
  { href: '/tasks', label: 'Tarefas', icon: 'check-square' },
  { href: '/leads', label: 'Leads', icon: 'inbox' },
  { href: '/meetings', label: 'Reuniões', icon: 'calendar' },
  { href: '/contacts', label: 'Contatos', icon: 'users' },
  { href: '/reports', label: 'Relatórios', icon: 'chart' },
  { href: '/admin/treinamento', label: 'Treinamento', icon: 'book' },
];

const ADMIN_NAV: NavItem[] = [
  { href: '/settings', label: 'Administração', icon: 'settings' },
  { href: '/admin/team', label: 'Time & permissões', icon: 'users' },
  { href: '/admin/health', label: 'Saúde operacional', icon: 'activity' },
  { href: '/settings/stages', label: 'Estágios', icon: 'git-branch' },
  { href: '/settings/tags', label: 'Tags', icon: 'tag' },
];

const DARK_LINK =
  'text-white/75 hover:bg-white/10 hover:text-white aria-[current=page]:i10-gradient-accent aria-[current=page]:text-i10-navy aria-[current=page]:font-semibold';

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mt-4 mb-2 px-3 text-[10px] font-bold uppercase"
      style={{ color: 'var(--i10-cyan-light)', letterSpacing: '3px' }}
    >
      {children}
    </div>
  );
}

/**
 * Barra superior em mobile + drawer lateral. Aparece só em telas <md.
 * Em telas md+, o <Sidebar> tradicional é usado (no layout).
 */
export function MobileNav({
  userName,
  userRole,
}: {
  userName?: string | null;
  userRole?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [notifState, setNotifState] = React.useState<string>('idle');
  const showAdmin = isAdmin(userRole);
  const marketingOn = process.env.NEXT_PUBLIC_MARKETING_ENABLED === 'true';
  // F3: atalho do inbox de Conversas para agentes (consultor). A página redireciona
  // quem não tem fila atribuída.
  const showAgentInbox = !showAdmin && marketingOn;

  // Fecha o drawer sempre que a rota muda — usamos derived state do React:
  // compara path atual com um state "prevPath" e atualiza via setState condicional.
  const [prevPath, setPrevPath] = React.useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    if (open) setOpen(false);
  }

  const initial = (userName?.[0] ?? userRole?.[0] ?? '?').toUpperCase();

  async function enableNotifs() {
    setNotifState('asking');
    const p = await requestNotificationPermission();
    setNotifState(p);
    if (p === 'granted') {
      await notifyLocal(
        'i10 CRM instalado',
        'Você vai receber notificações de tarefas atrasadas e novos sinais do BNCC.',
      );
    }
  }

  return (
    <>
      {/* Top bar — fixed, mobile only */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 flex items-center justify-between px-4 text-white"
        style={{ background: 'var(--i10-navy-dark)' }}
      >
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-white/10"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <Wordmark tone="light" size="sm" />
        <Link
          href="/tasks"
          className="w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-white/10"
          aria-label="Tarefas"
        >
          <Icon name="check-square" size={18} />
        </Link>
      </div>

      {/* Drawer overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer panel */}
      <aside
        className={cn(
          'md:hidden fixed top-0 left-0 bottom-0 z-50 w-72 transition-transform',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{ background: 'var(--i10-gradient-dark)' }}
      >
        <div className="flex flex-col h-full text-white">
          <div className="px-5 py-5 border-b border-white/10">
            <Wordmark tone="light" size="md" />
            <div
              className="mt-1 text-[10px] font-semibold uppercase text-white/50"
              style={{ letterSpacing: '3px' }}
            >
              Audit CRM
            </div>
            <div className="mt-3 h-0.5 rounded-full i10-gradient-accent" />
          </div>

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

            {showAgentInbox && (
              <>
                <GroupLabel>Marketing</GroupLabel>
                <NavLink
                  href="/marketing/conversas"
                  icon="msg"
                  label="Conversas"
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

            {/* Enable notifications button */}
            <div className="mt-6 border-t border-white/10 pt-4 space-y-2">
              {notifState !== 'granted' && notifState !== 'unsupported' && (
                <button
                  onClick={enableNotifs}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-medium text-white/80 hover:bg-white/10"
                >
                  <Icon name="bell" size={16} />
                  {notifState === 'asking' ? 'Pedindo permissão…' : 'Ativar notificações'}
                </button>
              )}
              {notifState === 'granted' && (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--i10-cyan-light)]">
                  <Icon name="bell" size={16} />
                  Notificações ativadas
                </div>
              )}
              {notifState === 'unsupported' && (
                <div className="px-3 py-2 text-xs text-white/50">
                  Seu browser não suporta notificações
                </div>
              )}
            </div>
          </nav>

          {/* Bloco de usuário no rodapé — Meu perfil + sair */}
          <div className="px-3 py-4 border-t border-white/10">
            <Link
              href="/me"
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
        </div>
      </aside>
    </>
  );
}
