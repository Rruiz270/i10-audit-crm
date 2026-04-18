import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role = (session.user as typeof session.user & { role?: string }).role ?? 'consultor';

  return (
    <div className="flex min-h-screen">
      <Sidebar userName={session.user.name} userRole={role} />
      <main className="flex-1 bg-slate-50">{children}</main>
    </div>
  );
}
