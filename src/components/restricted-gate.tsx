import Link from 'next/link';

/**
 * Tela "acesso restrito" — melhor UX que `redirect('/')` silencioso.
 * Usado quando consultor clica num link admin que aparece em algum lugar do app.
 */
export function RestrictedGate({
  required,
  currentRole,
  section,
}: {
  required: string;
  currentRole: string;
  section: string;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="i10-eyebrow mb-3" style={{ color: 'var(--i10-cyan-dark)' }}>
          Acesso restrito
        </div>
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--i10-navy)' }}>
          Só {required} tem acesso a {section}
        </h1>
        <div className="i10-divider mx-auto mt-4" />
        <p
          className="mt-6 text-slate-600"
          style={{ fontFamily: 'var(--font-source-serif), serif' }}
        >
          Seu perfil atual é <code className="bg-slate-100 px-1.5 py-0.5 rounded">{currentRole}</code>.
          Peça pra um admin do time te promover ou te dar acesso a essa função.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="text-sm font-semibold px-4 py-2 rounded-md"
            style={{ background: 'var(--i10-navy)', color: '#fff' }}
          >
            Voltar ao Dashboard
          </Link>
          <Link
            href="/tasks"
            className="text-sm font-medium text-slate-600 hover:text-[var(--i10-navy)]"
          >
            Minhas tarefas
          </Link>
        </div>
      </div>
    </div>
  );
}
