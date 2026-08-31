import Link from "next/link";

export const dynamic = "force-dynamic";

// O admin de social (i10-marketing) roda em institutoi10.com.br/marketing com
// banco/Meta/crons próprios. Aqui ele é embarcado dentro do shell do CRM para
// dar a experiência unificada, sem mover o engine de publicação.
const SOCIAL_URL = "https://www.institutoi10.com.br/marketing/admin";

export default function SocialPage() {
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col md:h-[100dvh]">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-5 py-2.5">
        <div>
          <Link href="/marketing" className="text-[11px] text-slate-400 hover:text-slate-600">
            ← Marketing
          </Link>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-i10-cyan-dark">
            Marketing · Social Medias
          </p>
          <p className="text-sm font-medium text-i10-navy">
            Calendário, fila, campanhas e orgânico (Instagram/Facebook)
          </p>
        </div>
        <a
          href={SOCIAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
        >
          Abrir em nova aba ↗
        </a>
      </div>
      <iframe
        src={SOCIAL_URL}
        title="Social Medias — Instituto i10"
        className="w-full flex-1 border-0"
      />
    </div>
  );
}
