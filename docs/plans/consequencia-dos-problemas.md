# Consequência declarada dos problemas do calendário

## Objetivo

Cada verificação do calendário declara, uma única vez e num registro fechado, **quem resolve** o
problema que encontra. O que o problema impede (envio, publicação ou nada) é derivado dessa
declaração por uma só função, usada pelo servidor e pela interface. O que é opcional ou depende de
interpretação fica explícito: na norma, como aplicabilidade com motivo, ou nos dados do calendário,
como declaração do campus. Nunca deduzido de prefixo de código, texto de mensagem ou condição
espalhada.

## Decisões (12/11/2026)

- **Todo problema de conteúdo impede o envio**, inclusive no reenvio de um calendário devolvido.
  Some o “Enviar mesmo assim”. Enviar um calendário que não pode ser publicado só garante uma
  devolução.
- **Exceção, opcionalidade e interpretação são declaradas**, com motivo, no domínio.
- **Não há pareceres em andamento, e todos os calendários estão em rascunho.** As regras podem mudar;
  o campus ajusta o rascunho antes de enviar. Mudanças que apertam a norma entram como nova versão de
  regras (`rulesetChanges`) na mesma release.

## Situação atual

Há quatro níveis implícitos, e só dois têm tipo próprio:

| Nível             | Hoje                                                                        | Efeito                             |
| ----------------- | --------------------------------------------------------------------------- | ---------------------------------- |
| Bloqueio de envio | `submitBlockers` filtra `ContentIssue` por prefixo (`readiness.ts:398-407`) | Servidor recusa o envio            |
| Pendência         | O mesmo `ContentIssue`                                                      | Envio com confirmação; não publica |
| Aviso             | `notes`, via `warn()`                                                       | Nada                               |
| Portão da revisão | Frases acrescentadas em `releaseReadiness` (`readiness.ts:448-472`)         | Não publica                        |

Problemas concretos que o plano resolve:

1. **Classificação por prefixo.** `submitBlockers` precisa de duas condições porque uma atividade de
   férias sem datas gera `coverage:…:pending`, não `vacation:…`. `pendingActivityCount`
   (`pendencies.ts:114-124`) repete a exclusão de férias. Cursos ausentes têm um terceiro caminho:
   `transitions.ts:134` no servidor e um `ContentIssue` sintetizado em `IssuesSection.tsx:154-159`.
2. **Texto dentro da identidade.** `observance:${key}:${message}` (`readiness.ts:96`) e
   `${code}:${item}` (`readiness.ts:140,142`) usam a frase como parte do código, e
   `row.issues`/`row.warnings` de `plan-evaluation.ts` são `string[]`. Reescrever uma frase aparece como
   “adicionada + resolvida” na comparação de envios (`diff.ts:257-265`). O catálogo compara por
   `message` (`convex/catalogue.ts:99-104`).
3. **Nível deduzido por diferença de frases.** “Validação da DENTEC/PROENS” é o que sobra de
   `record.readiness.issues` depois de tirar as frases de conteúdo (`IssuesSection.tsx:169-172`).
   Entra ali `baseOutdatedIssue`, sob o texto “não dependem do campus”.
4. **Exceções genéricas viram pendência do campus.** O `catch` de `readiness.ts:358` e o de
   `plan-evaluation.ts:170-174` transformam qualquer exceção, inclusive um bug, em pendência. O
   `catch` de `readiness.ts` é também o único lugar que relata a semana não confirmada
   (`diagnostics.ts:18`): o laço de `readiness.ts:305-326` só trata períodos.
5. **O servidor confere o envio sobre a base gravada.** `transitions.ts:135` avalia
   `record.institutionalSnapshot`, enquanto a prontidão e o editor usam a base vigente
   (`record.ts:47-51`), e `recordCurrentBase` (`transitions.ts:151`) só incorpora a base vigente depois
   da conferência.
6. **Interpretação tratada de três jeitos.** A janela fora da referência é só aviso, dirigido ao
   revisor (`readiness.ts:286`), embora exista o critério `window` (`criteria.ts:27`). O prazo tardio
   bloqueia e manda conferir “cronograma ajustado pela Proens” (`plan-evaluation.ts:219-221`), mas o
   ajuste declarável (`deadlineAdjustment`) só vale para o ingresso regular, pelo art. 10, parágrafo
   único (`activities/deadlines.ts:89-102`). A alteração de efeméride bloqueia sem exceção
   (`observances.ts:68`), embora o critério II admita deliberação da Proens.
