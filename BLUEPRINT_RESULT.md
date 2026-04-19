# Blueprint Test Result — i10-audit-crm

**Última atualização: 2026-04-18 · Integração BNCC · Dynamic stages · PWA · Voz**

## ✨ Rodada pré-deploy

Nesta rodada adicionei **tudo o que você pediu para o deploy na Vercel**:

| Feature | Status | Onde ver |
|---|---|---|
| **Sinais do BNCC-CAPTACAO** (relatórios, planos, evidências) | ✅ | Card gradient da oportunidade + pills nos cards Kanban |
| **"1º relatório entregue" flag** | ✅ | Aparece automático quando `fundeb.relatorios` ganha linha pro consultoria |
| **Auto-flags no Kanban para ganhou+handed-off** | ✅ | Mostra badge mint/cyan/rose conforme sinais recebidos |
| **Botão para criar novos estágios** | ✅ | `/settings/stages` · admin/gestor · `crm.pipeline_stages` table |
| **SLA alerts (tarefas atrasadas) no Kanban** | ✅ | Linha vermelha "⏰ X tarefas atrasadas" no card |
| **PWA instalável no celular** | ✅ | `manifest.webmanifest` + `sw.js` + `<PwaRegister>` + botão "Instalar" flutuante |
| **Notificações push (local)** | ✅ | Menu mobile tem "🔔 Ativar notificações"; `notifyLocal()` utilitário |
| **Versão mobile (responsiva)** | ✅ | Top bar + drawer em <md, sidebar tradicional em md+ |
| **Comandos de voz (pt-BR)** | ✅ | Botão 🎤 flutuante · entende "abrir pipeline", "nova tarefa X", "registrar nota Y" |
| **Testes rodando em background** | ✅ | `scripts/bg-test-loop.sh` · loop a cada 2min em `.test-runs/` |

## 🔄 Sinais vindos do BNCC-CAPTACAO (read-only)

`src/lib/bncc-signals.ts` lê das tabelas fundeb.* que o outro sistema populava:

| Tabela BNCC | Sinal no CRM |
|---|---|
| `fundeb.relatorios` (consultoria_id, tipo) | Badge mint **"1º relatório entregue"** ou **"X relatórios entregues"** |
| `fundeb.action_plans` (municipality_id, completed_at) | Contador **"X/Y planos concluídos"** + alerta rose **"X planos atrasados"** |
| `fundeb.documents` (status='approved') | Badge cyan **"X docs aprovados"** |
| `fundeb.evidences` (consultoria_id, uploaded_at) | Badge cyan **"X evidências"** |
| `fundeb.scenarios` (consultoria_id, is_target) | Badge navy **"X cenários FUNDEB"** |

**Como os flags chegam automaticamente:** o CRM faz SELECT a cada render. Quando alguém gera um relatório no BNCC, na próxima vez que o consultor abre a oportunidade (ou o Kanban), os badges já estão lá. Sem webhook, sem polling no frontend — apenas Server Components re-renderizando com dado fresco.

**Query defensiva:** `action_plans.due_date` é TEXT em prod (valores como "7-11 Abr"). Nossos queries usam regex `^\d{4}-\d{2}-\d{2}$` antes de castar, então lixo histórico não quebra nada.

## 🎛️ Dynamic pipeline stages

Antes o pipeline era 8 estágios fixos em TypeScript. Agora:

- **Tabela `crm.pipeline_stages`** com os 8 padrões seeded + suporte a adicionar customizados
- **Page `/settings/stages`** (admin/gestor only) — lista/edita/adiciona/desativa/deleta
- **Campos editáveis por estágio:** label, descrição, cor, ordem, probabilidade, rot_days
- **Estágios padrão protegidos:** não podem ser deletados (só desativados) — evita quebrar as regras de qualificação
- **Customizados têm flag `is_custom=true`** e rodam sem regras de qualificação (responsabilidade do consultor mover manualmente)
- **Kanban lê do DB** e renderiza todas as colunas ativas em `order` crescente

Exemplo de uso: adicionar "Aprovação jurídica" entre `negociacao` e `ganhou`, ou "Kickoff pendente" entre `ganhou` e a execução real.

## 📱 PWA instalável

