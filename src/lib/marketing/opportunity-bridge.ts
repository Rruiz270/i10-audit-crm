// ─── Ponte marketing → pipeline ────────────────────────────────────────────
// Cria a oportunidade no CRM a partir de um contato de marketing (formulário
// da LP, clique qualificado, conversa no WhatsApp). Idempotente por
// (e-mail, source) e sempre defensiva: falhar aqui não pode derrubar a captura
// do lead — quem chama trata o retorno, nunca a exceção.

export type EnsureOpportunityInput = {
  email: string;
  name?: string | null;
  phone?: string | null;
  ibge?: string | null;
  municipio?: string | null;
  /** Origem no pipeline. Ex.: `lp_impositivas-sp`. É a chave de idempotência. */
  source: string;
  notes: string;
  activityType?: string;
  activitySubject: string;
  activityBody?: string;
  marketingContactId?: number | null;
};

export type EnsureOpportunityResult =
  | { created: true; opportunityId: number }
  | { created: false; reason: 'already_exists' | 'error'; error?: string };

export async function ensureOpportunity(
  input: EnsureOpportunityInput,
): Promise<EnsureOpportunityResult> {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const q = neon(process.env.DATABASE_URL!);
    const email = input.email.trim().toLowerCase();

    const existing = await q`
      select 1 from crm.contacts cc
      join crm.opportunities oo on oo.id = cc.opportunity_id
      where lower(cc.email) = ${email} and oo.source = ${input.source} limit 1`;
    if (existing.length > 0) return { created: false, reason: 'already_exists' };

    // Consultor ativo com menos oportunidades (load-balance simples)
    const owner = await q`
      select id from crm.users
      where role = 'consultor' and is_active = true
      order by (select count(*) from crm.opportunities o where o.owner_id = crm.users.id) asc, id asc
      limit 1`;
    const ownerId = owner[0]?.id ?? null;

    let municipalityId: number | null = null;
    if (input.ibge) {
      try {
        const muni = await q`
          select id from fundeb.municipalities where codigo_ibge::text = ${String(input.ibge)} limit 1`;
        municipalityId = muni[0]?.id ?? null;
      } catch {
        municipalityId = null;
      }
    }

    const opp = await q`
      insert into crm.opportunities (municipality_id, owner_id, stage, source, notes)
      values (${municipalityId}, ${ownerId}, 'novo', ${input.source}, ${input.notes})
      returning id`;
    const opportunityId = opp[0].id as number;

    await q`
      insert into crm.contacts (opportunity_id, name, email, phone, role, is_primary)
      values (${opportunityId}, ${input.name ?? email.split('@')[0]}, ${email},
              ${input.phone ?? null}, 'prefeitura', true)`;

    await q`
      insert into crm.activities (opportunity_id, type, subject, body, metadata)
      values (${opportunityId}, ${input.activityType ?? 'agendamento'}, ${input.activitySubject},
              ${input.activityBody ?? `Lead criado via ${input.source}. E-mail: ${email}`},
              ${JSON.stringify({ source: input.source, marketingContactId: input.marketingContactId ?? null })})`;

    return { created: true, opportunityId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[opportunity-bridge] falhou (lead preservado):', error);
    return { created: false, reason: 'error', error };
  }
}
