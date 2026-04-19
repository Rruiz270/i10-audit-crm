import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { signIn, auth } from '@/lib/auth';
import { Wordmark } from '@/components/ui/wordmark';

/**
 * Next.js signals a successful redirect by throwing an error with a
 * `digest` starting with "NEXT_REDIRECT;". We must let those bubble up so
 * the framework completes the navigation. Errors from NextAuth carry their
 * own shape (AuthError with `.type`), which we catch and redirect manually.
 */
function isNextRedirectError(err: unknown): boolean {
  return (
    !!err &&
    typeof err === 'object' &&
    'digest' in err &&
    typeof (err as { digest?: unknown }).digest === 'string' &&
    (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect('/');

  const { callbackUrl, error } = await searchParams;
  const safeCallback = callbackUrl ?? '/';

  async function doGoogleSignIn() {
    'use server';
    try {
      await signIn('google', { redirectTo: safeCallback });
    } catch (err) {
      if (isNextRedirectError(err)) throw err;
      if (err instanceof AuthError) {
        redirect(`/login?error=${err.type}`);
      }
      throw err;
    }
  }

  async function doCredentialsSignIn(formData: FormData) {
    'use server';
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');
    try {
      await signIn('credentials', {
        email,
        password,
        redirectTo: safeCallback,
      });
    } catch (err) {
      // Next.js sinaliza redirect (success case) por throwing — precisa re-throw
      if (isNextRedirectError(err)) throw err;
      if (err instanceof AuthError) {
        redirect(`/login?error=${err.type}`);
      }
      throw err;
    }
  }

  return (
    <div className="min-h-screen flex items-stretch">
      {/* Lado esquerdo — branding hero em navy gradient */}
      <div
        className="hidden md:flex md:w-1/2 i10-gradient-dark relative overflow-hidden items-center justify-center"
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(60deg, transparent, transparent 40px, rgba(255,255,255,0.5) 40px, rgba(255,255,255,0.5) 41px)',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 20% 50%, rgba(0,180,216,0.18) 0%, transparent 50%), radial-gradient(circle at 80% 30%, rgba(0,229,160,0.12) 0%, transparent 40%)',
          }}
        />

        <div className="relative max-w-sm px-10 text-white">
          <div
            className="text-[11px] font-bold uppercase mb-4"
            style={{ color: 'var(--i10-cyan)', letterSpacing: '3px' }}
          >
            Instituto i10 · Audit CRM
          </div>
          <Wordmark tone="light" size="xl" />
          <div className="mt-6 h-1 w-16 rounded-full i10-gradient-accent" />
          <p
            className="mt-8 text-lg leading-relaxed"
            style={{ fontFamily: 'var(--font-source-serif), serif', color: 'rgba(255,255,255,0.82)' }}
          >
            Transformação, evidência, impacto. Captamos parcerias com municípios
            brasileiros para auditorias FUNDEB baseadas em dados e em metodologia
            rigorosa.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4 text-xs text-white/70">
            <div>
              <div className="text-2xl font-bold text-white">645+</div>
              <div className="mt-1">municípios</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">R$ bi</div>
              <div className="mt-1">em VAAT/VAAR</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">1</div>
              <div className="mt-1">pipeline, 8 estágios</div>
            </div>
          </div>
        </div>
      </div>

      {/* Lado direito — form */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 px-4 py-8">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <div className="text-center mb-6">
            <div className="md:hidden mb-4 flex justify-center">
              <Wordmark size="lg" />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
              Entrar
            </h1>
            <p className="text-sm text-slate-500 mt-2">
              Acesso restrito a consultores do Instituto i10.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-md bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
              {error === 'CredentialsSignin'
                ? 'Email ou senha incorretos, ou cadastro ainda não aprovado.'
                : error}
            </div>
          )}

          {/* Email + senha */}
          <form action={doCredentialsSignIn} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-i10-500 focus:outline-none focus:ring-1 focus:ring-i10-500"
                placeholder="fulano@i10.org"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Senha</label>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-i10-500 focus:outline-none focus:ring-1 focus:ring-i10-500"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              className="w-full text-white font-semibold rounded-md py-2.5 transition-colors"
              style={{ background: 'var(--i10-navy)' }}
            >
              Entrar com email
            </button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 bg-white text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                ou
              </span>
            </div>
          </div>

          {/* Google OAuth */}
          <form action={doGoogleSignIn}>
            <button
              type="submit"
              className="w-full font-medium rounded-md py-2.5 transition-colors border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
            >
              <span className="inline-flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="#4285F4"
                    d="M21.35 11.1h-9.17v2.98h5.5c-.25 1.6-1.84 4.7-5.5 4.7-3.3 0-6-2.72-6-6.08s2.7-6.08 6-6.08c1.88 0 3.15.8 3.88 1.48l2.64-2.55C17 4.11 14.78 3 12.18 3 6.95 3 2.72 7.23 2.72 12.46s4.23 9.46 9.46 9.46c5.47 0 9.09-3.84 9.09-9.25 0-.62-.07-1.1-.17-1.57z"
                  />
                </svg>
                Entrar com Google (Workspace i10)
              </span>
            </button>
          </form>

          <div className="mt-6 text-center text-xs">
            <Link
              href="/signup"
              className="font-semibold"
              style={{ color: 'var(--i10-cyan-dark)' }}
            >
              Ainda não tenho conta — me cadastrar
            </Link>
          </div>

          <div className="mt-8 border-t border-slate-100 pt-5 text-xs text-slate-500 space-y-1">
            <p>
              Após o cadastro, um admin precisa aprovar seu acesso antes do primeiro login.
            </p>
            <p
              className="mt-3 font-semibold uppercase"
              style={{ color: 'var(--i10-navy)', letterSpacing: '2px' }}
            >
              Orquestrando o futuro da educação pública brasileira.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
