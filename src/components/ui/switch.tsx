'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Switch acessível (track + knob, não checkbox). role=switch + aria-checked.
 *
 * Dois modos:
 *  - Controlado: passe `checked` + `onChange`.
 *  - Form (não-controlado): passe `name` (+ opcional `defaultChecked`) e omita
 *    `onChange`; um <input type="checkbox" hidden> carrega o valor para
 *    server actions. O estado visual é mantido internamente.
 */
export function Switch({
  checked,
  defaultChecked,
  onChange,
  name,
  disabled,
  className,
}: {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  name?: string;
  disabled?: boolean;
  className?: string;
}) {
  const isControlled = checked !== undefined;
  const [internal, setInternal] = React.useState(defaultChecked ?? false);
  const on = isControlled ? checked! : internal;

  function toggle() {
    if (disabled) return;
    if (isControlled) {
      onChange?.(!on);
    } else {
      setInternal((v) => !v);
      onChange?.(!on);
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={toggle}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1',
        on ? 'bg-i10-cyan' : 'bg-slate-300',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
          on ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
      {/* Valor para forms / server actions (somente no modo não-controlado) */}
      {name && !isControlled && (
        <input type="checkbox" name={name} checked={on} readOnly hidden />
      )}
    </button>
  );
}
