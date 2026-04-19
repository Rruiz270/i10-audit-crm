import { isAdmin, requireUser } from '@/lib/session';
import { listAllStagesIncludingInactive } from '@/lib/actions/stages';
import { StagesManager } from '@/components/stages-manager';
import { RestrictedGate } from '@/components/restricted-gate';

export const dynamic = 'force-dynamic';

export default async function StagesSettingsPage() {
  const user = await requireUser();
  if (!isAdmin(user.role)) {
    return (
      <RestrictedGate
        required="admin / gestor"
        currentRole={user.role}
        section="configuração de estágios do pipeline"
      />
    );
  }
  const stages = await listAllStagesIncludingInactive();

  return (
    <div className="px-8 py-8 max-w-5xl">
      <header className="mb-6">
        <div className="i10-eyebrow mb-2">Configurações · Pipeline</div>
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--i10-navy)' }}>
          Estágios do funil
        </h1>
        <div className="i10-divider mt-3" />
        <p
          className="text-slate-600 mt-4 max-w-2xl"
          style={{ fontFamily: 'var(--font-source-serif), serif', fontSize: '15px' }}
        >
          Os 8 estágios padrão refletem o processo de captação do i10. Você pode
          adicionar estágios customizados entre eles (ex: &ldquo;Kickoff pendente&rdquo;,
          &ldquo;Relatório entregue&rdquo;, &ldquo;Q2 revisita&rdquo;) para modelar
          fluxos específicos do seu time.
        </p>
      </header>

      <StagesManager stages={stages} />
    </div>
  );
}
