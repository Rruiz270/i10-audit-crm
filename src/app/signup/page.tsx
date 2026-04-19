import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Wordmark } from '@/components/ui/wordmark';
import { SignupForm } from '@/components/signup-form';

export default async function SignupPage() {
  const session = await auth();
  if (session?.user) redirect('/');

  return (
    <div className="min-h-screen flex items-stretch">
      <div className="hidden md:flex md:w-1/2 i10-gradient-dark relative overflow-hidden items-center justify-center">
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
            Instituto i10 · Cadastro
          </div>
          <Wordmark tone="light" size="xl" />
          <div className="mt-6 h-1 w-16 rounded-full i10-gradient-accent" />
          <p
            className="mt-8 text-lg leading-relaxed"
            style={{ fontFamily: 'var(--font-source-serif), serif', color: 'rgba(255,255,255,0.82)' }}
          >
            Solicite acesso para começar a atuar na captação de consultorias
            FUNDEB. Seu cadastro fica pendente até que um admin do time aprove
            — normalmente no mesmo dia.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center bg-slate-50 px-4 py-8">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <div className="text-center mb-6">
            <div className="md:hidden mb-4 flex justify-center">
              <Wordmark size="lg" />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
              Solicitar acesso
            </h1>
            <p className="text-sm text-slate-500 mt-2">
              Você entra na fila. Admin aprova e você recebe o acesso.
            </p>
          </div>

          <SignupForm />

          <div className="mt-6 text-center text-xs">
            <Link href="/login" className="text-slate-600 hover:text-[var(--i10-navy)]">
              ← Já tenho conta, voltar para login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
