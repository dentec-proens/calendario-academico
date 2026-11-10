# Feedback rápido dos usuários

## Objetivo

Convidar campus, pareceristas e administração a dizer como foi usar o sistema, com o menor esforço
possível: **um clique registra a opinião**; o comentário em texto é opcional e vem depois.

O convite aparece **logo depois de a pessoa concluir algo** (enviar o calendário, concluir ou devolver
um parecer), quando a experiência está fresca. Fora desses momentos, um botão **Sugestões** fica sempre
disponível para quem quiser comentar por iniciativa própria.

## Fora do escopo

- NPS (“de 0 a 10, recomendaria?”): o uso do sistema é institucional e obrigatório; a pergunta não faz
  sentido.
- Modal bloqueante ao entrar no sistema: interrompe o trabalho e tende a gerar respostas de má
  vontade.
- Formulário externo (Google Forms etc.): tira a pessoa do app e perde o contexto da tela.
- Resposta da equipe ao comentário dentro do sistema.
- Médias e taxas agregadas (exigiriam `@convex-dev/aggregate`); a primeira leitura é uma lista.

## Experiência

### 1. Convite após uma ação concluída

Gatilhos (ações de `LifecycleAction`, `convex/calendars/transitions.ts:38`). O ADMIN executa todas as
ações (`allowed`, `src/domain/calendar/lifecycle.ts`) e também é convidado: o registro guarda o papel de
quem executou.

| Ação                 | Contexto | Pergunta                          |
| -------------------- | -------- | --------------------------------- |
| `submit`             | `submit` | Como foi montar este calendário?  |
| `conclude`, `return` | `review` | Como foi revisar este calendário? |

`conclude` e `return` formam um só contexto: a pergunta é a mesma, e separá-los permitiria perguntar
duas vezes sobre o mesmo calendário.

O `notify` de `LifecycleActions.tsx:184` já anuncia “Calendário enviado à PROENS.” no `#message`. O
convite não repete a confirmação: traz só a pergunta.

```
┌──────────────────────────────────────────────┐
│ Como foi montar este calendário?           × │
│                                              │
│  ☹︎  Muito difícil · … · Muito fácil  ☺︎          │
│  Muito                         Muito         │
│  difícil                       fácil         │
└──────────────────────────────────────────────┘
```

Depois do clique numa nota:

```
┌──────────────────────────────────────────────┐
│ Obrigado! Quer contar mais? (opcional)     × │
│ ┌──────────────────────────────────────────┐ │
│ │                                          │ │
│ └──────────────────────────────────────────┘ │
│ Seu nome acompanha o comentário.  [ Enviar ] │
└──────────────────────────────────────────────┘
```

Escala: cinco rostos do Lucide instalado (`FaceAngry`, `FaceSlightlyFrowning`, `FaceNeutral`,
`FaceSlightlySmiling`, `FaceGrinning`, com `aria-hidden`), não emojis do sistema, cujo desenho muda
conforme o sistema operacional. A pergunta mede esforço, e os rótulos dizem isso: **Muito difícil**,
**Difícil**, **Razoável**, **Fácil**, **Muito fácil**. Os cinco rótulos ficam visíveis sob os rostos,
então nenhum botão é só ícone. A escala é um grupo de botões (`role="group"`, nomeado pela pergunta),
e a nota escolhida fica marcada com `aria-pressed`.

#### Tempo de exibição

O convite é **opcional e não bloqueia nada**, e ignorá-lo não faz perder nenhum trabalho. Por isso, e
seguindo a regra de tempo de avisos de `docs/componentes-interface.md` (seção “Tempo de exibição de
avisos”), ele sai sozinho:

- **15 s** sem nenhuma interação: o convite some e conta como ignorado (o registro `shown` já existe;
  ver “Registro do convite”).
- **O temporizador para** enquanto o ponteiro está sobre o convite ou o foco está dentro dele, e
  **para de vez** na primeira interação (nota, foco no campo, clique).
- Depois da nota, o campo de comentário **não tem prazo**: some ao enviar, ao fechar ou ao sair da
  página. Texto digitado nunca desaparece sozinho.
- Depois do envio do comentário, o “Obrigado!” sai em 4 s.
- Com `prefers-reduced-motion`, entrada e saída sem animação.

#### Registro do convite

O convite é gravado **ao ser exibido** (`outcome: 'shown'`), e a nota ou a recusa atualizam esse
mesmo registro. Assim, ignorar ou fechar contam igualmente para os limites abaixo, e um parecerista
que ignora o convite não volta a ser perguntado no parecer seguinte.

Limites, decididos no servidor:

