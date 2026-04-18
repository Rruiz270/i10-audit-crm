import type { opportunities } from './schema';
import type { InferSelectModel } from 'drizzle-orm';

type Opportunity = InferSelectModel<typeof opportunities>;

export type ConsultoriaPayload = {
  municipalityId: number;
  status: 'active';
  consultantName: string;
  startDate: Date;
  notes: string;
  annotations: string;
};

// ─────────────────────────────────────────────────────────────────────────
// YOUR CONTRIBUTION — define exactly what transfers from a Won Opportunity
// to a new Consultoria record in the BNCC-CAPTACAO system.
//
// Called inside a DB transaction when an opportunity moves to stage='ganhou'.
// The returned object is the INSERT payload for fundeb.consultorias.
//
// Things to decide:
//   1. Do we paste CRM notes into consultoria.annotations? (context for i10 consultor)
//   2. What consultant name goes in? The CRM opportunity owner, or left blank?
//   3. Should "contract pending" be communicated via notes, or via a new field?
//   4. What about contacts — do we seed consultoria with primary contact info?
//      (BNCC-CAPTACAO doesn't currently have a consultoria.contacts table;
//      could be appended to `annotations` as text for now.)
// ─────────────────────────────────────────────────────────────────────────
export function buildConsultoriaPayload(
  op: Opportunity,
  ownerName: string | null,
  primaryContactSummary: string,
): ConsultoriaPayload {
  if (!op.municipalityId) {
    throw new Error('Não é possível criar consultoria sem municipalityId');
  }

  // TODO(raphael): refine what context travels to the consultoria.
  const contractLine = op.contractSigned
    ? 'Contrato: ASSINADO.'
    : `Contrato: PENDENTE. ${op.contractNotes ?? ''}`.trim();

  const annotationParts = [
    '--- Origem: i10 CRM ---',
    `Opportunity #${op.id}`,
    contractLine,
    primaryContactSummary,
    op.notes ? `Notas da venda:\n${op.notes}` : '',
  ].filter(Boolean);

  return {
    municipalityId: op.municipalityId,
    status: 'active',
    consultantName: ownerName ?? '',
    startDate: new Date(),
    notes: op.notes ?? '',
    annotations: annotationParts.join('\n\n'),
  };
}
