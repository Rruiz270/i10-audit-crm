import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import './atende.css';

// Manifest PWA PRÓPRIO do atendimento: instalado a partir de /atende, o ícone
// abre em start_url = /atende (não na Dashboard do CRM). Sobrescreve o manifest
// global só para estas rotas. Título do web-app no iOS = "i10 Atende".
export const metadata: Metadata = {
  title: 'i10 · Atendimento',
  manifest: '/atende.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'i10 Atende',
    statusBarStyle: 'default',
  },
};

// Layout do app de Atendimento (/atende). Sem sidebar do CRM — é uma
// experiência full-screen mobile (o atendente usa no celular). Só exige login;
// a separação do que cada um vê é feita nas queries (F3 visibilidade).
export default async function AtendeLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <div className="atd">{children}</div>;
}