- **Uma vez por contexto e calendário:** um reenvio do mesmo calendário não gera novo convite.
- **Intervalo global:** nenhum convite contextual se houver qualquer feedback da pessoa (contextual ou
  espontâneo) nos últimos `feedbackInterval` dias, constante nomeada, inicialmente 14. O valor deve ser
  ajustado pela taxa de convites ignorados.
- **Manutenção:** com escritas pausadas (`maintenancePaused`), nenhum convite é aberto; nada é
  gravado e nenhum erro aparece.

### 2. Botão “Sugestões”

Botão com ícone `MessageSquareHeart` e rótulo visível **Sugestões** no cabeçalho de `RootLayout`
(`web/app/layouts/RootLayout.tsx:53-81`), presente em todas as telas autenticadas, inclusive o editor.
“Sugestões” entra na tabela de verbos de `docs/componentes-interface.md` antes de ganhar o ícone.

Abre o mesmo convite com a pergunta “Como está sendo usar o app Calendários Acadêmicos?”, a escala e o campo de texto já
visível. Basta nota **ou** comentário. Não tem temporizador nem sofre o intervalo global: é iniciativa
da pessoa.

### 3. Leitura pelo ADMIN

Fase 1: aba **Feedback** em **Registros** (`/logs?aba=feedback`), só para o ADMIN, entre
**Operações** e **Falhas**. Lista as 100 respostas mais recentes, no molde de `clientErrors.list`
(`convex/clientErrors.ts:72-107`): data, nome, papel, calendário, contexto, nota, comentário e rota.
Convites só exibidos ou recusados (sem nota nem comentário) não entram na lista. Sem nada recebido, a
aba diz “Nenhum feedback recebido ainda.”. Sem médias. Fase 2, se houver uso: filtros, agregados e
“Carregar anteriores”.

A lista lembra a retenção (ver “Retenção”) de dois jeitos:

- uma frase fixa no topo da aba: “Os registros são apagados 1 ano depois de recebidos. Copie o que
  quiser guardar.”;
- em cada registro, o tempo restante (“expira em 12 dias”, “expira hoje”), calculado no cliente a
  partir de `at`, com destaque âmbar nos últimos 7 dias.

## Modelo de dados

Nova tabela em `convex/schema.ts`, no estilo de `clientErrors`:

```ts
feedback: defineTable({
  at: v.number(),
  userId: v.id('users'),
  role: v.union(v.literal('ADMIN'), v.literal('CAMPUS'), v.literal('PARECERISTA')),
  context: v.union(v.literal('submit'), v.literal('review'), v.literal('spontaneous')),
  outcome: v.union(v.literal('shown'), v.literal('answered'), v.literal('dismissed')),
  rating: v.optional(v.number()), // inteiro 1..5
  comment: v.optional(v.string()), // até 2000 caracteres
  route: v.string(), // sem query string nem hash, até 200 caracteres
  calendarId: v.optional(v.id('calendars')),
  release: v.string(),
})
  .index('by_userId_and_at', ['userId', 'at'])
  .index('by_userId_and_context_and_calendarId', ['userId', 'context', 'calendarId'])
  .index('by_at', ['at']),
```

O `role` é copiado do usuário no momento do convite (o papel pode mudar depois). O índice `by_at`
serve ao expurgo e à lista do ADMIN, da mais recente para a mais antiga.

## Backend (`convex/feedback.ts`)

Todas as funções identificam a pessoa por `requireNativeUser(ctx)`; nenhuma recebe `userId`.

- `mutation openFeedbackPrompt({ context: 'submit' | 'review', calendarId, route, release })` →
  `{ id } | null`.
  - `calendarRow(ctx, user, calendarId)` (`convex/calendars/model.ts:11`) garante que o calendário
    existe e é visível para a pessoa.
  - Confere no `audit` (`by_calendarId_and_action_and_at`) que essa pessoa registrou a ação
    correspondente (`SUBMIT_CALENDAR`, `CONCLUDE_REVIEW` ou `RETURN_CALENDAR`) nos últimos minutos;
    sem isso, devolve `null`. Assim ninguém declara um contexto que não viveu.
  - Devolve `null` em manutenção, se já houver registro para (usuário, contexto, calendário) ou se
    houver qualquer feedback dentro de `feedbackInterval` (leitura em `by_userId_and_at` com
    `gte('at', agora − intervalo)` e `.first()`).
  - Caso contrário, grava `outcome: 'shown'` e devolve o `id`.
- `mutation rateFeedback({ id, rating })`: só o autor e só até 30 min depois de `at`; aceita trocar a
  nota nessa janela. Grava `outcome: 'rated'`.
- `mutation dismissFeedback({ id })`: só o autor; grava `outcome: 'dismissed'` se ainda não houver
  nota.
- `mutation commentFeedback({ id, comment })`: só o autor e só até 30 min depois de `at`; corta
  espaços e aplica o limite.