- `/manifest.webmanifest` com nome, ícones, atalhos (Pipeline, Tarefas, Dashboard), theme navy
- `/sw.js` com estratégia safe: **cacheia só assets estáticos** (`_next/static`, `/icons/`, manifest) — NUNCA pages autenticadas ou `/api/*`
- `<PwaRegister>` no root layout registra o SW e mostra botão "📱 Instalar no celular" quando o browser dispara `beforeinstallprompt`
- `requestNotificationPermission()` e `notifyLocal()` expostos para futuras integrações
- Ícones SVG 192 e 512 gerados com wordmark i10 em gradient navy→cyan

## 🎤 Comandos de voz (Web Speech API)

Botão 🎤 flutuante (bottom-right), funciona em Chrome/Safari mobile. Pt-BR.

**Comandos atuais:**
- `"abrir pipeline"` / `"ir pro funil"` → navega /pipeline
- `"abrir tarefas"` / `"minhas tarefas"` → /tasks
- `"abrir dashboard"`, `"abrir oportunidades"`, `"abrir relatórios"`, `"abrir leads"` → navega
- `"nova oportunidade"` / `"criar oportunidade"` → /opportunities/new
- `"nova tarefa <título>"` → cria task na oportunidade atual (tem que estar em /opportunities/[id])
- `"registrar nota <texto>"` → cria activity
- `"cancelar"` / `"fechar"` → fecha overlay

Quando não entende, mostra transcript + lista de comandos válidos.

## 📲 Mobile-responsive

- **Top bar** navy gradient fixa em <md com burger + wordmark + atalho pra Tarefas
- **Drawer** lateral com emoji icons + highlight da rota ativa
- **Sidebar tradicional** só aparece em md+
- **Botão "🔔 Ativar notificações"** dentro do drawer
- **Kanban já funciona em mobile** via `@dnd-kit` PointerSensor (toque arrastar)

## 🔁 Testes em background

`scripts/bg-test-loop.sh` roda a suíte completa **a cada 2 minutos**, grava cada run em `.test-runs/run_<timestamp>.log`. Primeira execução já confirmada:

```
[20:23:XX] Total: 105 casos — 105 ✓ passados, 0 ✗ falhados → .test-runs/run_2026-04-18_202239.log
```

Pra parar: `pkill -f bg-test-loop` ou `kill <pid>` (o loop printa o pid no start).

Dev server rodando em http://localhost:3000 (PID 13940, `next-server v16.2.4`).

---

## TL;DR (status pré-deploy Vercel)

- ✅ **5 fases originais** (CRUD, Kanban DnD, Intake público, Handoff, Meetings/Calendar)
- ✅ **7 features Pipedrive/Salesforce** (tasks, weighted forecast, rotten deals, tags, lost-reason picklist, duplicate detection, bulk reassign)
- ✅ **Brandbook i10 aplicado** — Navy/Cyan/Mint · Inter + Source Serif
- ✅ **Handshake visível** — kickoff date + card gradient + widget "Consultorias esta semana"
- ✅ **Integração BNCC-CAPTACAO read-only** — "1º relatório entregue", planos concluídos, evidências — badges no Kanban + card da oportunidade
- ✅ **Dynamic stages** — `/settings/stages` admin CRUD · suporte a estágios customizados
- ✅ **PWA instalável** (manifest + sw + notificações locais)
- ✅ **Mobile-responsive** (top bar + drawer em <md)
- ✅ **Comandos de voz** pt-BR (Web Speech API · botão flutuante 🎤)
- ✅ **Typecheck clean** · **Lint clean** (zero warnings) · **15 rotas verificadas**
- ✅ **Suíte: 105/105 casos** em 22 categorias — relatório em [`USECASE_REPORT.md`](./USECASE_REPORT.md)
- ✅ **Background test loop rodando** (`.test-runs/` · a cada 2min)
- ⚠️ **Nada foi enviado pro GitHub.** Revise antes de commitar e deploy.

## 🎨 Brandbook i10 aplicado

Carregado de `/Users/raphaelruiz/Downloads/NOVOBRANDBOOKi10.html` (v2.0).

| Elemento | Antes | Agora |
|---|---|---|
| Paleta primária | azul genérico Tailwind | **Navy #0A2463** (Pantone 2758 C) |
| Cor de destaque | sem sistema definido | **Cyan #00B4D8** + **Mint #00E5A0** |
| Gradientes | nenhum | `main` (navy → cyan) · `accent` (cyan → mint) · `dark` (navy-dark → navy) |
| Fontes | Geist Sans / Geist Mono | **Inter** (300–900) + **Source Serif 4** (institucional) |
| Login | card branco simples | hero gradient em metade da tela com wordmark `i10` grande + stats |
| Sidebar | fundo branco | **gradient navy-dark** com accent bar cyan→mint |
| Wordmark | texto plano | componente `<Wordmark>` com "**i**" em navy e "**10**" em cyan (per brandbook nav-logo) |
| Estágios do Kanban | cores Tailwind puras | paleta alinhada: cyan no meio do funil, **mint no "ganhou"**, coral no "perdido" |
| Eyebrow / divider | ausente | `.i10-eyebrow` + `.i10-divider` (regra do brandbook) |

