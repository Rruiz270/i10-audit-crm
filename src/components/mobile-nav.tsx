'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wordmark } from '@/components/ui/wordmark';
import { cn } from '@/lib/utils';
import { isAdmin } from '@/lib/roles';
import {
  requestNotificationPermission,
  notifyLocal,
} from '@/components/pwa-register';

const USER_NAV = [
  { href: '/', label: 'Dashboard', icon: '🏠' },
  { href: '/pipeline', label: 'Pipeline', icon: '📊' },
  { href: '/opportunities', label: 'Oportunidades', icon: '💼' },
  { href: '/tasks', label: 'Tarefas', icon: '✓' },
  { href: '/leads', label: 'Leads', icon: '📥' },
  { href: '/meetings', label: 'Reuniões', icon: '📅' },
  { href: '/contacts', label: 'Contatos', icon: '👥' },
  { href: '/reports', label: 'Relatórios', icon: '📈' },
  { href: '/me', label: 'Meu perfil', icon: '👤' },
];

const ADMIN_NAV = [
  { href: '/settings', label: 'Administração', icon: '⚙️' },
  { href: '/admin/team', label: 'Time & permissões', icon: '👥' },
  { href: '/admin/health', label: 'Saúde operacional', icon: '🩺' },
  { href: '/settings/stages', label: 'Estágios', icon: '🔁' },
];

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

  // Fecha o drawer sempre que a rota muda — usamos derived state do React:
  // compara path atual com um state "prevPath" e atualiza via setState condicional.
  const [prevPath, setPrevPath] = React.useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    if (open) setOpen(false);
  }

  async function enableNotifs() {
    setNotifState('asking');
    const p = await requestNotificationPermission();
    setNotifState(p);
    if (p === 'granted') {
      await notifyLocal(
        'i10 CRM instalado 🎉',
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
          className="w-9 h-9 inline-flex items-center justify-center rounded-md hover:bg-white/10 text-sm"
          aria-label="Tarefas"
        >
          ✓
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
            {USER_NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-colors',
                    active
                      ? 'bg-white/15 text-white'
                      : 'text-white/75 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <span className="text-base" aria-hidden>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {showAdmin && (
              <>
                <div
                  className="mt-4 mb-2 px-3 text-[10px] font-bold uppercase"
                  style={{ color: 'var(--i10-cyan-light)', letterSpacing: '3px' }}
                >
                  Administração
                </div>
                {ADMIN_NAV.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-colors',
                        active
                          ? 'bg-white/15 text-white'
                          : 'text-white/75 hover:bg-white/10 hover:text-white',
                      )}
                    >
                      <span className="text-base" aria-hidden>{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </>
            )}

            {/* Enable notifications button */}
            <div className="mt-6 border-t border-white/10 pt-4 space-y-2">
              {notifState !== 'granted' && notifState !== 'unsupported' && (
                <button
                  onClick={enableNotifs}
                  className="w-full text-left px-3 py-2 rounded-md text-xs font-medium text-white/80 hover:bg-white/10"
                >
                  🔔 {notifState === 'asking' ? 'Pedindo permissão…' : 'Ativar notificações'}
                </button>
              )}
              {notifState === 'granted' && (
                <div className="px-3 py-2 text-xs text-[var(--i10-cyan-light)]">
                  🔔 Notificações ativadas
                </div>
              )}
              {notifState === 'unsupported' && (
                <div className="px-3 py-2 text-xs text-white/50">
                  Seu browser não suporta notificações
                </div>
              )}
            </div>
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
        </div>
      </aside>
    </>
  );
}
