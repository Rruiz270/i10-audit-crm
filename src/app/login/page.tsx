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
                <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <path fill="#4285F4" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.806.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9573v2.3318C2.4382 15.9831 5.4818 18 9 18z"/>
                  <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.2823-1.1168-.2823-1.71s.1023-1.17.2823-1.71V4.9582H.9573C.3477 6.1731 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.964 10.71z"/>
                  <path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"/>
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
