import { isAdmin, requireUser } from '@/lib/session';
import { listTags } from '@/lib/actions/tags';
import { TagsManager } from '@/components/tags-manager';
import { RestrictedGate } from '@/components/restricted-gate';

export const dynamic = 'force-dynamic';

export default async function TagsSettingsPage() {
  const user = await requireUser();
  if (!isAdmin(user.role)) {
    return (
      <RestrictedGate
        required="admin / gestor"
        currentRole={user.role}
        section="gestão de tags de oportunidade"
      />
    );
  }
  const tags = await listTags();

  return (
    <div className="px-8 py-8 max-w-5xl">
      <header className="mb-6">
        <div className="i10-eyebrow mb-2">Configurações · Taxonomia</div>
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--i10-navy)' }}>
          Tags de oportunidade
        </h1>
        <div className="i10-divider mt-3" />
        <p
          className="text-slate-600 mt-4 max-w-2xl"
          style={{ fontFamily: 'var(--font-source-serif), serif', fontSize: '15px' }}
        >
          A taxonomia padrão (origem e produto) é aplicada automaticamente quando
          uma oportunidade é criada — manual, formulário público, APM ou presença
          em webinar. Você pode adicionar tags customizadas, desativar as que não
          usa e escolher as cores dos chips que aparecem na lista de oportunidades.
        </p>
      </header>

      <TagsManager tags={tags} />
    </div>
  );
}
