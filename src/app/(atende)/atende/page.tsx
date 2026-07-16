import { getAtendeInbox } from '@/lib/actions/marketing/conversations';
import { InboxClient } from '@/components/atende/inbox-client';
import { InboxAutoRefresh } from '@/components/inbox-auto-refresh';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'i10 · Atendimento' };

export default async function AtendePage() {
  const data = await getAtendeInbox();
  return (
    <>
      <InboxAutoRefresh intervalMs={8000} />
      <InboxClient data={data} />
    </>
  );
}
