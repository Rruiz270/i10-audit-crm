import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import './atende.css';

// Layout do app de Atendimento (/atende). Sem sidebar do CRM — é uma
// experiência full-screen mobile (o atendente usa no celular). Só exige login;
// a separação do que cada um vê é feita nas queries (F3 visibilidade).
export default async function AtendeLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <div className="atd">{children}</div>;
}