7. **Seis formas de dizer “opcional”**, com precedência (`requirements.ts:410-432`): `modalities`,
   `offerId`, `offerIds`, `optionalFor`, `intake`, `applicability`/`required: false`. O motivo de
   `optionalFor` pode ser `''`, e as demais não têm motivo. `modalities` e `offerIds` dizem a quem a
   linha se aplica, mas viram `optional`.
8. **A mesma data relatada duas vezes.** “Vínculo a conferir” é pendência por data
   (`readiness.ts:211-227`) e aviso por oferta (`plan-evaluation.ts:158-168`, somado em
   `readiness.ts:141`).
9. **Verificação vestigial.** `stage-order` compara início e fim de um mesmo evento: `start` e `end`
   são ambos `eventFor('stage')` (`readiness.ts:151-152`).

## Modelo

### Verificações e quem resolve

```ts
// src/domain/calendar/checks.ts
type Resolver =
  | 'campus' //      corrige ou declara no editor                       → impede envio e publicação
  | 'base' //        base institucional ou sistema; aponta a administração → impede envio e publicação
  | 'review' //      portão da revisão: parecer vigente, norma, critérios  → impede só a publicação
  | 'institution' // a DENTEC/PROENS julga no critério do achado            → não impede nada por si
  | 'none'; //       só informa

export const checks = {
  'coverage-pending': { resolver: 'campus', group: 'activities' },
  'deadline-late': { resolver: 'campus', group: 'activities', exception: 'deadline-adjustment' },
  'window-outside-reference': { resolver: 'institution', group: 'structure' },
  'observance-base': { resolver: 'base', group: 'dates' },
  'review-outdated': { resolver: 'review', group: 'review' },
  // …
} as const satisfies Record<string, CheckSpec>;
export type CheckId = keyof typeof checks;
```

- **`review` e `institution` são coisas diferentes.** `review` é o próprio portão da publicação
  (parecer desatualizado, norma não identificada, critério não avaliado, evidência ausente,
  `lockedBaseIssue`); não tem critério. `institution` é um achado que o revisor julga **dentro de um
  critério**; o critério impede a publicação até ser avaliado.
- **O critério vem do achado, não da verificação.** `deadline-late` vale para requisitos de critérios
  diferentes, então o achado leva o critério do requisito (`requirement.criterion`). O registro
  declara só a resolução e, quando houver, a declaração que leva à exceção.
- **Um achado `institution` sem critério não existe.** Requisitos sem critério (como `registration`,
  `requirements.ts:220-225`) não podem ter exceção; um teste percorre as verificações com `exception`
  e os requisitos a que se aplicam e confirma que todos têm critério.

```ts
interface Finding {
  check: CheckId;
  subject: { offerId?: string; eventId?: string; activity?: ActivityRef; term?: AcademicTerm };
  /** Critério do parecer que julga o achado; obrigatório quando o resolvedor efetivo é 'institution'. */
  criterion?: CriterionId;
  /** Declaração do campus que levou o achado ao julgamento institucional. */
  declared?: DeclarationId;
  title: string;
  detail: string;
  target?: ContentIssueTarget;
}
const findingKey = (f: Finding) => stableKey(f.check, f.subject); // nunca inclui texto

function resolverOf(f: Finding): Resolver {
  return f.declared ? 'institution' : checks[f.check].resolver;
}

function blocks(f: Finding): { submit: boolean; publish: boolean } {
  const resolver = resolverOf(f);
  switch (resolver) {
    case 'campus':
    case 'base':
      return { submit: true, publish: true };
    case 'review':
      return { submit: false, publish: true };
    case 'institution':
    case 'none':
      return { submit: false, publish: false };
    default:
      return assertNever(resolver);
  }
}

// Envio e publicação leem a mesma função.
const submittable = (findings: Finding[]) => !findings.some((f) => blocks(f).submit);
const ready = (findings: Finding[]) => !findings.some((f) => blocks(f).publish);
```

Um achado `institution` não impede a publicação **por si**, porque o critério dele já impede: a
publicação exige todos os critérios como `ATENDIDO` ou `NAO_APLICAVEL` num parecer vigente
(`readiness.ts:452-457`), e esse requisito vira achados `review`.

### Exceções declaradas

A exceção é **um dado do calendário**, não uma classificação. Sem a declaração, a verificação cobra
o campus; com ela, o achado vira `institution` sob o critério do requisito, e a DENTEC/PROENS decide no
parecer. O padrão já existe: `deadlineAdjustment` produz `standing === 'adjusted'` e uma nota de
revisão (`plan-evaluation.ts:223-226`).

### Erros inesperados

Nenhuma verificação esconde um bug como pendência do campus, e nenhuma deixa a leitura falhar:

