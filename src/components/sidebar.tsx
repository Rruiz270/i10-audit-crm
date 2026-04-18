import Link from 'next/link';
import { cn } from '@/lib/utils';

type NavItem = { href: string; label: string; icon?: string };

const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/opportunities', label: 'Oportunidades' },
  { href: '/leads', label: 'Leads' },
  { href: '/meetings', label: 'Reuniões' },
  { href: '/contacts', label: 'Contatos' },
  { href: '/reports', label: 'Relatórios' },
];

export function Sidebar({ userName, userRole }: { userName?: string | null; userRole?: string }) {
  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white flex flex-col">
      <div className="px-5 py-6 border-b border-slate-200">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-i10-700">i10</span>
          <span className="text-xs text-slate-500 uppercase tracking-wider">Audit CRM</span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'block px-3 py-2 rounded-md text-sm font-medium',
              'text-slate-700 hover:bg-i10-50 hover:text-i10-700 transition-colors',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-slate-200 text-xs">
        <div className="font-medium text-slate-800 truncate">{userName ?? '—'}</div>
        <div className="text-slate-500 uppercase tracking-wider mt-0.5">
          {userRole ?? 'consultor'}
        </div>
        <Link
          href="/api/auth/signout"
          className="mt-3 block text-slate-500 hover:text-i10-700"
        >
          Sair
        </Link>
      </div>
    </aside>
  );
}
