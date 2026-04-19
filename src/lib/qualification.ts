import { STAGES_BY_KEY, type StageKey } from './pipeline';

export type OpportunitySnapshot = {
  stage: StageKey;
  municipalityId: number | null;
  estimatedValue: number | null;
  closeDate: Date | null;
  primaryContactId: number | null;
};

export type QualificationResult =
  | { ok: true }
  | { ok: false; missing: string[]; reason: string };

// ─────────────────────────────────────────────────────────────────────────
// YOUR CONTRIBUTION — implement the stage-exit rules.
//
// This function gates stage transitions. Before moving an opportunity from
// `fromStage` to `toStage`, we call this. If it returns { ok: false }, the
// UI shows a toast listing what's missing instead of moving the card.
//
// Default contract: use the `requiredFieldsToExit` array from pipeline.ts
// as the baseline. Add custom per-stage logic here if needed.
//
// Example additions you might want:
//   - Before 'diagnostico_enviado' → must have an activity of type='diagnostic_sent'
//   - Before 'ganhou' → must have at least one 'reuniao_auditoria' meeting marked completed
//   - Before 'perdido' → must have lostReason text (enforced elsewhere on submit)
// ─────────────────────────────────────────────────────────────────────────
export function canAdvance(
  op: OpportunitySnapshot,
  // `toStage` is part of the public signature so callers can extend this with
  // per-transition guards (e.g. require a meeting before reaching 'ganhou').
  // Today we only check the exit rules of the current stage, hence the prefix.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  toStage: StageKey,
): QualificationResult {
  const required = STAGES_BY_KEY[op.stage].requiredFieldsToExit;
  const missing: string[] = [];

  // TODO(raphael): tweak these checks to match your qualification policy.
  for (const field of required) {
    if (field === 'municipalityAssigned' && !op.municipalityId) {
      missing.push('Município vinculado');
    }
    if (field === 'primaryContact' && !op.primaryContactId) {
      missing.push('Contato principal (Prefeito/Secretário)');
    }
    if (field === 'estimatedValue' && op.estimatedValue == null) {
      missing.push('Valor estimado');
    }
    if (field === 'closeDate' && !op.closeDate) {
      missing.push('Data prevista de fechamento');
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      reason: `Preencha para avançar de ${STAGES_BY_KEY[op.stage].label}`,
    };
  }

  return { ok: true };
}
