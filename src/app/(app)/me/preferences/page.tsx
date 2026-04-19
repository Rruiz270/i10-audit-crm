import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { getMyPreferences } from '@/lib/actions/me';
import { PreferencesForm } from '@/components/preferences-form';

export const dynamic = 'force-dynamic';

export default async function MyPreferencesPage() {
  const session = await requireUser();
  const prefs = await getMyPreferences(session.id);

  return (
    <div className="px-8 py-8 max-w-3xl">
      <header className="mb-6">
        <Link
          href="/me"
          className="text-xs text-slate-500 hover:text-[var(--i10-navy)]"
        >
          ← Meu perfil
        </Link>
        <div className="i10-eyebrow mt-2">Preferências pessoais</div>
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--i10-navy)' }}>
          Como você quer usar o CRM
        </h1>
        <div className="i10-divider mt-3" />
        <p
          className="text-slate-600 mt-4"
          style={{ fontFamily: 'var(--font-source-serif), serif', fontSize: '15px' }}
        >
          Controle o que te notifica, como o pipeline aparece, e seu horário de
          trabalho. Nada disso afeta o time — são configurações só suas.
        </p>
      </header>

      <PreferencesForm defaults={prefs} />
    </div>
  );
}
