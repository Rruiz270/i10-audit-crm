import Link from 'next/link';
import { allMunicipalities } from '@/lib/municipalities';
import { Icon } from '@/components/ui/icon';
import { NewOpportunityForm } from '@/components/new-opportunity-form';

// Normaliza p/ casar município ignorando acento/caixa ("Sao Paulo" = "São Paulo").
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export default async function NewOpportunityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const municipalities = await allMunicipalities();

  // Prefill vindo da ficha do contato (＋ Oportunidade).
  const fromContact = sp.fromContact === '1';
  const cName = sp.name ?? '';
  const cPhone = sp.whatsapp ?? sp.phone ?? '';
  const cEmail = sp.email ?? '';
  const cRole = sp.role ?? '';

  // Resolve o município (nome+UF) para o id do picker — sem acento.
  let muniId: number | null = null;
  if (sp.municipio) {
    const target = norm(sp.municipio);
    const uf = (sp.uf ?? '').toUpperCase();
    const match =
      municipalities.find((m) => norm(m.nome) === target && (!uf || m.uf === uf)) ??
      municipalities.find((m) => norm(m.nome) === target);
    muniId = match?.id ?? null;
  }
  const defaultSource = sp.origem ?? (fromContact && cName ? `Contato: ${cName}` : '');

  return (
    <div className="px-8 py-8 max-w-2xl">
      <header className="mb-6">
        <Link href="/opportunities" className="text-xs text-slate-500 hover:text-i10-700">
          ← Voltar para oportunidades
        </Link>
        <div className="i10-eyebrow mt-3 mb-1">Funil · Captação</div>
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-i10-cyan-wash text-i10-cyan-dark">
            <Icon name="briefcase" size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--i10-navy)' }}>
              Nova oportunidade
            </h1>
            <p className="text-sm text-slate-500">
              Cria um lead inicial no estágio <span className="font-medium">Novo</span>.
            </p>
          </div>
        </div>
      </header>

      {fromContact && (
        <div className="mb-5 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
          <b>Dados do contato preenchidos.</b> Confira e ajuste se precisar — o município é editável abaixo.
        </div>
      )}

      <NewOpportunityForm
        municipalities={municipalities}
        muniId={muniId}
        pickerHint={
          fromContact && sp.municipio && !muniId
            ? `Não achei "${sp.municipio}" na base — selecione manualmente.`
            : 'Opcional no estágio inicial; obrigatório para avançar.'
        }
        fromContact={fromContact}
        defaults={{ name: cName, role: cRole, phone: cPhone, email: cEmail, source: defaultSource }}
      />
    </div>
  );
}
