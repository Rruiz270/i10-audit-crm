import { isAdmin, requireUser } from '@/lib/session';
import { RestrictedGate } from '@/components/restricted-gate';
import { listTeam } from '@/lib/actions/team';
import { TeamManager } from '@/components/team-manager';

export const dynamic = 'force-dynamic';

export default async function AdminTeamPage() {
  const user = await requireUser();
  if (!isAdmin(user.role)) {
    return (
      <RestrictedGate
        required="admin / gestor"
        currentRole={user.role}
        section="gestão do time"
      />
    );
  }
  const team = await listTeam();
  return (
    <div className="px-8 py-8 max-w-5xl">
      <header className="mb-6">
        <div className="i10-eyebrow mb-2">Administração · Time</div>
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--i10-navy)' }}>
          Usuários e permissões
        </h1>
        <div className="i10-divider mt-3" />
        <p
          className="text-slate-600 mt-4 max-w-3xl"
          style={{ fontFamily: 'var(--font-source-serif), serif', fontSize: '15px' }}
        >
          Adicione novos consultores, promova a gestor/admin, desative quem saiu.
          Novos convites só conseguem logar se o email estiver cadastrado aqui com
          role atribuído.
        </p>
      </header>

      <TeamManager team={team} selfId={user.id} />
    </div>
  );
}