- A semana não confirmada, a falta de períodos e a contagem de períodos viram verificações `campus`
  emitidas antes da contagem, a partir de `diagnostics.structure`. A contagem só roda quando
  `diagnostics.structure` está vazio.
- Uma exceção inesperada na contagem ou na validação de uma data (`plan-evaluation.ts:170-174`) vira
  achado `base` (“Erro do sistema na conferência; avise a administração”), com registro no log do
  servidor. Nunca `throw`: `baseRecord` (`record.ts:46`) e a prévia de impacto
  (`catalogue.ts:99-106`) recalculam a prontidão e quebrariam.
- Saída de um achado `base`: a administração corrige o catálogo ou o código, e o rascunho passa a ler
  a base vigente (`record.ts:47-51`). O texto do achado diz isso.

### Publicação e parecer

- As notas de revisão de hoje (`reviewNotes`: prazo ajustado, prorrogação municipal,
  `reviewInstruction`) já chegam ao parecer por critério (`src/domain/reviews/evidence.ts:317-326,387`)
  e aparecem no detalhe da atividade (`ActivityDetails.tsx:92,134`). Elas passam a ser achados
  `institution`, e `reviewNotesOf` dá lugar a eles, sem lista paralela.
- A janela do ano letivo fora da referência passa a `institution` sob o critério `window`. Hoje ela é
  aviso e já se dirige ao revisor; cobrá-la do campus criaria um bloqueio sem saída.

### Aplicabilidade

A opcionalidade é da **norma**, não do problema: uma atividade opcional sem datas não gera achado.

```ts
type Applicability =
  | { kind: 'required' }
  | { kind: 'optional'; note: string } //       por que a norma não exige; nunca vazio
  | { kind: 'not-applicable'; reason: string }; // fora do alcance da linha ou da norma
```

- As formas de declarar se reduzem a duas ideias: **alcance** (`modalities`, `offerId`, `offerIds` → a
  linha não se aplica à oferta, com motivo) e **obrigatoriedade** (`optional` com nota não vazia).
- **Ingresso:** `intake` registra que o campus exige a matrícula de ingressantes por regra local
  (`model.ts:19`). Sem ela, a norma não exige a atividade, e `optional` é a leitura correta. O que
  falta é o motivo: a nota passa a dizer “Exigida só quando o campus declara regra local”. Não há
  mudança de formato nem de significado do dado.
- Uma data registrada numa atividade opcional continua sendo conferida: dado registrado errado é
  achado `campus`, com verificação própria. Hoje a regra está implícita em `readiness.ts:139`.
- `applicability` também é chamada fora da avaliação do plano (`copy-dates.ts:209`,
  `registry.ts:99-103` via `event-draft.ts:245` e `EventEditor.tsx:615`, `rules-view.ts:134`). Esses
  chamadores passam a tratar `not-applicable` explicitamente.

## Etapas

Cada etapa é um ou mais commits na `main`. Os commits rodam typecheck, lint e os testes afetados
(unitários, `convex-test` e navegador das áreas tocadas). A suíte completa só roda com autorização.

### 1. Verificações com identidade (concluída)

- `checks.ts` registra cada verificação com seu rótulo; o grupo continua vindo do ponto que relata o
  achado e entra no registro com `resolver`, na etapa 2.
- `ContentIssue` leva `check` e `key`; a chave vem de `findingKey(check, ...assunto)`, nunca do texto.
  As linhas de `plan-evaluation.ts` levam achados `{ check, detail, eventId? }`.
- `diff.ts`, `convex/catalogue.ts` e `groupPendencies` comparam por chave. Mudar só a frase de um
  achado (por exemplo, o total de dias de férias docentes) deixa de aparecer como achado novo e
  resolvido.
- O aviso de “Vínculo a conferir” repetido em cada linha usa `link-review-row`, separado da pendência
  por data (`link-review`), para que a etapa 2 possa tratá-los de forma diferente.
- Removida a verificação vestigial `stage-order`.

### 2. Quem resolve e bloqueio do envio

- `resolver` em cada verificação, `blocks`, `submittable` e `ready`. `submitBlockers` some; servidor
  (`transitions.ts`) e interface usam `submittable`. Cursos ausentes viram verificação `campus`.
- O servidor confere o envio sobre a base vigente (`compatibility.snapshot.events`), como a prontidão.
- `baseOutdatedIssue` não impede o envio: o próprio envio incorpora a base vigente
  (`recordCurrentBase`). Passa a `none` no rascunho; no calendário travado, `lockedBaseIssue` é
  `review`.
