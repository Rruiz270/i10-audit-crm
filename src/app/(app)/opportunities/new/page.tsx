import Link from 'next/link';
import { createOpportunity } from '@/lib/actions/opportunities';
import { allMunicipalities } from '@/lib/municipalities';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Field } from '@/components/ui/input';
import { MunicipalityPicker } from '@/components/municipality-picker';

export default async function NewOpportunityPage() {
  const municipalities = await allMunicipalities();
  return (
    <div className="px-8 py-8 max-w-2xl">
      <header className="mb-6">
        <Link href="/opportunities" className="text-xs text-slate-500 hover:text-i10-700">
          ← Voltar para oportunidades
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">Nova oportunidade</h1>
        <p className="text-sm text-slate-500 mt-1">
          Cria um lead inicial no estágio <span className="font-medium">Novo</span>.
        </p>
      </header>

      <form action={createOpportunity} className="space-y-5 bg-white p-6 border border-slate-200 rounded-lg">
        <Field label="Município">
          <MunicipalityPicker name="municipalityId" municipalities={municipalities} />
          <p className="text-xs text-slate-500 mt-1">Opcional no estágio inicial; obrigatório para avançar.</p>
        </Field>
        <Field label="Fonte do lead">
          <Input
            name="source"
            placeholder='Ex. "formulário /intake/fundeb", "APM", "indicação"'
          />
        </Field>
        <Field label="Valor estimado (R$)">
          <Input type="number" step="0.01" name="estimatedValue" placeholder="0,00" />
        </Field>
        <Field label="Observações iniciais">
          <Textarea name="notes" rows={4} placeholder="Contexto, como chegou, próximos passos…" />
        </Field>

        <label className="flex items-start gap-2 text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded p-3">
          <input type="checkbox" name="allowDuplicate" className="mt-0.5 h-3.5 w-3.5" />
          <span>
            <strong className="block text-amber-800">Permitir duplicada</strong>
            Por padrão, o sistema bloqueia criar uma nova oportunidade quando o
            município já tem uma oportunidade ativa. Marque só se souber o que está
            fazendo (ex: segundo órgão no mesmo município).
          </span>
        </label>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Link href="/opportunities"><Button variant="secondary" type="button">Cancelar</Button></Link>
          <Button type="submit">Criar oportunidade</Button>
        </div>
      </form>
    </div>
  );
}
