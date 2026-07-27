'use server';

import { redirect } from 'next/navigation';
import { acceptProposalPublic } from '@/lib/proposal-public';

// Aceite digital da proposta pública — SEM requireUser: quem autoriza é o
// token (capability URL) validado dentro de acceptProposalPublic. Toda a
// lógica (contractSigned, Ganhou, handoff) vive em src/lib/proposal-public.ts.

export async function acceptProposalAction(formData: FormData): Promise<void> {
  const proposalId = Number(formData.get('proposalId'));
  const token = String(formData.get('token') ?? '');
  const name = String(formData.get('acceptedByName') ?? '');
  const role = String(formData.get('acceptedByRole') ?? '').trim() || null;

  const back = `/proposta/${proposalId}?t=${encodeURIComponent(token)}`;
  const result = await acceptProposalPublic(proposalId, token, name, role);
  if (!result.ok) {
    redirect(`${back}&erro=${encodeURIComponent(result.error)}`);
  }
  redirect(`${back}&aceite=ok`);
}