- `mutation sendFeedback({ rating?, comment?, route, release })`, para **Sugestões**: exige ao menos
  um dos dois, grava `context: 'spontaneous'`, `outcome: 'answered'`. Teto de 10 por hora por pessoa, com
  `@convex-dev/rate-limiter` (já montado em `convex/convex.config.ts`); acima disso, descarta em
  silêncio.
- Rota e release saneadas no servidor como em `clientErrors.report` (`convex/clientErrors.ts:64`):
  sem `?` e `#`, que podem levar tokens privados, e com limite de tamanho.
- Em manutenção, as mutations descartam em silêncio (como `clientErrors.report`), em vez de lançar
  503 com `assertWritesOpen`: um clique opcional não deve virar aviso de falha nem novo
  `clientErrors`.
- `query listFeedback({ paginationOpts })`, só ADMIN (`requireAdmin`), para a lista em `/logs`.
- Não entra no `audit`: não é ação sobre calendário.

## Frontend

- `web/features/feedback/FeedbackProvider.tsx`: estado único do convite, montado em `RootLayout`. O
  editor monta duas instâncias de `LifecycleActions` (cabeçalho e rodapé), por isso o estado não pode
  ficar nelas. Expõe `offer(context, calendarId)` e `openSuggestions()`.
- `web/features/feedback/FeedbackInvite.tsx`: região `role="status"` sempre montada e vazia até haver
  convite, com um `Notice` sem anúncio, `elevated`, e `actions` com a escala ou o campo. Sem CSS
  próprio para o aviso: `className` só para posicionamento.
- Gatilho em `LifecycleActions.tsx`, em `perform`, depois de `notify` (linha 184): se a ação for
  `submit`, `conclude` ou `return`, chama `offer`. Nada acontece se a transição falhar.
- Posição: canto inferior direito no desktop, faixa inferior no celular, sem cobrir o `#message`, a
  barra fixa de salvar do parecer nem o rodapé do editor. Verificar em
  `test/browser/scroll-layout.spec.ts`, que testa a recepção de cliques.
- Lista em `/logs`: `web/features/audit/` ao lado de `ClientErrors.tsx`.

## Retenção

`feedback` guarda `userId` com texto livre. Os registros são apagados **1 ano** depois de `at`, tempo
para acompanhar um ciclo inteiro de calendários e comparar o feedback de um ano com o do seguinte
(constantes `feedbackRetention` e `feedbackRetentionLabel`, compartilhadas com a tela do ADMIN para
que o aviso e o expurgo não divirjam), por um cron diário como
`client-errors-cleanup` (`convex/crons.ts:6`), coberto por `test/convex/cron-config.test.ts`. O expurgo
lê pelo índice `by_at` em lotes e se reagenda enquanto houver registros vencidos.

O intervalo global de convites (14 dias) é bem menor que a retenção, então o expurgo nunca libera um
convite antes da hora.

## Testes (direcionados)

`convex-test` em `test/convex/feedback.test.ts`:

- `openFeedbackPrompt` devolve `null` sem a ação correspondente no `audit`, para calendário de outro
  campus, em manutenção, num segundo convite do mesmo (contexto, calendário) e dentro do intervalo,
  inclusive depois de um feedback espontâneo;
- convite ignorado (só `shown`) também conta para o intervalo;
- nota fora de 1..5 ou não inteira é rejeitada; troca de nota dentro de 30 min é aceita;
- nota e comentário de outra pessoa, ou depois de 30 min, são rejeitados;
- `sendFeedback` sem nota e sem comentário é rejeitado; acima do teto por hora, é descartado;
- rota gravada sem query string nem hash;
- `listFeedback` recusa quem não é ADMIN e omite convites sem nota nem comentário;
- o expurgo apaga só registros com mais de 1 ano.

Playwright: enviar um calendário mostra o convite; uma nota mostra o campo de comentário; o convite
sem interação some depois do tempo (com relógio controlado), e não some com o ponteiro sobre ele.

## Decisões tomadas

- **ADMIN incluído** nos convites contextuais.
- **Temporização:** o convite sai sozinho, porque é opcional e não perde trabalho; a regra geral de
  tempo de avisos foi relativizada em `docs/componentes-interface.md`.
- **Escala:** rostos do Lucide com rótulos de esforço.
- **Identificação:** o comentário vai com o nome, e o convite avisa. Com poucas contas por campus,
  “só perfil e campus” identificaria a pessoa do mesmo jeito; prometer anonimato seria enganoso.
- **Leitura:** lista paginada em `/logs` já na primeira entrega.
- **Retenção:** 1 ano (365 dias), lembrada na lista do ADMIN com o tempo restante de cada registro.
- **Intervalo global:** 14 dias como ponto de partida, a ajustar pela taxa de convites ignorados.