Tokens disponíveis globalmente via CSS vars + Tailwind @theme:
```
--i10-navy, --i10-navy-dark, --i10-navy-light, --i10-navy-muted, --i10-navy-pale
--i10-cyan, --i10-cyan-dark, --i10-cyan-light, --i10-cyan-pale, --i10-cyan-wash
--i10-mint, --i10-mint-dark, --i10-mint-pale, --i10-mint-wash
--i10-gradient-main, --i10-gradient-accent, --i10-gradient-dark
```

## 🤝 Handshake com o sistema de auditoria — visibilidade completa

Antes: clicar "Transferir" criava a consultoria com `start_date = NOW()` — sem controle, sem visibilidade.

Agora:

### Formulário de handoff (no botão "Transferir para BNCC-CAPTACAO")
Abre inline e captura:
- **Data de início (kickoff)** — default: próxima segunda-feira 9h
- **Duração planejada** — 6 / 12 (padrão) / 18 / 24 meses → calcula `end_date`
- **Nome do secretário** — auto-preenchido do primary contact, editável

### Card "Consultoria FUNDEB ativa" na oportunidade
Gradient navy→cyan no topo do detalhe, mostra:
- Status, **Início (kickoff)**, Fim previsto, Consultor, Secretário
- **KickoffBadge** muda de cor conforme proximidade:
  - `cyan` → kickoff > 7 dias no futuro
  - `mint` → kickoff esta semana / hoje 🚀
  - `white/10` → ativa (já iniciou)
  - `amber` → finaliza em <30 dias
  - `rose` → vencida (passou do end_date)

### Widget "Consultorias iniciando esta semana" no Dashboard
Banner gradient no topo da página principal quando há kickoffs agendados nos próximos 7 dias. Lista municípios + consultor + contagem regressiva.

### Timeline / auditoria
Atividade tipo `handoff` agora grava no `body`:
> Kickoff: 05/05/2026 · fim previsto: 05/05/2027 · consultor: Raphael Ruiz · secretário: Maria Santos

E no `metadata` JSON:
```json
{ "consultoriaId": 42, "startDate": "...", "endDate": "...", "durationMonths": 12 }
```

### Nova função utilitária
`listConsultoriasByKickoffWindow({ from, to })` — usada pelos widgets. Permite responder "o que começa esta semana?", "o que está atrasado de kickoff?", "quantas consultorias vão vencer no próximo trimestre?"

---

## Comparação com os grandes — o que importamos