- Erros inesperados conforme a seção acima; `week-unconfirmed`, `periods-missing` e `period-count`
  como verificações `campus`.
- `observanceIssues` com as três situações classificadas: referência divergente (`base`), alteração
  sem exceção (`campus`) e escolha órfã (`campus`, resolvida restaurando a data;
  `observances.ts:51-55`).
- A janela fora da referência passa a `institution` sob `window`.
- Anos sem norma: o mínimo `NOT_VERIFIABLE` (política `unconfigured`, `countingMinimums` nulo) vira
  `none`; sem isso, nenhum calendário desses anos poderia ser enviado.
- Remover “Enviar mesmo assim” e a lista de pendências dos diálogos de envio e de substituição
  parcial (`LifecycleActions.tsx:204,216-223`; `CalendarEditorLayout.tsx:165,220,463`). O envio fica
  indisponível com o motivo. Ajustar o texto de `IssuesSection.tsx:191`.
- Unificar o relato de “Vínculo a conferir”: um achado por data, sem aviso repetido por oferta.
- Testes: `test/convex/calendar-lifecycle.test.ts` (envio recusado com achado `campus` e `base`;
  aceito com `institution`, `review` e `none`; envio conferido sobre a base vigente),
  `test/browser/confirmation.spec.ts`, `test/domain/release.test.ts`.
- Documentação: `docs/uso.md:92` e `docs/componentes-interface.md:145` descrevem o envio com
  pendências.

### 3. Prontidão estruturada e telas de revisão

- `releaseReadiness` relata o portão da revisão como achados `review`. O contrato de `readiness`
  (`convex/contracts.ts:20-32`) passa a levar `ready`, `submittable` e só os achados que o cliente não
  calcula (`review` e `base` vindos do servidor); o conteúdo o cliente já calcula
  (`IssuesSection.tsx:151`). Como o app está em alpha, o contrato muda sem camada de transição.
- A etapa Revisão agrupa por quem age: **Você precisa corrigir** (`campus`), **Problema na base**
  (`base`), **A DENTEC/PROENS vai avaliar** (`institution` e `review`) e **Avisos** (`none`). Some a
  dedução por diferença de frases.
- A evidência do parecer (`evidence.ts`) lista, sob cada critério, os achados `institution` desse
  critério, no lugar de `reviewNotesOf`.
- Testes: `test/browser/review-step.spec.ts`, `review-ui.spec.ts`, `test/domain/evidence.test.ts` e as
  referências visuais afetadas.

### 4. Aplicabilidade explícita

- `Applicability` com motivo obrigatório; as regras da norma de 2027 declaram alcance e
  obrigatoriedade separadamente, sem precedência implícita.
- Chamadores fora da avaliação (`copy-dates.ts`, `event-draft.ts`, `EventEditor.tsx`,
  `rules-view.ts`) tratam `not-applicable`.
- Nota explícita para o ingresso por regra local.
- Testes: `test/domain/activities-offers.test.ts`, regras da norma e a página Regras do calendário.

### 5. Exceções declaráveis (depende de decisão e base normativa)

Para cada exceção aprovada: o campo de declaração (aditivo em `contentState`), a verificação com
`exception`, o formulário e uma versão de regras com `relaxes`. Estender `deadlineAdjustment` além do
ingresso regular depende de base normativa (hoje o art. 10, parágrafo único, a restringe), não só de
decisão da Proens.

## Dados e implantação

- **Nenhum achado é gravado.** A prontidão é calculada a cada leitura (`convex/calendars/record.ts:46`)
  e a comparação de envios recalcula os dois lados. As etapas 1 a 4 não mudam dados nem formato.
- **Exceções (etapa 5):** campos opcionais novos em `contentState`, nível 0.
- **Antes de implantar a etapa 2:** levantamento somente leitura em produção, por campus, dos achados
  que passarão a impedir o envio, para avisar os campi do que precisam corrigir.

## Questões em aberto

- **Quais exceções a Proens admite**, e com que base normativa: prazo tardio de transferência por
  cronograma ajustado e alteração de efeméride com deliberação (critério II). Até a decisão, as duas
  cobram o campus. A janela do ano letivo já fica com a revisão (etapa 2).
- **Avisos de etapa** (“Confira a organização definida pelo campus”, `readiness.ts:186-207`): `none`
  ou `institution`? Proposta: `none`, porque nenhum critério depende deles.

## Fora do escopo

- Consequência diferente por norma (sobrescrita na política): só quando houver a segunda norma, como
  em [Pendências](../pendencias.md) (“Fábrica de políticas”).
- Reavaliação de critérios em reenvio, já registrada em Pendências.
