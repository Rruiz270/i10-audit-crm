import Image from 'next/image';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Wordmark } from '@/components/ui/wordmark';
import { hasApmGate } from '@/lib/actions/apm-gate';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'APM — Dashboard | Instituto i10',
  description:
    'Hub APM × Instituto i10 — cadastro de leads, downloads, métricas de email marketing e treinamento da plataforma BNCC Captação.',
};

const TRAININGS = [
  {
    cityKey: 'pequeno-balbinos',
    label: 'Município pequeno',
    municipio: 'Balbinos',
    matriculas: '143 alunos',
    pot: 'R$ 1,3 mi de potencial',
    duration: '~7 min',
    badge: { bg: '#D1FAE5', text: '#047857' },
  },
  {
    cityKey: 'medio-paulinia',
    label: 'Município médio',
    municipio: 'Paulínia',
    matriculas: '13.714 alunos',
    pot: 'R$ 46,8 mi de potencial',
    duration: '~7 min',
    badge: { bg: '#FEF3C7', text: '#B45309' },
  },
  {
    cityKey: 'grande-campinas',
    label: 'Município grande',
    municipio: 'Campinas',
    matriculas: '62.875 alunos',
    pot: 'R$ 164,1 mi de potencial',
    duration: '~7 min',
    badge: { bg: '#CFFAFE', text: '#0E7490' },
  },
];

const TRAINING_BASE = 'https://www.institutoi10.com.br/sistemas/admin/treinamento';

