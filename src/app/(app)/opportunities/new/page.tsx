import Link from 'next/link';
import { createOpportunity } from '@/lib/actions/opportunities';
import { allMunicipalities } from '@/lib/municipalities';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Field } from '@/components/ui/input';
import { Icon } from '@/components/ui/icon';
import { AdvancedOptions } from '@/components/advanced-options';
import { MunicipalityPicker } from '@/components/municipality-picker';

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

      <form action={createOpportunity} className="space-y-5 bg-white p-6 border border-slate-200 rounded-2xl">
        <Field label="Município">
          <MunicipalityPicker name="municipalityId" municipalities={municipalities} defaultValue={muniId} />
          <p className="text-xs text-slate-500 mt-1">
            {fromContact && sp.municipio && !muniId
              ? `Não achei "${sp.municipio}" na base — selecione manualmente.`
              : 'Opcional no estágio inicial; obrigatório para avançar.'}
          </p>
        </Field>

        {fromContact && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Contato principal</div>
            <input type="hidden" name="withContact" value="1" />
            <Field label="Nome"><Input name="contactName" defaultValue={cName} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cargo"><Input name="contactRole" defaultValue={cRole} placeholder="Ex.: Secretário(a) de Educação" /></Field>
              <Field label="WhatsApp / telefone"><Input name="contactPhone" defaultValue={cPhone} /></Field>
            </div>
            <Field label="E-mail"><Input name="contactEmail" type="email" defaultValue={cEmail} /></Field>
          </div>
        )}

        <Field label="Fonte do lead">
          <Input
            name="source"
            defaultValue={defaultSource}
            placeholder='Ex. "formulário /intake/fundeb", "APM", "indicação"'
          />
        </Field>
        <Field label="Valor estimado (R$)">
          <Input type="number" step="0.01" name="estimatedValue" placeholder="0,00" />
        </Field>
        <Field label="Observações iniciais">
          <Textarea name="notes" rows={4} placeholder="Contexto, como chegou, próximos passos…" />
        </Field>

        {/* Opções avançadas — duplicata recolhida. O conteúdo fica sempre montado
            (só escondido), então o checkbox segue sendo submetido pela action. */}
        <AdvancedOptions>
          <label className="flex items-start gap-2 text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <input type="checkbox" name="allowDuplicate" className="mt-0.5 h-3.5 w-3.5" />
            <span>
              <strong className="block text-amber-800">Permitir duplicada</strong>
              Por padrão, o sistema bloqueia criar uma nova oportunidade quando o
              município já tem uma oportunidade ativa. Marque só se souber o que está
              fazendo (ex: segundo órgão no mesmo município).
            </span>
          </label>
        </AdvancedOptions>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Link href="/opportunities"><Button variant="secondary" type="button">Cancelar</Button></Link>
          <Button type="submit">Criar oportunidade</Button>
        </div>
      </form>
    </div>
  );
}
