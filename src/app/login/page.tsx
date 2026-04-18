import { signIn, auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect('/');

  const { callbackUrl } = await searchParams;

  async function doGoogleSignIn() {
    'use server';
    await signIn('google', { redirectTo: callbackUrl ?? '/' });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <div className="text-center mb-8">
          <div className="text-4xl font-bold text-i10-700">i10</div>
          <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">
            Audit CRM
          </div>
          <h1 className="text-xl font-semibold text-slate-900 mt-6">Entrar</h1>
          <p className="text-sm text-slate-500 mt-1">
            Acesse com sua conta Google do Instituto i10
          </p>
        </div>

        <form action={doGoogleSignIn}>
          <button
            type="submit"
            className="w-full bg-i10-700 hover:bg-i10-800 text-white font-medium rounded-md py-2.5 transition-colors"
          >
            Entrar com Google
          </button>
        </form>

        <p className="text-xs text-slate-400 text-center mt-6">
          Orquestrando o futuro da educação pública brasileira.
        </p>
      </div>
    </div>
  );
}