export default async function ApmDashboardPage() {
  if (!(await hasApmGate())) {
    redirect('/apm');
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: '#F7FAFC', fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' }}
    >
      <div
        className="relative overflow-hidden text-white"
        style={{ background: 'linear-gradient(160deg, #0A5C5F 0%, #0D7377 35%, #11998E 70%, #1B8A5C 100%)' }}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 40%, rgba(0,229,160,0.25) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(0,180,216,0.2) 0%, transparent 40%)',
          }}
        />
        <div className="relative max-w-6xl mx-auto px-6 py-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="bg-white rounded-xl p-2 shadow-md inline-flex items-center" style={{ height: 52 }}>
              <Image
                src="/logos/apm-logo.jpg"
                alt="APM"
                width={1075}
                height={345}
                priority
                className="h-8 w-auto"
                style={{ height: '100%', width: 'auto', objectFit: 'contain' }}
              />
            </div>
            <div className="text-xl font-bold text-white/30">×</div>
            <div className="bg-white rounded-xl px-3 shadow-md inline-flex items-center" style={{ height: 52 }}>
              <Wordmark size="sm" />
            </div>
          </div>
          <div
            className="text-[11px] font-bold uppercase mb-3"
            style={{ color: '#00E5A0', letterSpacing: '3px' }}
          >
            Dashboard APM × i10
          </div>
          <h1
            className="text-3xl font-bold leading-tight max-w-3xl"
            style={{ fontFamily: 'var(--font-source-serif), "Source Serif 4", Georgia, serif' }}
          >
            Hub do time APM
          </h1>
          <p
            className="mt-4 text-base max-w-2xl leading-relaxed"
            style={{ fontFamily: 'Georgia, serif', color: 'rgba(255,255,255,0.85)' }}
          >
            Cadastro de leads, downloads do kit, métricas do email marketing
            pós-evento e treinamento operacional da plataforma BNCC Captação.
          </p>
        </div>
      </div>

      {/* Quick links */}
      <div className="max-w-6xl mx-auto px-6 -mt-6 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Link
            href="/apm/cadastro"
            className="bg-white rounded-xl p-4 border border-slate-200 hover:border-teal-400 transition-colors shadow-sm"
          >
            <div className="text-[10px] font-bold uppercase tracking-widest text-teal-600 mb-1">Cadastro</div>
            <div className="text-sm font-semibold text-slate-900">Registrar leads</div>
            <div className="text-xs text-slate-500 mt-0.5">Formulário operacional</div>
          </Link>
          <a
            href="#downloads"
            className="bg-white rounded-xl p-4 border border-slate-200 hover:border-teal-400 transition-colors shadow-sm"
          >
            <div className="text-[10px] font-bold uppercase tracking-widest text-teal-600 mb-1">Downloads</div>
            <div className="text-sm font-semibold text-slate-900">Kit de implementação</div>
            <div className="text-xs text-slate-500 mt-0.5">Em breve</div>
          </a>
          <a
            href="#email-marketing"
            className="bg-white rounded-xl p-4 border border-slate-200 hover:border-teal-400 transition-colors shadow-sm"
          >
            <div className="text-[10px] font-bold uppercase tracking-widest text-teal-600 mb-1">Email Mkt</div>
            <div className="text-sm font-semibold text-slate-900">Métricas pós-evento</div>
            <div className="text-xs text-slate-500 mt-0.5">Em breve</div>
          </a>
          <a
            href="#treinamento"
            className="bg-white rounded-xl p-4 border-2 border-teal-500 hover:bg-teal-50 transition-colors shadow-sm"
          >
            <div className="text-[10px] font-bold uppercase tracking-widest text-teal-600 mb-1">Treinamento</div>
            <div className="text-sm font-semibold text-slate-900">3 simulações</div>
            <div className="text-xs text-teal-600 mt-0.5 font-semibold">Disponível agora ↓</div>
          </a>
        </div>
      </div>

      {/* Treinamento section */}
      <div id="treinamento" className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <div
            className="text-[11px] font-bold uppercase mb-2"
            style={{ color: '#0D7377', letterSpacing: '2.5px' }}
          >
            Treinamento da plataforma
          </div>
          <h2
            className="text-2xl font-bold text-slate-900"
            style={{ fontFamily: 'var(--font-source-serif), "Source Serif 4", Georgia, serif' }}
          >
            Simulações de consultoria FUNDEB
          </h2>
          <p className="mt-2 text-sm text-slate-600 max-w-3xl leading-relaxed">
            3 vídeos guiados mostrando como conduzir uma consultoria completa do início ao fim.
            Cada cidade tem tamanho diferente e o diálogo simula uma <strong>Secretária de Educação</strong> fazendo perguntas reais
            enquanto o <strong>Consultor i10</strong> responde e navega o sistema. Inclui as 9 etapas do wizard
            + tour por todas as ferramentas da plataforma + modo telão final.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {TRAININGS.map((t) => (
            <a
              key={t.cityKey}
              href={`${TRAINING_BASE}/${t.cityKey}`}
              target="_blank"
              rel="noopener"
              className="block bg-white rounded-xl overflow-hidden border border-slate-200 hover:border-teal-400 hover:shadow-lg transition-all group"
            >
              <div
                className="aspect-video relative flex items-center justify-center text-white"
                style={{ background: 'linear-gradient(160deg, #0A5C5F 0%, #0D7377 35%, #11998E 70%)' }}
              >
                <div className="text-center px-4">
                  <div
                    className="inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full mb-2"
                    style={{ background: t.badge.bg, color: t.badge.text }}
                  >
                    {t.label}
                  </div>
                  <div
                    className="text-2xl font-extrabold"
                    style={{ fontFamily: 'var(--font-source-serif), "Source Serif 4", serif' }}
                  >
                    {t.municipio}
                  </div>
                  <div className="text-xs opacity-70 mt-1">{t.matriculas}</div>
                </div>
                <div
                  className="absolute bottom-3 right-3 w-11 h-11 rounded-full flex items-center justify-center text-white text-xl group-hover:scale-110 transition-transform"
                  style={{ background: '#00E5A0', color: '#0A5C5F' }}
                >
                  ▶
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Duração</span>
                  <span className="font-bold text-slate-900">{t.duration}</span>
                </div>
                <div className="flex items-center justify-between text-xs mt-2">
                  <span className="text-slate-500 font-medium">Potencial</span>
                  <span className="font-bold text-emerald-600">{t.pot}</span>
                </div>
                <div className="flex items-center justify-between text-xs mt-2">
                  <span className="text-slate-500 font-medium">Cenas</span>
                  <span className="font-bold text-slate-900">22</span>
                </div>
                <div
                  className="mt-4 pt-3 border-t border-slate-100 text-xs font-bold flex items-center justify-between"
                  style={{ color: '#0D7377' }}
                >
                  <span>Abrir treinamento</span>
                  <span>→</span>
                </div>
              </div>
            </a>
          ))}
        </div>

        <div className="mt-8 bg-white rounded-xl p-6 border border-slate-200">
          <h3 className="text-base font-bold text-slate-900 mb-2">Como usar</h3>
          <ul className="text-sm text-slate-600 space-y-1.5 ml-4 list-disc">
            <li>
              Comece pelo município que mais se parece com o caso real que você está captando — pequeno, médio ou grande.
            </li>
            <li>
              Cada vídeo cobre as 9 etapas do wizard + tour por todas as ferramentas da sidebar (Dashboard, Simulador, Calculadora EC 135, etc).
            </li>
            <li>
              Use as setas do teclado <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 text-[10px]">←</kbd> e <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 text-[10px]">→</kbd> para navegar entre cenas.
            </li>
            <li>
              Os vídeos abrem em uma nova aba (sistema BNCC Captação). Você continua logado ao voltar pra cá.
            </li>
          </ul>
        </div>

        {/* Placeholders pra próximas seções */}
        <div id="downloads" className="mt-12">
          <div
            className="text-[11px] font-bold uppercase mb-2"
            style={{ color: '#0D7377', letterSpacing: '2.5px' }}
          >
            Downloads do kit
          </div>
          <h2
            className="text-2xl font-bold text-slate-900"
            style={{ fontFamily: 'var(--font-source-serif), "Source Serif 4", Georgia, serif' }}
          >
            Kit de implementação
          </h2>
          <div className="mt-4 bg-white rounded-xl p-6 border border-slate-200 text-sm text-slate-600">
            Em breve — material de apoio do APM (PDFs, planilhas, slides).
          </div>
        </div>

        <div id="email-marketing" className="mt-12">
          <div
            className="text-[11px] font-bold uppercase mb-2"
            style={{ color: '#0D7377', letterSpacing: '2.5px' }}
          >
            Email marketing
          </div>
          <h2
            className="text-2xl font-bold text-slate-900"
            style={{ fontFamily: 'var(--font-source-serif), "Source Serif 4", Georgia, serif' }}
          >
            Métricas dos envios pós-evento
          </h2>
          <div className="mt-4 bg-white rounded-xl p-6 border border-slate-200 text-sm text-slate-600">
            Em breve — taxa de abertura, clicks e conversão por campanha.
          </div>
        </div>
      </div>
    </div>
  );
}
