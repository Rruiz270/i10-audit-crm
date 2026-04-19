import { redirect } from 'next/navigation';
import Image from 'next/image';
import { Wordmark } from '@/components/ui/wordmark';
import { hasApmGate, validateApmGate } from '@/lib/actions/apm-gate';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'APM · Acesso ao cadastro de leads | Instituto i10',
  description:
    'Acesso restrito à equipe APM para registro de leads FUNDEB no CRM do Instituto i10.',
};

export default async function ApmGatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Se o cookie já existe, pula o gate direto pra /apm/cadastro
  if (await hasApmGate()) {
    redirect('/apm/cadastro');
  }

  const { error } = await searchParams;

  async function onSubmit(formData: FormData) {
    'use server';
    const result = await validateApmGate(formData);
    // validateApmGate só retorna em caso de erro (sucesso faz redirect)
    if (result && !result.ok) {
      redirect(`/apm?error=${encodeURIComponent(result.error)}`);
    }
  }

  return (
    <div
      className="min-h-screen flex items-stretch"
      style={{ fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' }}
    >
      {/* Lado esquerdo — hero co-branded APM + i10 */}
      <div
        className="hidden md:flex md:w-1/2 relative overflow-hidden items-center justify-center"
        style={{ background: 'linear-gradient(160deg, #0A5C5F 0%, #0D7377 35%, #11998E 70%, #1B8A5C 100%)' }}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 40%, rgba(0,229,160,0.25) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(0,180,216,0.2) 0%, transparent 40%)',
          }}
        />
        <div className="relative max-w-sm px-10 text-white">
          <div className="flex items-center gap-4 mb-6">
            <div className="bg-white rounded-xl p-2 shadow-md inline-flex items-center" style={{ height: 52 }}>
              <Image
                src="/logos/apm-logo.jpg"
                alt="APM"
                width={1075}
                height={345}
                priority
                className="h-8 w-auto"
                style={{ height: '100%', width: 'auto', objectFit: 'contain' }}
              />
            </div>
            <div className="text-xl font-bold text-white/30">×</div>
            <div className="bg-white rounded-xl px-3 shadow-md inline-flex items-center" style={{ height: 52 }}>
              <Wordmark size="sm" />
            </div>
          </div>
          <div
            className="text-[11px] font-bold uppercase mb-4"
            style={{ color: '#00E5A0', letterSpacing: '3px' }}
          >
            Cadastro de leads FUNDEB
          </div>
          <h1
            className="text-3xl font-bold leading-tight"
            style={{ fontFamily: 'var(--font-source-serif), "Source Serif 4", Georgia, serif' }}
          >
            Acesso restrito à equipe APM
          </h1>
          <div
            className="mt-6 h-1 w-16 rounded-full"
            style={{ background: 'linear-gradient(90deg, #00B4D8 0%, #00E5A0 100%)' }}
          />
          <p
            className="mt-6 text-base leading-relaxed"
            style={{ fontFamily: 'Georgia, serif', color: 'rgba(255,255,255,0.82)' }}
          >
            Digite a senha da equipe APM para acessar o formulário de cadastro
            de prefeitos, secretários e contatos-chave dos municípios de São
            Paulo. A autorização fica salva neste dispositivo por 30 dias.
          </p>
        </div>
      </div>

      {/* Lado direito — form */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 px-4 py-8">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <div className="text-center mb-6">
            <div className="md:hidden mb-4 flex items-center justify-center gap-3">
              <div className="bg-white rounded-lg p-2 inline-flex items-center shadow-sm" style={{ border: '1px solid #E2E8F0', height: 48 }}>
                <Image src="/logos/apm-logo.jpg" alt="APM" width={1075} height={345} className="h-8 w-auto" style={{ height: '100%', width: 'auto', objectFit: 'contain' }} />
              </div>
              <span className="text-slate-300">×</span>
              <div className="inline-flex items-center">
                <Wordmark size="sm" />
              </div>
            </div>
            <h2 className="text-xl font-bold" style={{ color: '#0A5C5F' }}>
              Senha de acesso
            </h2>
            <p className="text-xs text-slate-500 mt-2">
              Exclusivo para o time operacional da APM
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 font-medium">
              {error}
            </div>
          )}

          <form action={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-2" style={{ color: '#0A5C5F' }}>
                Senha
              </label>
              <input
                name="password"
                type="password"
                required
                autoFocus
                autoComplete="current-password"
                className="w-full px-4 py-3 rounded-xl border-2 text-sm outline-none focus:border-teal-600 transition-colors"
                style={{ borderColor: '#E2E8F0' }}
                placeholder="••••••••••••"
              />
            </div>
            <button
              type="submit"
              className="w-full px-6 py-3 rounded-xl font-bold text-white text-sm transition-all hover:shadow-lg"
              style={{ background: 'linear-gradient(135deg, #0A5C5F 0%, #0D7377 35%, #11998E 70%, #1B8A5C 100%)' }}
            >
              Entrar →
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-[11px] text-slate-500 text-center">
            Senha institucional — obtenha com o coordenador APM do seu time.
          </div>
        </div>
      </div>
    </div>
  );
}
