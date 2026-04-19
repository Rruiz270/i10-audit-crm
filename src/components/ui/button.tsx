import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

/**
 * Variants mapeadas à paleta do brandbook i10:
 *   primary  → Navy #0A2463 (ações principais institucionais)
 *   accent   → Cyan #00B4D8 (CTAs de destaque e "próximo passo")
 *   success  → Mint #00E5A0 (confirmações de fechamento / handoff)
 *   danger   → coral sistema (perdas, exclusões)
 */
const VARIANT: Record<Variant, string> = {
  primary: 'text-white hover:brightness-110 [background:var(--i10-navy)]',
  accent: 'text-white hover:brightness-110 [background:var(--i10-cyan)]',
  secondary:
    'bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 hover:border-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-rose-600 hover:bg-rose-700 text-white',
  success:
    'text-[color:var(--i10-navy-dark)] font-semibold hover:brightness-105 [background:var(--i10-mint)]',
};
const SIZE: Record<Size, string> = {
  sm: 'text-xs px-2.5 py-1.5 rounded',
  md: 'text-sm px-4 py-2 rounded-md',
  lg: 'text-base px-5 py-2.5 rounded-md',
};

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(({ className, variant = 'primary', size = 'md', ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center gap-1.5 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
      VARIANT[variant],
      SIZE[size],
      className,
    )}
    {...props}
  />
));
Button.displayName = 'Button';
