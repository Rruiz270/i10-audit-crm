import { getAtendeInbox } from '@/lib/actions/marketing/conversations';
import { InboxClient } from '@/components/atende/inbox-client';
import { InboxRealtime } from '@/components/inbox-realtime';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'i10 · Atendimento' };

export default async function AtendePage() {
  const data = await getAtendeInbox();
  return (
    <>
      <InboxRealtime />
      <InboxClient data={data} />
    </>
  );
}
