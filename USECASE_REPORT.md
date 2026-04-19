# Use Case Test Report — i10-audit-crm

Rodado em 18/04/2026, 21:47:19

**139 ✓ / 0 ✗**  · 139 casos totais

## Essenciais  (5/5)

- ✅ Oportunidade criada com estágio "novo"
- ✅ Leitura devolve os dados inseridos
- ✅ Update grava o novo valor
- ✅ Contato principal criado
- ✅ Atividade registrada

## Principais  (5/5)

- ✅ Formulário público "fundeb" disponível
- ✅ Intake produz 1 submissão + 1 oportunidade + 1 contato primário
- ✅ Avança por contato → diagnóstico → follow-up → reunião
- ✅ Avança para negociação com valor + data preenchidos
- ✅ Marcada como "ganhou" com contrato assinado

## Primários  (4/4)

- ✅ Sem município e sem contato, saída de "novo" é bloqueada
- ✅ Com município e contato, "novo"→"contato_inicial" é liberado
- ✅ Negociação sem valor/data bloqueia "ganhou" com 2 campos faltando
- ✅ Negociação com valor+data libera transição para "ganhou"

## Secundários  (3/3)

- ✅ Reunião agendada
- ✅ Reunião pode ser marcada como concluída com resultado
- ✅ Timeline acumula múltiplas atividades (5)

## Auxiliares  (2/2)

- ✅ Apenas 1 contato principal por oportunidade após troca
- ✅ Contato deletado individualmente

## Exceção  (4/4)

- ✅ Bloqueia handoff quando stage != "ganhou"
- ✅ Bloqueia handoff quando municipality_id é NULL
- ✅ Honeypot retorna { ok: true, silent: true } sem gravar lead
- ✅ Perdido registra lostReason

## Suporte  (3/3)

- ✅ Cleanup remove resíduos de execuções anteriores (untriaged == 1 para a submissão corrente)
- ✅ Leads não triados retornam na fila (1)
- ✅ Dashboard agrega por estágio (3 estágios com testes)

## Contingência  (2/2)

- ✅ Handoff cria consultoria e linka no CRM
- ✅ Handoff re-chamado é detectado como já feito (handed_off_consultoria_id existe)

## Gestão  (3/3)

- ✅ Soma do valor de pipeline é computável (200000)
- ✅ Win/loss counters (3 ganhas / 1 perdidas)
- ✅ Handoffs pendentes listáveis (2)

## Auditoria  (4/4)

- ✅ Timeline da oportunidade principal tem 5 eventos
- ✅ Mudanças de estágio são registradas em crm.activities (4)
- ✅ Ordem cronológica preservada
- ✅ Schema de lead_submissions inclui source_ip / user_agent / submitted_at

## Tarefas  (6/6)

- ✅ Existe pelo menos 1 usuário ativo para assignee
- ✅ Tarefa criada com due_at e assignee
- ✅ Tarefa atrasada detectável via due_at < NOW()
- ✅ Query de overdue retorna exatamente 1 tarefa
- ✅ Task concluída sai da lista de abertas
- ✅ "Minhas tarefas" filtra por assigned_to (1)

## Previsão  (2/2)

- ✅ 2 deals (neg + novo, R$100k cada) → weighted R$ 85.000
- ✅ Deals "ganhou" contribuem 100% no cenário simplificado (mas forecast.ts descarta terminais)

## Estagnação  (4/4)

- ✅ Deal "novo" recém-tocado NÃO está rotten
- ✅ Deal "novo" intocado há 20 dias está rotten
- ✅ Deal "ganhou" nunca apodrece (estágio terminal)
- ✅ Deal em "contato_inicial" parado há 30d está rotten

## Tags  (3/3)

- ✅ Tags gravam como text[]
- ✅ Filtro por tag devolve só oportunidades marcadas (1)
- ✅ DB aceita array bruto; deduplicação fica a cargo do action

## Motivos_perda  (3/3)

- ✅ Múltiplas perdas com código distinto convivem
- ✅ Breakdown /reports agrega por código (2 códigos)
- ✅ "no_budget" aparece 2x no breakdown de teste

## Duplicatas  (2/2)

- ✅ Detecta 4 oportunidade(s) ativa(s) para o mesmo município
- ✅ Terminal não aumenta o contador de duplicatas ativas (4)

## Operações_em_massa  (2/2)

- ✅ 3 oportunidades criadas para o mesmo dono
- ✅ Todas as 3 ops mudaram de dono

## Handshake  (6/6)

- ✅ Consultoria nasce com start_date no futuro (kickoff agendado)
- ✅ end_date calculado a partir de start_date + duração
- ✅ Consultoria "Consultor Kickoff14" (+14d) NÃO aparece na janela "esta semana"
- ✅ Consultoria "Kickoff Soon" (+3d) aparece na janela "esta semana"
- ✅ Kickoff no passado detectável para widget "já ativa" (1)
- ✅ Activity do handoff inclui datas de kickoff e fim no body

## Bncc_signals  (4/4)

