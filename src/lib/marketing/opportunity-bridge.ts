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
  /**
   * Dono fixo da oportunidade. Sem isso o lead cai no balanceamento entre
   * consultores ativos — o que nem sempre se quer: campanhas com atendimento
   * dedicado precisam que tudo caia na mesma pessoa.
   */
  ownerId?: string | null;
};

export type EnsureOpportunityResult =
  | { created: true; opportunityId: number }
  | { created: false; reason: 'already_exists' | 'error'; error?: string }
  /** A cidade já tinha lead nesta origem: o contato foi anexado a ele. */
  | { created: false; reason: 'merged_into_city'; opportunityId: number };

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

    // Dono fixo quando a campanha define um; senão, consultor ativo com menos
    // oportunidades (load-balance simples).
    let ownerId: string | null = null;
    if (input.ownerId) {
      const fixo = await q`
        select id from crm.users where id = ${input.ownerId} and is_active = true limit 1`;
      ownerId = fixo[0]?.id ?? null;
      if (!ownerId) {
        console.error(`[opportunity-bridge] dono fixo ${input.ownerId} não existe ou está inativo`);
      }
    }
    if (!ownerId && !input.ownerId) {
      const owner = await q`
        select id from crm.users
        where role = 'consultor' and is_active = true
        order by (select count(*) from crm.opportunities o where o.owner_id = crm.users.id) asc, id asc
        limit 1`;
      ownerId = owner[0]?.id ?? null;
    }

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

    // Uma câmara tem vários e-mails, e mais de um pode engajar. Nesse caso a
    // cidade NÃO vira um segundo lead: o contato é anexado ao que já existe e a
    // data de entrada avança para agora — a cidade passa a aparecer pela última
    // vez que deu sinal. O recorte é por origem: um lead desta campanha nunca
    // se cola a uma oportunidade de outra, que pode ser de outro consultor.
    if (municipalityId) {
      const daCidade = await q`
        select id from crm.opportunities
        where municipality_id = ${municipalityId} and source = ${input.source}
          and won_at is null and lost_at is null
        order by id limit 1`;
      if (daCidade.length) {
        const opportunityId = daCidade[0].id as number;
        await q`
          insert into crm.contacts (opportunity_id, name, email, phone, role, is_primary)
          values (${opportunityId}, ${input.name ?? email.split('@')[0]}, ${email},
                  ${input.phone ?? null}, 'prefeitura', false)`;
        await q`
          update crm.opportunities
          set lead_entrada_at = NOW(), last_activity_at = NOW(), updated_at = NOW()
          where id = ${opportunityId}`;
        await q`
          insert into crm.activities (opportunity_id, type, subject, body, metadata)
          values (${opportunityId}, ${input.activityType ?? 'marketing'},
                  ${'Outro contato da mesma câmara engajou'},
                  ${`${input.name ?? email} (${email}) engajou na campanha. Anexado a este lead em vez de abrir um novo.`},
                  ${JSON.stringify({ source: input.source, marketingContactId: input.marketingContactId ?? null, merged: true })})`;
        return { created: false, reason: 'merged_into_city', opportunityId };
      }
    }

    // No CRM, 'novo' significa pool SEM dono — quem assume um lead o move para
    // 'contato_inicial' e recebe o nº sequencial. Nascer com dono em 'novo'
    // criava um estado que o fluxo da tela nunca produz: lead com dono parado
    // na coluna do pool, sem número e sem histórico.
    const comDono = Boolean(ownerId);
    const opp = await q`
      insert into crm.opportunities
        (municipality_id, owner_id, stage, stage_updated_at, source, notes, lead_entrada_at)
      values (${municipalityId}, ${ownerId}, ${comDono ? 'contato_inicial' : 'novo'}, NOW(),
              ${input.source}, ${input.notes}, NOW())
      returning id`;
    const opportunityId = opp[0].id as number;

    // Nº sequencial atribuído em UPDATE separado: a subconsulta precisa ser SQL
    // literal (o driver parametriza `${}` como valor, não como expressão), e
    // calculá-la dentro do próprio UPDATE evita a corrida de dois leads
    // simultâneos lerem o mesmo MAX.
    let activeNo: number | null = null;
    if (comDono) {
      const no = await q`
        update crm.opportunities
        set active_no = (select coalesce(max(o2.active_no), 0) + 1 from crm.opportunities o2)
        where id = ${opportunityId} and active_no is null
        returning active_no`;
      activeNo = (no[0]?.active_no as number | undefined) ?? null;
    }

    await q`
      insert into crm.contacts (opportunity_id, name, email, phone, role, is_primary)
      values (${opportunityId}, ${input.name ?? email.split('@')[0]}, ${email},
              ${input.phone ?? null}, 'prefeitura', true)`;

    await q`
      insert into crm.activities (opportunity_id, type, subject, body, metadata)
      values (${opportunityId}, ${input.activityType ?? 'agendamento'}, ${input.activitySubject},
              ${input.activityBody ?? `Lead criado via ${input.source}. E-mail: ${email}`},
              ${JSON.stringify({ source: input.source, marketingContactId: input.marketingContactId ?? null })})`;

    // Mesmo registro de mudança de estágio que a tela grava ao atribuir dono.
    if (comDono) {
      await q`
        insert into crm.activities (opportunity_id, type, subject, body, actor_id, metadata)
        values (${opportunityId}, 'stage_change', 'Novo → Oportunidades',
                ${`Lead nasceu com dono definido${activeNo ? ` (#${String(activeNo).padStart(3, '0')})` : ''}.`},
                ${ownerId},
                ${JSON.stringify({ from: 'novo', to: 'contato_inicial', reason: 'owner_assigned', activeNo })})`;
    }

    return { created: true, opportunityId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[opportunity-bridge] falhou (lead preservado):', error);
    return { created: false, reason: 'error', error };
  }
}
