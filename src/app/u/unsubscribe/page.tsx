import { redirect } from 'next/navigation';
import { verifyUnsubscribeToken } from '@/lib/marketing/template-engine';
import { addSuppression } from '@/lib/marketing/suppression';
import { headers } from 'next/headers';

// ─── /u/unsubscribe — página pública de descadastro ───────────────────────
// Recebe ?t=<HMAC token>. Por padrão exige confirmação (1 clique no botão)
// pra evitar prefetch acidental de "verificadores de link" tipo Outlook.
//
// Se body POST contém List-Unsubscribe=One-Click (RFC 8058), processa
// imediatamente — esse é o handler one-click do Gmail/Yahoo.

export const dynamic = 'force-dynamic';

type SearchParamsRaw = Promise<{ t?: string; confirmed?: string }>;

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: SearchParamsRaw;
}) {
  const sp = await searchParams;
  const token = sp.t;
  const isConfirmed = sp.confirmed === '1';
  const secret = process.env.MARKETING_UNSUB_SECRET ?? 'dev-secret';

  if (!token) {
    return <ErrorScreen message="Link inválido — token ausente." />;
  }

  const verification = verifyUnsubscribeToken(token, secret);
  if (!verification.ok) {
    return <ErrorScreen message={`Link inválido ou expirado (${verification.reason}).`} />;
  }

  // Se já confirmou, executa unsubscribe agora
  if (isConfirmed) {
    const h = await headers();
    await addSuppression({
      identifier: verification.email,
      channel: 'email',
      reason: 'unsubscribe',
      sourceRef: 'unsubscribe_page',
      sourceIp: h.get('x-forwarded-for')?.split(',')[0] ?? undefined,
      userAgent: h.get('user-agent') ?? undefined,
      consentText: 'Solicitou descadastro via página /u/unsubscribe',
    });
    return <SuccessScreen email={verification.email} />;
  }

  // Tela de confirmação
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 flex items-center">
      <div className="max-w-md mx-auto bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <div className="text-center mb-6">
          <div className="text-3xl font-bold text-i10-700">i10</div>
          <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">
            Instituto i10 · LGPD
          </div>
        </div>
        <h1 className="text-xl font-semibold text-slate-900 mb-3">Confirmar descadastro</h1>
        <p className="text-sm text-slate-600 mb-6">
          Você está prestes a remover <b>{verification.email}</b> de todas as comunicações de
          marketing do Instituto i10. Isso é imediato e permanente — para voltar a receber, será
          preciso solicitar manualmente.
        </p>
        <form method="GET" action="/u/unsubscribe">
          <input type="hidden" name="t" value={token} />
          <input type="hidden" name="confirmed" value="1" />
          <button
            type="submit"
            className="w-full bg-red-600 text-white rounded-lg py-3 font-medium hover:bg-red-700 transition"
          >
            Confirmar descadastro
          </button>
        </form>
        <p className="text-xs text-slate-500 text-center mt-6">
          Se você não solicitou isso, basta fechar esta página — nenhuma alteração será feita.
        </p>
      </div>
    </div>
  );
}

function SuccessScreen({ email }: { email: string }) {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 flex items-center">
      <div className="max-w-md mx-auto bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
        <div className="text-3xl font-bold text-i10-700">i10</div>
        <div className="text-xs text-slate-500 uppercase tracking-wider mt-1 mb-6">
          Instituto i10 · LGPD
        </div>
        <div className="w-12 h-12 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
          <svg
            className="w-6 h-6 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-slate-900 mb-2">Descadastro concluído</h1>
        <p className="text-sm text-slate-600">
          O endereço <b>{email}</b> não receberá mais comunicações do Instituto i10.
        </p>
        <p className="text-xs text-slate-500 mt-6">
          Em conformidade com a LGPD (Lei 13.709/2018, Art. 18). Registro arquivado para fins de
          auditoria.
        </p>
      </div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 flex items-center">
      <div className="max-w-md mx-auto bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-900 mb-2">Não foi possível processar</h1>
        <p className="text-sm text-slate-600">{message}</p>
        <p className="text-xs text-slate-500 mt-6">
          Para descadastrar manualmente, escreva para{' '}
          <a href="mailto:contato@institutoi10.org.br" className="text-i10-700 underline">
            contato@institutoi10.org.br
          </a>
          .
        </p>
      </div>
    </div>
  );
}