- ✅ Relatório inserido aparece na consulta getConsultoriaSignals
- ✅ action_plans aggregation: total=37, done=1, overdue=1
- ✅ Evidence upload reflete em signals
- ✅ "1º relatório entregue" + "plano atrasado" são produzidos

## Dynamic_stages  (5/5)

- ✅ Migração seedou os 8 estágios padrão
- ✅ Stage customizado aparece no listStages (total=9)
- ✅ Inserção de chave duplicada é rejeitada pelo PK
- ✅ Toggle is_active=false remove do listStages
- ✅ Delete de custom stage funciona

## Pwa  (11/11)

- ✅ manifest.webmanifest existe
- ✅ manifest.name é "i10 Audit CRM"
- ✅ manifest.display é "standalone"
- ✅ manifest.theme_color é navy (#0A2463)
- ✅ manifest.icons tem pelo menos 2 ícones (2)
- ✅ manifest.shortcuts tem pelo menos 2 atalhos (3)
- ✅ sw.js existe
- ✅ sw.js NÃO cacheia /api/
- ✅ sw.js suporta notificationclick
- ✅ icon-192.svg existe
- ✅ icon-512.svg existe

## Consultor  (11/11)

- ✅ crm.user_preferences tem colunas esperadas (12)
- ✅ user_preferences inclui notifications + default_pipeline_filter + timezone
- ✅ crm.users tem display_name / phone / signature
- ✅ default_pipeline_filter="mine" grava
- ✅ notify_task_overdue=false grava
- ✅ upsert atualiza default_pipeline_filter de "mine" para "all"
- ✅ ON DELETE CASCADE remove preferências quando user é deletado
- ✅ filtro ownerId=A retorna apenas ops de A
- ✅ filtro ownerId=B retorna apenas ops de B
- ✅ Stats A: 1 ganha / 0 perdida
- ✅ Stats B: 0 ganha / 1 perdida

## Auth  (17/17)

- ✅ users tem password_hash + approval_status
- ✅ bcrypt: hash + compare correto
- ✅ signup cria user com is_active=true, approval_status="pending"
- ✅ Login bloqueado enquanto pending
- ✅ Approval vira "approved"
- ✅ Após aprovação, credentials batem → login autorizado
- ✅ Senha errada continua falhando após aprovação
- ✅ Rejeição: approval_status="rejected", is_active=false
- ✅ User Google-only tem password_hash NULL
- ✅ Seed criou 4 contas de teste
- ✅ 3 das 4 contas estão approved (admin/gestor/consultor)
- ✅ pendente@i10.crm tem approval_status="pending"
- ✅ Todas as 4 contas de teste têm hash bcrypt ($2...)
- ✅ Senha "admin2026" bate para admin@i10.crm
- ✅ Senha "consultor2026" bate para consultor@i10.crm
- ✅ NextAuth expõe provider "credentials"
- ✅ NextAuth expõe provider "google"

## Http_smoke  (28/28)

- ✅ /login = 200
- ✅ /signup = 200
- ✅ /intake/fundeb = 200
- ✅ /manifest.webmanifest = 200
- ✅ /sw.js = 200
- ✅ /icons/icon-192.svg = 200
- ✅ /icons/icon-512.svg = 200
- ✅ / redireciona p/ login (307)
- ✅ /opportunities redireciona p/ login (307)
- ✅ /opportunities/new redireciona p/ login (307)
- ✅ /pipeline redireciona p/ login (307)
- ✅ /tasks redireciona p/ login (307)
- ✅ /meetings redireciona p/ login (307)
- ✅ /contacts redireciona p/ login (307)
- ✅ /leads redireciona p/ login (307)
- ✅ /reports redireciona p/ login (307)
- ✅ /settings/stages redireciona p/ login (307)
- ✅ /settings redireciona p/ login (307)
- ✅ /admin/team redireciona p/ login (307)
- ✅ /admin/health redireciona p/ login (307)
- ✅ /me redireciona p/ login (307)
- ✅ /me/preferences redireciona p/ login (307)
- ✅ manifest.json servido parseia
- ✅ intake/fundeb contém "Fale com a equipe"
- ✅ intake/fundeb contém honeypot <input name="website">
- ✅ intake/fundeb tem campo de município
- ✅ login contém wordmark i10
- ✅ login referencia manifest.webmanifest

---

## Rotas verificadas no dev server (smoke test)

| Rota | Status esperado | Observação |
|---|---|---|
| `/login` | 200 | Página pública |
| `/` | 307 → /login | Protegido |
| `/opportunities` | 307 → /login | Protegido |
| `/opportunities/new` | 307 → /login | Protegido |
| `/pipeline` | 307 → /login | Kanban (DnD) |
| `/meetings` | 307 → /login | Lista |
| `/contacts` | 307 → /login | Lista |
| `/leads` | 307 → /login | Inbox de submissões |
| `/reports` | 307 → /login | Métricas |
| `/intake/fundeb` | 200 | Formulário público renderiza |
| `/intake/does-not-exist` | 404 | Slug inválido devolve 404 |

## Como rodar novamente

```bash
npm run dev         # mantém :3000 servindo
node scripts/test-usecases.mjs
```
