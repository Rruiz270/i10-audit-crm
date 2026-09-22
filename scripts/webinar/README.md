# Webinar Impositivas — operação

Webinar gratuito para Câmaras Municipais de SP sobre gestão das emendas
parlamentares impositivas. **Terça, 29/09/2026, 9h às 10h (Brasília).**

Sala: `https://meet.google.com/guw-wkpy-nrt` (organizador @i10.org.br).

A base é a **mesma** da campanha Impositivas SP — 957 e-mails e 390 celulares
de 645 municípios, já limpos e com IBGE. O webinar **não cria contato nenhum**:
só audiências novas sobre os mesmos contatos.

## As duas trilhas

O ponto inteiro da automação é o **corte entre quem se inscreveu e quem não
se inscreveu**. Sem ele acontece o erro clássico: mandar "inscreva-se" na
quinta para quem se inscreveu na terça.

- **W-IN** — entra no instante em que o formulário é enviado. O webhook grava
  a tag `webinar:inscrito` na mesma transação que cria contato, consentimento
  e oportunidade; não depende do cron para existir.
- **W-OUT** — audiência dinâmica: recebeu alguma peça da campanha **e** não
  tem a tag **e** não está suprimido **e** não está na audiência de teste.
  Reconstruída a cada rodada, então a pessoa sai da trilha fria sozinha.

Depois do evento a W-IN se divide em **presentes** e **ausentes**, a partir do
relatório de presença do Meet (`attributes.webinar_presente`).

## Peças

| | Peça | Canal | Quando (BRT) | Público |
|---|---|---|---|---|
| 1 | E1 · Convite | e-mail | 23/09 09h | base sem VIP (812) |
| 2 | E0 · Convite VIP | e-mail | 23/09 10h | já levantou a mão (130) |
| 3 | W1 · Convite | WhatsApp | 24/09 10h | 384 celulares |
| 4 | E2 · Conteúdo | e-mail | 25/09 09h | W-OUT |
| 5 | E3 · Véspera | e-mail | 28/09 09h | W-IN |
| 6 | W2 · Reforço | WhatsApp | 28/09 10h | W-OUT c/ celular |
| 7 | W3 · Véspera | WhatsApp | 28/09 16h | W-IN |
| 8 | E4 · Dia | e-mail | 29/09 08h | W-IN |
| 9 | W4 · Dia | WhatsApp | 29/09 08h15 | W-IN |
| 10 | E5 · Gravação + demo | e-mail | 29/09 14h | presentes |
| 11 | W5 · Gravação | WhatsApp | 29/09 14h10 | presentes |
| 12 | W5b · Gravação | WhatsApp | 29/09 14h20 | ausentes |
| 13 | E6 · Não compareceu | e-mail | 30/09 09h | ausentes |
| 14 | E7 · Gravação | e-mail | 30/09 10h | W-OUT |
| 15 | W6 · Encerramento | WhatsApp | 02/10 15h | W-OUT c/ celular |

Mais a **confirmação de inscrição**, que sai no ato pelo Brevo com o link da
sala — a peça que hoje não existe (o Resend do Heitor está em sandbox e só
entrega na caixa dele).

Copies em `emails.mjs`. Editar lá e rodar `seed.mjs` de novo atualiza os
templates no CRM; campanhas já enviadas não são tocadas.

## Ordem de operação

```bash
node scripts/webinar/seed.mjs                   # projeto, audiências, templates, campanhas
node scripts/webinar/submit-wa-templates.mjs    # cria e submete os 5 templates à Meta
node scripts/webinar/submit-wa-templates.mjs --status   # acompanha a aprovação

node scripts/webinar/set-links.mjs --sala "https://meet.google.com/…"
node scripts/webinar/rebuild-audiences.mjs --dry-run    # confere os cortes
node scripts/webinar/rebuild-audiences.mjs              # reconstrói de verdade

node scripts/webinar/arm.mjs                    # calendário + pré-voo
node scripts/webinar/arm.mjs --arm              # COLOCA NO AR (draft → scheduled)
node scripts/webinar/arm.mjs --disarm           # volta tudo para draft
```

**As campanhas nascem em `draft` de propósito.** Nada dispara até alguém rodar
`--arm`. O `arm.mjs` roda um **pré-voo** antes e se recusa a armar se houver
template de WhatsApp sem SID aprovado, `link_sala` vazio ou
`MARKETING_UNSUB_SECRET` em branco. `--force` ignora os avisos.

## Pegadinhas já pagas nesta base

- **A Meta recusa template que começa ou termina com variável** (subCode
  2388299). Por isso toda copy começa com "Olá, {{1}}" e nunca "{{1}}, …".
- **Template aprovado não se edita.** Mudar a copy (ou a data do evento) obriga
  a criar um template novo e esperar a fila da Meta de novo.
- **Os templates da Impositivas SP marcam 0 cliques** porque são quick-reply
  com o link solto no corpo. Aqui o convite usa `twilio/call-to-action` com
  **botão de URL** — é o que faz o clique ser contabilizado.
- **`jsonb ||` substitui a chave inteira.** Mesclar `attributes` direto apaga
  as tags do contato (custou 143 contatos em agosto). O webhook do formulário
  já reconcilia o array à parte; qualquer script novo tem de fazer o mesmo.
- **O driver do Neon não compõe fragmentos de `sql\`\`` aninhados** (ao
  contrário do postgres.js): condição variável entra como parâmetro, não como
  pedaço de SQL.
- **Parâmetro em lista de SELECT precisa de cast explícito** (`${id}::int`),
  senão o Postgres não infere o tipo e a inserção falha.
- **SQL em template string não é coberta pelo `tsc`.** Rodar a consulta inteira
  contra o banco antes de subir.
- **O CRM não lê resposta de e-mail** — `inbound.ts` só trata WhatsApp
  (Twilio). Por isso o pedido principal do E5/E6 é WhatsApp: resposta de
  e-mail cai numa caixa pessoal, invisível ao pipeline.

## Links que chegam depois

`projects.settings.mergeExtras` guarda `link_sala`, `link_gravacao` e
`link_pdf`. `buildMergeVars()` os espalha por último, então trocar qualquer um
**não** exige re-renderizar template nenhum:

```bash
node scripts/webinar/set-links.mjs --gravacao "https://…" --pdf "https://…"
```

## O que ainda depende de gente

- **Relatório de presença do Meet** — o Google manda ao organizador ao fim da
  reunião; é o CSV que separa E5/W5 de E6/W5b. Exige **Controle de presença**
  ligado na consola de administração e edição acima do Business Starter.
- **Gravação e PDF do roteiro** — produção do Heitor, até 26/09.
- **Quem atende os inscritos.** A campanha anterior gerou 127 oportunidades e
  nenhuma saiu de "contato inicial" em três semanas. O webinar aumenta o
  volume; não resolve o atendimento.
