import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { contacts, opportunities, fundebMunicipalities } from '@/lib/schema';

export const dynamic = 'force-dynamic';

export default async function ContactsPage() {
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      role: contacts.role,
      email: contacts.email,
      phone: contacts.phone,
      whatsapp: contacts.whatsapp,
      isPrimary: contacts.isPrimary,
      createdAt: contacts.createdAt,
      opportunityId: contacts.opportunityId,
      municipalityName: fundebMunicipalities.nome,
    })
    .from(contacts)
    .leftJoin(opportunities, eq(contacts.opportunityId, opportunities.id))
    .leftJoin(fundebMunicipalities, eq(opportunities.municipalityId, fundebMunicipalities.id))
    .orderBy(desc(contacts.createdAt))
    .limit(500);

  return (
    <div className="px-8 py-8 max-w-7xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Contatos</h1>
        <p className="text-sm text-slate-500 mt-1">{rows.length} contato{rows.length === 1 ? '' : 's'}</p>
      </header>

      {rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-500 italic">
          Nenhum contato ainda. Adicione contatos dentro de cada oportunidade.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wider">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wider">Cargo</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wider">Contato</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wider">Município</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{c.name}</div>
                    {c.isPrimary && (
                      <span className="text-xs text-i10-700">principal</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{c.role ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-700">
                    <div>{c.email ?? '—'}</div>
                    <div className="text-xs text-slate-500">
                      {c.phone ?? c.whatsapp ?? ''}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/opportunities/${c.opportunityId}`} className="text-i10-700 hover:underline">
                      {c.municipalityName ?? `#${c.opportunityId}`}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
