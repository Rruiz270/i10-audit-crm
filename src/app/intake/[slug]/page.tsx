import { notFound } from 'next/navigation';
import { getFormBySlug, type FieldDef } from '@/lib/actions/intake';
import { IntakeForm } from '@/components/intake-form';

export const dynamic = 'force-dynamic';

export default async function IntakePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const form = await getFormBySlug(slug);
  if (!form || !form.isActive) notFound();

  const fields = (form.fieldsSchema as FieldDef[]) ?? [];

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-6">
          <div className="text-3xl font-bold text-i10-700">i10</div>
          <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">
            Instituto i10 · Auditoria pública
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8">
          <header className="mb-6">
            <h1 className="text-xl font-semibold text-slate-900">{form.title}</h1>
            {form.description && (
              <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{form.description}</p>
            )}
          </header>

          <IntakeForm slug={form.slug} fields={fields} />
        </div>

        <p className="text-xs text-slate-500 text-center mt-6">
          Seus dados serão tratados conforme a LGPD. Apenas a equipe do i10 tem acesso.
        </p>
      </div>
    </div>
  );
}
