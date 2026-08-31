# Campanha Impositivas SP — operação

Campanha i10 × APM para os **645 presidentes de Câmara Municipal do estado de SP**,
divulgando o sistema de gestão de emendas parlamentares impositivas.

A diferença para Sorocaba/Marília/PB: **o e-mail sai pelo nosso gateway (Brevo)**,
não pelo da APM. Isso está em `projects.settings.provider = 'brevo'` e no campo
`provider` de cada campanha — o motor honra esse override por campanha
(`send-pipeline.ts`), e as campanhas das réguas herdam o provider do projeto.

## Peças

| | Peça | Canal | Data | Público |
|---|---|---|---|---|
| BASE | E1 · Abertura (TCE aponta impropriedades) | e-mail | 09/09 | 957 e-mails |
| BASE | W1 · WhatsApp abertura | WhatsApp | 10/09 | 390 celulares |
| BASE | E2 · Aula aberta 20 min | e-mail | 14/09 | 957 |
| BASE | E3 · Três instâncias + autodiagnóstico | e-mail | 21/09 | 957 |
| A | A1 · Convite à sessão de 30 min | e-mail | D+1 do engajamento | dinâmico |
| A | A2 · Checklist em 1 página | e-mail | D+4 | dinâmico |
| B | B1 · Duas perguntas diretas | e-mail | 24/09 | frios |
| B | B2 · Emendas que ficam na mesa | e-mail | 01/10 | frios |
| B | B3 · WhatsApp urgência | WhatsApp | 08/10 | frios c/ celular |
| B | B4 · Encerramento do ciclo | e-mail | 15/10 | frios |

Copies em `emails.mjs`. Editar lá e rodar `seed.mjs` de novo atualiza os
templates no CRM (as campanhas já enviadas não são tocadas).

## Como as trilhas funcionam

`/api/marketing/cron/impositivas`, disparado pelo GitHub Actions a cada 15 min:

1. **Trilha A** — quem clicou em e-mail, baixou material, clicou no WhatsApp na
   LP, se inscreveu no formulário ou respondeu no WhatsApp entra na sequência
   `Trilha A · Impositivas SP` (A1 em D+1, A2 três dias depois) e vira
   oportunidade no pipeline (`source = lp_impositivas-sp`).
2. **Trilha B** — passado o corte (`settings.corteTrilhaB`, 23/09), a audiência
   `Câmaras SP — Trilha B (dinâmica)` é reconstruída a cada rodada: recebeu,
   não está na Trilha A, não descadastrou. Quem esquentar sai dela sozinho.
3. **Agendadas** — campanhas em `scheduled` com data vencida são lançadas.

## Ordem de operação

```bash
node scripts/impositivas/build-contacts.mjs      # planilha → contacts.json (PII, não versionar)
node scripts/impositivas/migrate.mjs             # cria marketing.lp_events
node scripts/impositivas/seed.mjs                # projeto, contatos, audiências, templates, campanhas
node scripts/impositivas/submit-wa-templates.mjs # cria e submete os templates à Meta
node scripts/impositivas/submit-wa-templates.mjs --status   # acompanha a aprovação

node scripts/impositivas/test-send.mjs --email voce@... --peca E1
node scripts/impositivas/test-send.mjs --whatsapp +5511... --peca W1

node scripts/impositivas/arm.mjs                 # ver o calendário
node scripts/impositivas/arm.mjs --arm           # COLOCA NO AR (draft → scheduled)
node scripts/impositivas/arm.mjs --disarm        # volta tudo para draft
```

**As campanhas nascem em `draft` de propósito.** Nada dispara até alguém rodar
`--arm`. É o único passo que coloca 957 e-mails na rua.

## Gatilhos (GitHub Actions, não a máquina de ninguém)

- `.github/workflows/marketing-engine.yml` — a cada 5 min: drena a fila,
  avança as réguas e recupera sends órfãos.
- `.github/workflows/impositivas.yml` — a cada 15 min: trilhas + agendadas.

Secrets: `CRM_BASE_URL`, `CRM_CRON_SECRET` (= `CRON_SECRET` do Vercel).

## Antes de mudar SQL nestas rotas

As rotas do cron e do painel montam SQL em template string: o `tsc` passa
limpo mesmo com a query quebrada, e o erro só aparece como 500 em produção.
Já aconteceu — um JOIN passou a usar `contacts.phone` e a CTE não projetava a
coluna. Então, ao mexer na consulta:

1. rode a **query inteira** contra o banco (não só o trecho alterado);
2. confira que o recorte de `membros` é o mesmo nas duas rotas — audiências
   `ZZ %` ficam de fora nas duas, senão contato de teste vira oportunidade;
3. depois do deploy, `curl` nas duas rotas esperando 200.

Outras armadilhas já pagas: crase dentro de comentário SQL encerra o template
literal do JS; e `SELECT * FROM unnest(a, b, …)` sem alias colapsa as colunas
no driver Neon — use `AS t(col1, col2, …)`.

## Painel

`institutoi10.com.br/impositivashub` — protegido por chave
(`IMPOSITIVAS_HUB_KEY` no Vercel). Lê `/api/marketing/public/impositivas-hub`.

## Rastreamento

O `?t=<tracking_token>` que viaja nos links do e-mail é o que amarra visita,
download, clique no WhatsApp e inscrição ao contato certo. A LP registra em
`marketing.lp_events` via `/api/marketing/public/lp-event`; o formulário vai
para `/api/marketing/webhooks/form`, que cria contato, tag, consentimento
(LGPD), oportunidade e matrícula na régua quente.