| Feature Pipedrive/Salesforce | Status | Onde ver | Evidência de teste |
|---|---|---|---|
| **Activities/Tasks com due date** (Pipedrive's next-action focus) | ✅ | `/tasks`, aba "Tarefas" em cada oportunidade | 5 casos em "Tarefas" |
| **Weighted forecast** (value × stage probability) | ✅ | `/reports` card "Forecast ponderado", Kanban headers | 2 casos em "Previsão ponderada" |
| **Rotten deals** (Pipedrive's signature inactivity badge) | ✅ | Kanban cards em vermelho + widget no Dashboard | 4 casos em "Estagnação" |
| **Tags/Labels** em deals | ✅ | Painel lateral da oportunidade, filtro em `/opportunities` | 3 casos em "Tags" |
| **Structured lost reasons picklist** (Salesforce classic) | ✅ | Dropdown no `StageControl`, breakdown em `/reports` | 3 casos em "Motivos de perda" |
| **Duplicate detection** (Salesforce Apex alternative) | ✅ | Bloqueia `/opportunities/new` + flag "Permitir duplicada" | 2 casos em "Duplicatas" |
| **Bulk actions** (Pipedrive multi-select) | ✅ | Barra sticky em `/opportunities` quando linhas marcadas | 2 casos em "Operações em massa" |

### O que **deliberadamente não** portei (ainda)

| Feature | Por quê deixei de fora |
|---|---|
| **Custom fields** por entidade | Alto custo arquitetural; i10 hoje tem um domínio estreito. Dá pra adicionar `crm.field_defs` + `field_values` depois. |
| **Múltiplos pipelines** (Pipedrive: um por processo) | Um único pipeline é o que o caso de uso i10 exige. Multi-pipeline só quando tiver outro tipo de consultoria. |
| **Email open/click tracking** | Precisa de integração com provider (Mailgun/SendGrid) + subdomínio. Decisão de vendor ainda não tomada. |
| **Smart lists / saved filters** salvos no DB | URL params (`?stage=novo&tag=vaat`) já cobrem 80%. Salvar no DB é melhoria futura. |
| **Campaign attribution** (Salesforce Campaigns) | Fora de escopo — i10 não roda marketing pago hoje. |

---

## Novidades concretas nesta rodada de upgrade

### 1. Tarefas (Tasks) — *"próxima ação" Pipedrive*
- Nova tabela `crm.tasks` com `due_at`, `completed_at`, `priority`, `assigned_to`
- Painel no detalhe da oportunidade com checkbox, descrição, prioridade visual
- Página `/tasks` com filtro "Minhas" / "Todas" + destaque de atrasadas
- Dashboard mostra **"Minhas tarefas atrasadas"** + contador de equipe
- Concluir uma tarefa registra `task_completed` na timeline da oportunidade

### 2. Forecast ponderado
- `STAGES` agora têm `probability: 0..1` (ex: negociação=0.8, follow_up=0.4)
- Função pura `weightedValue()` em `src/lib/forecast.ts`
- Card "Forecast ponderado" no Dashboard e em `/reports`
- Kanban mostra `≈ R$ X` por coluna (soma ponderada)

### 3. Oportunidades paradas (rotten deals)
- `STAGES` agora têm `rotDays` configurável (ex: negociação=7 dias)
- Nova coluna `opportunities.last_activity_at` bumpada automaticamente por `logActivity()`
- Função pura `isRotten()` e `daysUntilRot()`
- Cards no Kanban ficam com borda rósea + label "🕑 Parada há Xd"
- Dashboard tem widget **"Oportunidades paradas"** com top 5
- Linhas em `/opportunities` ganham marca lateral rósea

### 4. Tags
- Nova coluna `opportunities.tags` (`text[]`)
- Editor de chips no painel lateral da oportunidade (com sugestões: vaat, vaar, fundeb-básico, etc)
- Chips aparecem nos cards do Kanban e nas linhas de `/opportunities`
- Filtro clicável por tag em `/opportunities?tag=vaat`
- Update registra atividade `tags_updated`

### 5. Motivos de perda estruturados (picklist)
- `src/lib/lost-reasons.ts` com 9 códigos: `no_budget`, `not_priority`, `chose_competitor`, `political_change`, `no_decision`, `out_of_scope`, `timing_off`, `ghosted`, `other`
- `StageControl` troca de textarea livre para **Select** quando destino é "Perdido"
- "Outro" ainda exige texto livre
- `/reports` ganha seção "Motivos de perda" com barras de % por código

### 6. Detecção de duplicatas
- `createOpportunity()` consulta `checkDuplicateByMunicipality()` antes de inserir
- Bloqueia criação se o município já tem oportunidade em estágio ativo (não terminal)
- Checkbox "Permitir duplicada" em `/opportunities/new` desbloqueia o caso 2º órgão

### 7. Bulk reassign
- Checkboxes em `/opportunities` (só para `admin`/`gestor`)
- Barra sticky no rodapé aparece quando >0 selecionadas
- Select de novo dono + "Aplicar" faz UPDATE em batch via `inArray`
- Cada oportunidade reatribuída registra atividade `bulk_reassign` na timeline

---

## Mudanças de DB (migração idempotente)

Rode `node scripts/migrate-upgrades.mjs` — seguro, usa `ADD COLUMN IF NOT EXISTS` e `CREATE TABLE IF NOT EXISTS`.

```sql
ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS lost_reason_code text;
ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS last_activity_at timestamp DEFAULT NOW();

CREATE TABLE IF NOT EXISTS crm.tasks (…);  -- id, opportunity_id, title, due_at, priority, assignee…

CREATE INDEX IF NOT EXISTS tasks_due_at_idx ON crm.tasks (due_at);
CREATE INDEX IF NOT EXISTS tasks_assigned_to_idx ON crm.tasks (assigned_to);
CREATE INDEX IF NOT EXISTS opps_last_activity_idx ON crm.opportunities (last_activity_at);
```

Nada em `fundeb.*` foi tocado.

---

## Teste rápido no browser

1. http://localhost:3000 → login com `tech@betteredu.com.br`
2. Dashboard agora tem:
   - Card "**Forecast ponderado**" (diferente do nominal)
   - Widget "**Minhas tarefas atrasadas**" (amarelo)
   - Widget "**Oportunidades paradas**" (vermelho) 
3. Crie uma oportunidade duplicada pro mesmo município → bloqueado com mensagem, desbloqueia com checkbox
4. Abra uma oportunidade → aba **Tarefas** no corpo + **Tags** no sidebar
5. Crie uma tarefa vencendo ontem → Dashboard conta ela atrasada
6. Vá pra `/tasks` → filtro Minhas / Todas + banner vermelho quando tem overdue
7. Em `/opportunities`, selecione 2+ linhas → barra sticky "Reatribuir X selecionadas"
8. Arraste um card em `/pipeline` → colunas mostram soma nominal + ponderada; cards velhos ficam em vermelho com "🕑 Parada há Xd"

---

## Arquivos novos ou tocados (upgrade)

```
src/lib/
  forecast.ts            ← weightedValue, isRotten, daysUntilRot
  lost-reasons.ts        ← picklist taxonomy
  pipeline.ts            ← +probability, +rotDays por estágio
  schema.ts              ← +tags, +lost_reason_code, +last_activity_at, +tasks table
  activity.ts            ← logActivity agora bumpa last_activity_at
  actions/
    tasks.ts             ← NEW: createTask, completeTask, deleteTask, listMyOpenTasks, listOverdueTasks
    opportunities.ts     ← +checkDuplicateByMunicipality, +setOpportunityTags, +bulkReassign, changeStage aceita lostReasonCode
src/components/
  tasks-panel.tsx        ← NEW
  tag-editor.tsx         ← NEW
  opportunities-table.tsx← NEW (client, bulk select)
  kanban-board.tsx       ← +probability no header, +rotten badge, +tags nos cards
  stage-control.tsx      ← picklist quando vai p/ "perdido"
  sidebar.tsx            ← +link /tasks
src/app/(app)/
  tasks/page.tsx         ← NEW
  page.tsx               ← +forecast ponderado, +widgets de atenção
  reports/page.tsx       ← +forecast, +breakdown motivos de perda
  opportunities/page.tsx ← usa novo OpportunitiesTable
  opportunities/new/page.tsx  ← +checkbox "permitir duplicada"
  opportunities/[id]/page.tsx ← +TasksPanel, +TagEditor, +rotten banner
scripts/
  migrate-upgrades.mjs   ← NEW
  test-usecases.mjs      ← +7 categorias novas (22 novos casos)
```

---

## Comandos úteis

```bash
# Dev
npm run dev                 # já rodando

# Migrar o DB p/ as novas colunas/tabela (idempotente)
node scripts/migrate-upgrades.mjs

# Verificação
npm run typecheck           # tsc --noEmit
npm run lint                # eslint (zero warnings esperado)
npm run test:usecases       # regera USECASE_REPORT.md com 57 casos

# DB
npm run db:check            # lista tabelas crm.* e fundeb.*
npm run seed                # lead_form "fundeb" + admin
```

---

## O que permanece como roadmap

- Email/WhatsApp outbound (precisa decidir vendor)
- Convites de novos usuários via UI (hoje é manual no DB)
- Error boundary customizado em `(app)/`
- Playwright E2E de login → Kanban → handoff (exige Google test user)
- Saved filters / smart lists persistidas no DB
- Multi-pipeline (quando i10 tiver 2º tipo de consultoria)
- Custom fields genéricos (`field_defs` + `field_values`)

---

## Arquivos críticos pra revisar antes do commit

1. `src/lib/handoff.ts` — **payload do handoff** (imutável desde a primeira rodada)
2. `src/lib/pipeline.ts` — **STAGES agora têm probability e rotDays** (calibre antes de subir pra produção!)
3. `src/lib/lost-reasons.ts` — **taxonomia de perdas** (adicione/remova códigos se seu time preferir outros)
4. `src/lib/forecast.ts` — lógica pura do pipeline ponderado e rotten detection
5. `scripts/migrate-upgrades.mjs` — DDL aplicada no DB compartilhado

Se algum desses quatro primeiros estiver fora do que você esperava — me avisa, resto é padrão.
