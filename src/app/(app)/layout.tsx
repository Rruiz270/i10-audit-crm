import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { VoiceAssistant } from '@/components/voice-assistant';
import { MobileNav } from '@/components/mobile-nav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role = (session.user as typeof session.user & { role?: string }).role ?? 'consultor';

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <div className="hidden md:block">
        <Sidebar userName={session.user.name} userRole={role} />
      </div>
      {/* Mobile navigation (top bar + drawer) */}
      <MobileNav userName={session.user.name} userRole={role} />
      <main className="flex-1 bg-slate-50 pt-14 md:pt-0">{children}</main>
      <VoiceAssistant />
    </div>
  );
}
