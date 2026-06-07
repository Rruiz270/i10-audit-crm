'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * NavLink — item de navegação com estado ativo via usePathname().
 * Ativo = texto navy sobre wash gradiente cyan→mint (como no mockup).
 * Compartilhado entre sidebar desktop e mobile-nav (uma fase posterior fia).
 *
 * Ativo quando pathname === href, ou começa com `${href}/` (sub-rotas), exceto
 * quando href é a raiz '/'.
 */
export function NavLink({
  href,
  icon,
  label,
  className,
}: {
  href: string;
  icon?: string;
  label: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const active =
    pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition',
        active
          ? 'i10-gradient-accent font-semibold text-i10-navy'
          : 'text-slate-600 hover:bg-slate-100',
        className,
      )}
    >
      {icon && <Icon name={icon} size={18} />}
      <span>{label}</span>
    </Link>
  );
}
