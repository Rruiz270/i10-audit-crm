'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Popover acessível e com fechamento correto.
 *
 * Substitui o anti-padrão `<details>` + painel absoluto, que NÃO fecha ao
 * clicar fora nem com Escape. Aqui:
 *  - abre/fecha no clique do trigger
 *  - fecha ao clicar fora (mousedown no document)
 *  - fecha com Escape
 *  - opcionalmente fecha após uma ação interna (closeOnInsideClick)
 *  - aria-expanded no trigger; foca o painel ao abrir
 *
 * Mantém o estilo Tailwind/i10 do callsite — não impõe visual próprio.
 */
export function Popover({
  trigger,
  triggerClassName,
  children,
  panelClassName,
  align = 'end',
  closeOnInsideClick = false,
}: {
  /** Conteúdo do botão que abre o popover. */
  trigger: React.ReactNode;
  triggerClassName?: string;
  /** Conteúdo do painel. Recebe `close` para fechar manualmente. */
  children: React.ReactNode | ((args: { close: () => void }) => React.ReactNode);
  panelClassName?: string;
  /** Alinhamento horizontal do painel relativo ao trigger. */
  align?: 'start' | 'end';
  /** Fecha o painel ao clicar em qualquer elemento dentro dele. */
  closeOnInsideClick?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const close = React.useCallback(() => setOpen(false), []);

  React.useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    // foca o painel para acessibilidade / captura de teclado
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          onClick={closeOnInsideClick ? () => setOpen(false) : undefined}
          className={cn(
            'absolute z-20 mt-2 outline-none',
            align === 'end' ? 'right-0' : 'left-0',
            panelClassName,
          )}
        >
          {typeof children === 'function' ? children({ close }) : children}
        </div>
      )}
    </div>
  );
}
