import Image from 'next/image';
import { redirect } from 'next/navigation';
import { allMunicipalities } from '@/lib/municipalities';
import { ApmCadastroForm } from '@/components/apm-cadastro-form';
import { Wordmark } from '@/components/ui/wordmark';
import { hasApmGate } from '@/lib/actions/apm-gate';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'APM — Cadastro de Leads FUNDEB | Instituto i10',
  description:
    'Formulário operacional da APM × Instituto i10 para registrar prefeitos, secretários e contatos-chave dos municípios no CRM de captação FUNDEB.',
};

export default async function ApmCadastroPage() {
  // Gate de senha: se não tem o cookie, volta pra /apm (tela de senha)
  if (!(await hasApmGate())) {
    redirect('/apm');
  }

  const municipalities = await allMunicipalities();

  return (
    <div
      className="min-h-screen"
      style={{ background: '#F7FAFC', fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' }}
    >
      {/* Hero teal APM */}
      <div
        className="relative overflow-hidden text-white"
        style={{ background: 'linear-gradient(160deg, #0A5C5F 0%, #0D7377 35%, #11998E 70%, #1B8A5C 100%)' }}
      >
        {/* Pattern decorativo — mesmo do APM fundeb-sp */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 40%, rgba(0,229,160,0.25) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(0,180,216,0.2) 0%, transparent 40%)',
          }}
        />
        <div className="relative max-w-3xl mx-auto px-6 py-12 md:py-16">
          {/* Logos co-branded: APM logo oficial + wordmark i10 */}
          <div className="flex flex-wrap items-center gap-5 mb-8">
            <div
              className="bg-white rounded-xl p-3 shadow-md inline-flex items-center"
              style={{ height: 64 }}
            >
              <Image
                src="/logos/apm-logo.jpg"
                alt="APM — Associação Paulista de Municípios"
                width={1075}
                height={345}
                priority
                className="h-10 md:h-12 w-auto"
                style={{ height: '100%', width: 'auto', objectFit: 'contain' }}
              />
            </div>
            <div
              className="text-2xl font-bold select-none"
              style={{ color: 'rgba(255,255,255,0.4)' }}
              aria-hidden
            >
              ×
            </div>
            <div
              className="bg-white rounded-xl px-4 shadow-md inline-flex items-center"
              style={{ height: 64 }}
            >
              <Wordmark size="md" />
            </div>
          </div>
          <div
            className="inline-block px-4 py-1.5 rounded-full text-[11px] font-bold mb-6"
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.3)',
              letterSpacing: '1.5px',
            }}
          >
            CADASTRO OPERACIONAL · FUNDEB SP
          </div>
          <h1
            className="text-3xl md:text-5xl font-bold leading-tight mb-4"
            style={{ fontFamily: 'var(--font-source-serif), "Source Serif 4", Georgia, serif' }}
          >
            Cadastro de leads FUNDEB
          </h1>
          <p className="text-base md:text-lg opacity-90 max-w-2xl" style={{ lineHeight: 1.6 }}>
            Registre prefeitos, secretários e contatos-chave captados em campo.
            O lead cai direto no CRM do Instituto i10 como oportunidade no estágio{' '}
            <strong>Novo</strong>, pronta pro consultor fazer o primeiro contato.
          </p>
          <div className="mt-6 flex flex-wrap gap-6 text-sm opacity-80">
            <div>
              <span className="text-3xl font-extrabold" style={{ color: '#00E5A0' }}>
                645
              </span>
              <span className="ml-2 text-xs uppercase tracking-wider">municípios SP</span>
            </div>
            <div>
              <span className="text-3xl font-extrabold" style={{ color: '#00E5A0' }}>
                R$ bi
              </span>
              <span className="ml-2 text-xs uppercase tracking-wider">em VAAT/VAAR</span>
            </div>
            <div>
              <span className="text-3xl font-extrabold" style={{ color: '#00E5A0' }}>
                ∞
              </span>
              <span className="ml-2 text-xs uppercase tracking-wider">contatos por município</span>
            </div>
          </div>
        </div>
      </div>

      {/* Form card */}
      <div className="max-w-3xl mx-auto px-6 py-8 md:py-12 -mt-6 md:-mt-10">
        <div
          className="bg-white rounded-2xl p-6 md:p-10 shadow-lg"
          style={{ border: '1px solid #E2E8F0' }}
        >
          <ApmCadastroForm municipalities={municipalities} />
        </div>

        <div className="mt-8 text-center text-xs text-slate-500 space-y-2">
          <p>
            Os dados são armazenados no CRM do Instituto i10 e acessados apenas pelo time de consultoria.
            Tratamento conforme LGPD.
          </p>
          <p>
            <strong style={{ color: '#0A5C5F' }}>APM × Instituto i10</strong> · Orquestrando a educação pública brasileira
          </p>
        </div>
      </div>
    </div>
  );
}
