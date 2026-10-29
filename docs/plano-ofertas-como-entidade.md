# Plano: oferta como entidade do calendário (conteúdo v4)

Status: aprovado para implementação (revisado por subagente e Codex CLI; decisões da §10 fechadas em 29/10/2026). Origem: Melhoria 04 (organização dos cursos superiores) e a previsão de outros casos dada a variedade de campi e cursos.

**Premissa de dados (decisão de 29/10/2026).** O sistema está em alpha, só com dados de teste. Preservam-se apenas os **calendários em construção** (`calendars` + `calendarContents`). Versões anteriores (`calendarVersions`, `calendarSnapshots`) e pareceres (`reviews`, `reviewVersions`) são **apagados** na migração, depois do backup integral. O backup é a única cópia do estado v3 anterior.

**Princípio da mudança.** Trocar o eixo modalidade → oferta **sem mudar obrigações nem contagem**. Toda mudança de regra (mínimos por organização, recusa de combinações de etapas, exigências por modo EaD) fica fora deste plano e entra depois como alteração própria do conjunto de regras.

## 1. Problema

Hoje o calendário guarda tudo indexado pela **modalidade** (`integrado`, `subsequente`, `graduacao`, `posgraduacao`):

| Campo atual (`contentState`, v3)   | Chave / papel                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `organizationByModality`           | modalidade → `anual` \| `semestral` \| `a-classificar`                            |
| `assessmentStagesByModality`       | modalidade → 2 \| 3 \| 4 (vazio em calendário recém-criado)                       |
| `intakeByModality`                 | modalidade → termo → exigência de matrícula                                       |
| `periods[].association.modalities` | lista de modalidades                                                              |
| `events[].modalities`              | lista de modalidades                                                              |
| `events[].requirementId`           | sufixo `:modalidade` (`stage-1:graduacao`, `-1:integrado`)                        |
| `scopeConfirmation`                | **uma** por calendário; também decide a janela da norma                           |
| `regime`                           | resumo recalculado na normalização; alimenta `cyclesByRegime` e o parecer técnico |
| `secondSemesterIntake`             | campo v2 preservado; decide requisitos em `operational-checklist.ts`              |
| tabela `calendars.modalities`      | lista usada na listagem, em `domainState.offer` e na identidade da base           |

Consequências:

1. **Uma organização por modalidade.** Uma graduação anual e outra semestral não cabem no mesmo calendário.
2. **Dimensões misturadas.** `modality` junta _forma de oferta do técnico_ com _nível_. O modo (presencial/EaD) não existe.
3. **Escopo da norma por calendário**, não por oferta.
4. **Rótulo das etapas deduzido só da contagem** (`stageCycle`), sem considerar a organização.

## 2. Objetivo e não objetivos

**Objetivo.** O calendário passa a conter uma lista de **ofertas**, cada uma com identidade própria e dimensões separadas. Políticas, contagem, prontidão, editor, regras, parecer técnico e impressão passam a trabalhar por oferta. Depois da migração, o código só conhece v4, inclusive na importação de cópias, e não resta infraestrutura legada que os dados atuais não usem (§11.3, M9).

**Não objetivos.**

- Não alterar obrigações, mínimos de dias ou aplicabilidade. O conjunto de regras recebe só uma entrada `editorial`.
- Não criar tabela de cursos institucionais (e-MEC, PPC).
- Não apagar `audit`, `documents`, `institutionalEvents`, `catalogueRevisions`, usuários, campi nem arquivos do Storage.

## 3. Modelo proposto

### 3.1 Identidade × tipo

A revisão mostrou que o código usa a modalidade com **dois papéis**, que o v4 separa:

- **Tipo da oferta (`kind`):** o que a norma e o catálogo institucional conhecem: `integrado`, `subsequente`, `graduacao`, `posgraduacao`. Aplicabilidade, `optionalFor`, `familyMeetingOffers`, exclusões, eventos institucionais, rótulos e identidade da base usam o **tipo**.
- **Identidade da oferta (`id`):** a instância dentro do calendário. Períodos, eventos, sufixo de `requirementId`, etapas, ingresso e escopo usam o **id**.

Ids são opacos, únicos no calendário e **imutáveis**. O nível e a forma de uma oferta existente também não mudam: para mudar, remove-se a oferta e cria-se outra.

### 3.2 Tipos

```ts
// src/domain/calendar/model.ts (forma conceitual; validadores equivalentes em convex/validators.ts)
type OfferKind = 'integrado' | 'subsequente' | 'graduacao' | 'posgraduacao'; // extensível (§10)
type OfferDelivery = 'presencial' | 'ead' | 'a-conferir';
type Organization = 'anual' | 'semestral' | 'a-classificar';

interface CalendarOffer {
  id: string; // [a-z][a-z0-9-]*, único, imutável
  kind: OfferKind; // união fechada: nível + forma num só campo, sem combinações inválidas
  label?: string; // "Licenciatura em Química"; obrigatório quando há duas ofertas do mesmo kind
  delivery: OfferDelivery; // informativo nesta mudança (§10)
  organization: Organization;
  stages?: { perTerm: number }; // etapas em CADA ciclo da organização (§3.4); ausente = a definir
  legacyStageCount?: 2 | 3 | 4; // total antigo conhecido com organização ainda a classificar (§3.4)
  scope?: { status: 'covered' | 'own-regulation' };
  intake?: Partial<Record<AcademicTerm, IntakeConfiguration>>;
  organizationBasis?: string; // ex.: "PPC aprovado pela Resolução nº …"; opcional
}

interface CalendarContentV4 {
  schemaVersion: 4;
  rulesetVersion?: string;
  offers: CalendarOffer[]; // 1..12 (calendarLimits.maximumOffers, §10)
  weekdays;
  weekConfirmed;
  periods;
  events;
  teacherDayDate;
  teacherVacations;
  legacySecondSemesterIntake?: boolean; // exceção de compatibilidade da política de 2026 (§3.3)
}
// periods[].association: { status: 'defined'; offers: string[]; term } | { status: 'a-classificar' }
// events[].offers?: string[]     (antes: modalities; ausente = todas as ofertas)
```

O nível (`tecnico`/`graduacao`/`posgraduacao`) é derivado de `kind` por função pura. Isso evita a combinação inválida `form?` + `level` que a primeira versão permitia.

### 3.3 Campos derivados (não gravados)

- `regime` (resumo anual/semestral/misto) → `organizationSummary(offers)`, usado por `cyclesByRegime` e pelo parecer técnico.
- `secondSemesterIntake` → derivado de `intake.second` das ofertas: `true` se alguma confirmar ingresso, `false` somente se todas confirmarem ausência, e ausente se houver indefinição. **Exceção aprovada pelo painel em 29/10/2026:** a política de 2026 aceitava esse indicador e o mapa de ingresso como decisões independentes. O conteúdo v4 conserva `legacySecondSemesterIntake?: boolean` somente quando essa política usa o segundo ciclo e os predicados `indicadorAntigo === false` e `derivação === false` diferem. O campo preserva a exigência operacional, sem declarar ingresso real nem alterar `offers[].intake`; somente a política de 2026 o consulta, com precedência por `??`. Quando o indicador antigo está ausente e a derivação dispensa a matrícula, o conversor grava `true` para preservar a exigência antiga. O M9 retira o campo se retirar a política de 2026.
- `kinds(state)` → tipos distintos e ordenados, usados em `calendars.offerKinds`, na identidade da base e nos eventos institucionais.

### 3.4 Etapas por ciclo

A quantidade de etapas é escolhida **depois** da organização e **dentro de cada ciclo** dela (retorno de campus de 29/10/2026):

| Organização | Ciclos           | Etapas por ciclo (`perTerm`) | Total no ano | Rótulo (`stageCycle`)            |
| ----------- | ---------------- | ---------------------------- | ------------ | -------------------------------- |
| anual       | ano letivo       | 2, 3 ou 4                    | 2, 3 ou 4    | semestral, trimestral, bimestral |
| semestral   | 1º e 2º semestre | 1 ou 2                       | 2 ou 4       | semestral, bimestral             |

- **Numeração reinicia em cada ciclo.** Em organização semestral com 2 etapas por semestre, aparecem "1ª etapa — 1º semestre", "2ª etapa — 1º semestre", "1ª etapa — 2º semestre", "2ª etapa — 2º semestre".
- **Cada etapa pertence a um ciclo.** Ela deve ficar inteiramente dentro do período **daquele** ciclo da oferta, e a sequência é conferida dentro do ciclo. Hoje basta caber em qualquer período (`assessment-intervals.ts:10`).
- **IDs persistidos não mudam de formato.** `stage-n:offerId` continua com `n` sequencial no ano (1..4), como chave interna. O ciclo e o número exibido são derivados: `term = ⌈n / perTerm⌉`, `número = n − (term − 1) × perTerm`. Assim, eventos e requisitos existentes não são reescritos.
- **Obrigações iguais.** A tabela de requisitos continua gerando um conjunto de linhas por etapa (início e término, prazo de resultados, conselho, reunião pedagógica); só o nome passa a citar o ciclo. Semestral com 4 etapas no ano gera as mesmas 4 linhas de hoje.
- A validação "etapa dentro do período do seu ciclo" é mais estrita que a atual, mas é **de consistência dos dados**, não de norma. No calendário migrado que a violar, ela aparece como aviso de prontidão, sem impedir o salvamento de outras partes.
- **Quantidade conhecida sem organização (exceção de preservação aprovada por unanimidade do painel em 29/10/2026):** o ensaio identificou 26 ofertas em 14 calendários com organização `a-classificar` e quantidade antiga válida (11 com duas, quatro com três e 11 com quatro etapas). A oferta v4 conserva esse total em `legacyStageCount?: 2 | 3 | 4`, exclusivamente com organização `a-classificar` e `stages` ausente. Não é `perTerm`, não infere organização nem ciclo e não se aplica ao caso semestral com três etapas. O domínio mantém exatamente os 312 requisitos, seus IDs, nomes, aplicabilidade, diagnósticos e cronologia antigos; `stageTerm` fica indefinido e os rótulos conservam a cadência histórica. A organização continua impedindo a conclusão; não se acrescentam cobranças artificiais de quantidade ou avisos de ciclo impossível de determinar. Criar ou alterar datas de etapas continua exigindo organização e ciclo válidos. Leitura, salvamentos alheios às etapas e cópia4 preservam o campo. O backend impede introdução, alteração e retirada arbitrárias: somente a configuração completa válida de organização e `perTerm` o remove atomicamente, aplicando as salvaguardas de quantidade e vínculos, inclusive nos caminhos de classificação por períodos. O verificador faz o mapeamento exato pelo total antigo, sem ignorar requisitos. A release B conserva essa representação v4, e o M9 só a remove com uso zero comprovado nos conteúdos correntes, lixeira, órfãos e snapshots históricos.

### 3.5 Tabela `calendars`

- `calendars.modalities` é **renomeado para `calendars.offerKinds`** e guarda os tipos distintos das ofertas, recalculados a cada salvamento. A tabela não tem índice nesse campo. Na release A, o schema aceita os dois campos como opcionais; `contentsToV4` grava `offerKinds` e retira `modalities`; a release B torna `offerKinds` obrigatório e remove `modalities`.
- `courses`, `classes` e `shifts` continuam como descrição geral do calendário e são a única fonte para cursos. A oferta tem só `label`, para não criar duas fontes da verdade.
- `domainState.offer` (hoje `modalities[0]`) é removido.
- `calendars.version` é mantido (controle de concorrência).

## 4. Política e regras

Contrato (`src/domain/policies/contract.ts`), trocando `modality: string` por `offer: CalendarOffer`:

```ts
applicability(state, requirement, offer): Applicability;        // decide pelo offer.kind e pelo offer.scope
applicabilityNote?(requirement, offer): string | undefined;
countingMinimums(state, offer): { annual: Minimum | null; semester: Minimum | null };
excludes(offer): boolean;                                       // antes: excludedModalities
window(state): CalendarWindow | null;                           // vale se alguma oferta não excluída estiver 'covered'
type Minimum = { days: number; basis: string };
```

- **`countingMinimums` mantém o comportamento atual.** Uma oferta semestral continua com a conferência anual e a semestral (`counting/evaluation.ts`, `diagnostics.ts`). Só ganha `basis` para exibição. Devolver só o mínimo da organização é mudança de regra e fica fora deste plano.
- **Janela:** hoje vale quando o calendário não é `own-regulation` e tem oferta não excluída. Em v4, vale quando alguma oferta não excluída é `covered` ou ainda não confirmada. Com escopo uniforme, o resultado é idêntico ao de hoje. Aplica-se a `readiness.ts`, `calendar-layout.ts` e `technical-support.ts`.
- **Confirmação em tipos excluídos (ajuste aprovado por unanimidade do painel em 29/10/2026):** a prontidão v4 não cobra confirmação da Resolução 292 para a pós-graduação, já excluída dessa norma. A conversão de um calendário composto somente por ofertas excluídas pode retirar o impedimento global antigo de confirmação quando o escopo anterior era ausente ou `own-regulation`; se era `covered`, nada é retirado. Essa é a única diferença adicional admitida na prontidão. Em calendários mistos, qualquer oferta não excluída sem `covered` continua sustentando o impedimento. Não se alteram requisitos, aplicabilidade, mínimos, contagem, base, janela nem exigências de revisão humana.
- **Etapas:** a seção `repeat: 'stage'` gera `perTerm` linhas por ciclo de cada oferta; `Slot` ganha `term` e o número dentro do ciclo, e `stageCycle(slot)` passa a considerar a organização. Os nomes do catálogo passam de "1ª etapa — bimestral" para "1ª etapa do 1º semestre — bimestral" (alteração editorial).
- **Requisitos:** `requirement-table.ts` passa a usar `Slot.offer`. O sufixo dos IDs gerados usa `offer.id`; `requirement.modalities`, `optionalFor` e `familyMeetingOffers` continuam declarados por **tipo** e são comparados com `offer.kind`.
- `validation.ts:118` deixa de ler o sufixo do `requirementId` como modalidade: resolve a oferta pelo id.
- `rulesetChanges` recebe uma entrada `editorial`. Teste obrigatório de equivalência (§7).
- `legacy-2026.ts` e `unconfigured.ts` recebem a mesma troca de assinatura.

## 5. Inventário de pontos afetados

Além de `organization/`, `activities/`, `counting/`, `readiness.ts`, `normalization/`, `commands/` e `printing/`:

| Ponto                                                                                                                                                                      | Mudança                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Testes `schemaVersion === 3` (`reviews.ts:98,103`, `calendars.ts:219,225`, `periods.ts:5,21`, `duration.ts:20`, `commands/periods.ts:143`, `teaching-day-breakdown.ts:59`) | Somem com os formatos antigos; enquanto convivem, usar um predicado único `isStructured(state)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/domain/calendar/base.ts` (identidade da base)                                                                                                                         | Usa `kinds(state)`, deduplicado e ordenado, para preservar `baseIdentity`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `prepare-save.ts:20-31`                                                                                                                                                    | Proibição de remover ofertas e materialização de `calendars.offerKinds` passam a usar ids e tipos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `diagnostics.ts`, `counting/evaluation.ts`                                                                                                                                 | `byModality` → por oferta; rótulos por `label` ou tipo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/domain/reviews/technical-support.ts`                                                                                                                                  | `regime` derivado; contagem por oferta; janela por oferta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/domain/institution/catalogue.ts:186`, `convex/catalogue*.ts`                                                                                                          | Eventos institucionais selecionados por **tipo**; aplicados a todas as ofertas daquele tipo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `coverage.ts:30`                                                                                                                                                           | Cobertura por oferta, aplicabilidade por tipo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `modalityLabels[...]` (`readiness.ts`, `offers.ts`, `calendar-layout.ts`, `review-export.ts`)                                                                              | `offerLabel(offer)` = `label` ou rótulo do tipo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `convex/contracts.ts` (`createInput.regime`, `reviewSupportDto.offer/regime/teachingDays.modality`)                                                                        | DTOs por oferta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `convex/devSetup.ts:163`                                                                                                                                                   | Semente em v4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `web/app/search.ts:53` (`atividadeOferta`), `web/shared/integrations/webmcp.ts:47`                                                                                         | Parâmetro passa a ser id da oferta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `activities/assessment-intervals.ts`, `organization/offers.ts` (rascunho e validação das etapas)                                                                           | Etapa conferida contra o período do seu ciclo; sequência por ciclo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `OfferOrganizationForm.tsx`                                                                                                                                                | Ordem: organização → períodos letivos → etapas. O select hoje rotulado "Etapas no ano" (linha 283, junto da organização) passa a se chamar **"Etapas"** e vai para o início da seção **"Etapas de avaliação"** (linha 384). As opções dependem da organização já escolhida: 2, 3 ou 4 para anual; 1 ou 2 (por semestre) para semestral, com um texto de ajuda que diz a que ciclo a quantidade se refere. Na organização semestral, as etapas aparecem agrupadas por semestre e numeradas dentro de cada um ("1ª etapa — 1º semestre"). O resumo da oferta (linha 199, "· N etapas no ano") acompanha a mesma regra |
| `OfferOrganizationForm.tsx` (rascunhos `organization:${modality}`), `ScopeForm.tsx`, `IntakeRequirementForm.tsx`, `CreateCalendarForm.tsx`, `event-draft.ts`               | Formulários por oferta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `ImportCalendarForm.tsx` (cópias "Formato 3")                                                                                                                              | Aceita só formato 4; cópias antigas são recusadas com mensagem clara (§10, decisão 4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `editor-session.ts` (caminho v2)                                                                                                                                           | Removido na release B                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ~105 arquivos de teste                                                                                                                                                     | Fixtures v4; ajustar por área                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## 6. Migração de dados

### 6.1 O que é preservado e o que é apagado

| Tabela                                  | Ação                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------- |
| `calendars`                             | preservada; `modalities` vira `offerKinds` (mesmos valores, salvo órfãos) |
| `calendarContents`                      | **convertida** para v4 (todos, inclusive os da lixeira)                   |
| `calendarVersions`, `calendarSnapshots` | **apagadas**                                                              |
| `calendarAliases`                       | **apagada** (redirecionamentos de URLs antigas; §11.6)                    |
| `reviews`, `reviewVersions`             | **apagadas**                                                              |
| demais                                  | intocadas                                                                 |

Os snapshots são as versões anteriores de cada calendário: a cada salvamento, `archive()` (`convex/calendars/record.ts`) copia a versão substituída, e `calendarVersions` liga `(calendarId, version)` a ela. Serviam de trilha e de "documento examinado" pelos pareceres. Como ambos são dados de teste, apagá-los elimina leitores de formatos antigos.

`audit` aceita eventos do sistema (`actorId` opcional). A operação registra `PURGE_HISTORY_V4` com as contagens apagadas e um `MIGRATE_CONTENT_V4` por calendário (versão, hash do estado anterior). O estado anterior completo fica só no backup.

### 6.2 Regra de conversão (função pura `convertCalendarV3`)

Para cada modalidade `m` de `calendars.modalities` (o campo antes da renomeação):

| v4                             | origem                                                                                                                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                           | `m`                                                                                                                                                                                                                                       |
| `kind`                         | `m`                                                                                                                                                                                                                                       |
| `label`                        | ausente                                                                                                                                                                                                                                   |
| `delivery`                     | `a-conferir` (não inferir)                                                                                                                                                                                                                |
| `organization`                 | `organizationForModality(state, m)`, que em v3 sem entrada devolve `a-classificar` e só em v2 recorre a `regime`                                                                                                                          |
| `stages`                       | anual: `{ perTerm: c }`; semestral com `c` = 2 ou 4: `{ perTerm: c / 2 }`; semestral com `c` = 3, `a-classificar` ou sem `c`: ausente (etapas a definir), mantendo os eventos `stage-n` como estão. `c` = `assessmentStagesByModality[m]` |
| `scope`                        | `scopeConfirmation` do calendário, copiada para cada oferta não excluída                                                                                                                                                                  |
| `intake`                       | `intakeByModality[m]`                                                                                                                                                                                                                     |
| `periods[].association.offers` | `association.modalities`                                                                                                                                                                                                                  |
| `events[].offers`              | `events[].modalities`                                                                                                                                                                                                                     |
| `requirementId`                | **inalterado**                                                                                                                                                                                                                            |

Com `id = kind = m`, cada calendário migrado tem exatamente uma oferta por tipo. Os sufixos `:graduacao`, as associações e os eventos continuam válidos sem reescrita. Ofertas novas recebem ids como `graduacao-2`; por isso `assessmentStageRequirementPattern` (hoje `[a-z]+`) passa a aceitar `[a-z][a-z0-9-]*`.

**Conteúdo v2 remanescente** passa antes pela `convertCalendarV2`. O que ela deixa pendente (`conversion.organization: 'pending'`, ou `legacySecondSemesterIntake` em calendário combinado) vira `organization: 'a-classificar'` e `intake` com `status: 'unknown'` nas ofertas afetadas. São os mesmos estados seguros que a interface já cobra. A política de 2027 **não** é adotada automaticamente: `rulesetVersion` fica como estava.

Respostas explícitas de ingresso já confirmadas após a conversão v2 (`yes`/`no`, com `required`) são preservadas; o indicador histórico não as transforma novamente em `unknown`. A pendência de ingresso combinado não invalida uma organização já classificada com segurança. Para a política de 2026, a decisão operacional independente é conservada pela exceção da §3.3, sem sobrescrever o mapa por oferta. Validação, normalização, salvamento e cópias v4 preservam essa exceção enquanto necessária.

O escopo continua sendo copiado somente para ofertas não excluídas. O bloqueio global de confirmação que atingia ofertas excluídas é retirado conforme a exceção limitada da §4; nenhum metadado de compatibilidade é criado para reproduzir esse bloqueio residual.

**Órfãos:** conteúdo sem linha em `calendars`, ou chaves de `organizationByModality`, `intakeByModality` e `assessmentStagesByModality` fora de `calendars.modalities`, são contados no relatório como perda. O relatório do ensaio precisa mostrar zero, ou cada caso justificado.

A conversão não incrementa `calendars.version`, não chama `archive()` e não altera `updatedAt` nem `catalogueRevision`.

### 6.3 Releases

O `pnpm deploy:production` publica o backend, conclui as migrações pendentes e só então promove o frontend. Ele **não** entra em manutenção e **exige** estar fora dela. Por isso:

**Release A: expansão, migração e novo cliente.**

- Schema: `calendarContents.state` aceita `contentStateLegacy` (cópia **literal** e independente do validador v2/v3 atual) ou `contentStateV4`. `historicalState` vira uma cópia literal do validador atual, para que o estreitamento de `contentState` não o arraste.
- Validadores de contrato: `domainState` e `saveInput` hoje espalham `contentState.fields` (`validators.ts:152-158`, `contracts.ts:104-105`), e uma união não tem `.fields`. Na release A, eles passam a ser construídos a partir de `contentStateV4.fields`: o cliente só troca v4 com o servidor, e a união existe apenas na tabela.
- Backend: lê v4 e converte em memória o que ainda for v2/v3 (o conversor existe para a migração). Grava só v4. Um corpo não-v4 enviado a conteúdo v4 recebe **409 "Atualize a aplicação"**, a mesma barreira que já existe para v2 em `calendars.ts:219`.
- `pending` em `convex/migrations.ts`, nesta ordem: `purgeReviews` (`reviewVersions`, `reviews`); `purgeHistory` (`calendarVersions`, `calendarSnapshots`); `purgeAliases` (`calendarAliases`, que o M9 retira do schema); `contentsToV4` (idempotente, `batchSize` pequeno, por exemplo 10, porque cada conteúdo pode ter até 1000 eventos; acumula contadores de convertido, pendente, órfão e falha num documento próprio, sem ler a tabela inteira numa consulta).
- Frontend novo, só v4. Entre a publicação do backend e a promoção, um cliente antigo pode receber estado v4: a leitura pode falhar e a gravação recebe 409. O `UpdateProvider` pede recarga quando a nova versão é promovida. Por ser alpha com usuários de teste, o risco é aceito e comunicado antes; para eliminá-lo, publicar fora do horário de uso.

**Release B: estreitamento e limpeza.**

- `contentState` e `historicalState` aceitam só v4. A validação de schema do Convex recusa o deploy se restar documento fora do formato, o que serve de prova final.
- Remove `convertCalendarV2` e `convertCalendarV3` (§10, decisão 4), o caminho v2 de `editor-session.ts`, `organizationForModality` com recurso a `regime`, a barreira 409 de v2 e o predicado `isStructured`. Esvazia `pending`.

### 6.4 Ensaio e verificação

1. Backup integral com Storage, fora do Git, como em [migração de schema](migracao-schema.md).
2. Restaurar num backend descartável, publicar A, aguardar as migrações e publicar B.
3. Verificador próprio para v4 em `scripts/administration/` (as ferramentas de `migration/canonical.ts` só aceitam v1/v2). Para cada calendário, comparar backup × migrado **pelo domínio**:
   - mesmas datas de períodos e eventos e mesmos `requirementId`;
   - mesma contagem de dias por oferta e mesmos diagnósticos;
   - mesma lista de requisitos e aplicabilidade por oferta;
   - mesma `baseIdentity` e mesma janela;
   - mesma prontidão, salvo os avisos novos esperados (escopo por oferta) e a retirada exata do impedimento global de confirmação da Resolução 292 prevista na §4. O verificador só aceita essa retirada se nenhuma oferta não excluída sustentar a pendência; todos os demais impedimentos e avisos são comparados. `ready` só pode mudar como consequência dessa retirada, além do efeito isolado do expurgo explicitamente descrito a seguir;
   - **Expurgo dos pareceres (esclarecimento aprovado por unanimidade do painel em 29/10/2026):** congelar, com a fonte anterior exata, duas prontidões completas por calendário: a real, com os pareceres do backup, e outra cujo único argumento alterado seja `reviews: []`. Preservar ambas, sua proveniência e o delta completo de impedimentos, avisos, `ready` e `humanReview`. A comparação da conversão v4 usa a segunda projeção integralmente, com apenas as exceções específicas acima; a primeira demonstra separadamente o efeito exclusivo do expurgo já autorizado. Não se descartam campos humanos nem se aceitam diferenças genéricas. No primeiro backup do ensaio, nenhum dos quatro pareceres era atual; dois tinham norma preenchida, e o expurgo acrescenta exatamente essa pendência em dois calendários, sem mudar `ready` nem `humanReview`. Qualquer diferença adicional exige investigação. O oráculo e os recibos anteriores permanecem imutáveis; a captura corrigida é um recibo separado, produzido somente pela fonte anterior;
   - todo campo v3 com destino v4 ou derivação documentada (§3.3);
   - cinco tabelas vazias (`calendarVersions`, `calendarSnapshots`, `reviews`, `reviewVersions`, `calendarAliases`); demais com as mesmas contagens do backup.
4. Contar no ensaio quantos v2, órfãos (inclusive linhas de `calendars` sem conteúdo), calendários sem etapas e combinações semestral + 3 etapas existem. Contar também o uso de cada legado da §11.6: calendários com `year ≤ 2026`, decisões operacionais `legacySecondSemesterIntake` preservadas, eventos com `recordType` diferente de `event`, eventos com `requirementId` das linhas de vínculo legado, campus e calendário residuais de release (§11.6).
5. Recibo e relatório fora do Git, sem dados pessoais. Registrar a operação em `migracao-schema.md`.

## 7. Testes

- **Domínio:** `convertCalendarV3` para v3 anual, semestral, misto, `a-classificar`, sem etapas, combinado, pós-graduação, `own-regulation`, v2 pendente e v2 combinado com `legacySecondSemesterIntake`. Propriedade: contagem, diagnósticos, requisitos, aplicabilidade, `baseIdentity`, janela e prontidão iguais antes e depois.
- **Exceções de compatibilidade aprovadas:** matriz do indicador de ingresso de 2026 (`false`/`true`/ausente) e derivação por oferta; pós-graduação isolada com escopo antigo ausente, `covered` e `own-regulation`, comparando todos os impedimentos e retirando somente o de confirmação residual; calendário misto ainda exige confirmação de cada oferta não excluída. Esses casos integram o aceite de M2 e a verificação de M7.
- **Melhoria 04 (critério de aceite):** criar, salvar, recuperar e comparar (1) graduação anual, (2) graduação semestral, (3) graduação anual com 3 etapas trimestrais e (4) as três no mesmo calendário, com `label`s distintos. No caso 4: eventos institucionais de graduação aplicados às três; requisitos `stage-n:graduacao-2` gerados e reconhecidos.
- **Etapas por ciclo (retorno de campus):** semestral com 2 etapas por semestre mostra 1ª e 2ª etapa em cada semestre e grava `stage-1..4`; semestral com 1 por semestre grava `stage-1..2`; etapa fora do período do seu semestre é recusada; migração de semestral com 2, 3 e 4 etapas no ano; anual com 2, 3 e 4 inalterado.
- **Convex (`convex-test`):** migrações idempotentes e retomáveis; lixeira; expurgo restrito às cinco tabelas; barreira 409; `calendars.offerKinds` gravado e `modalities` retirado.
- **Políticas:** `rules-view.test.ts`, `ruleset-history.test.ts`; `countingMinimums` com `basis` e valores inalterados.
- **Navegador:** segunda oferta de graduação com outra organização; etapas; escopo por oferta; impressão; parecer num calendário migrado.
- **Validação:** durante o desenvolvimento, typecheck, lint e testes direcionados. Antes de cada commit publicado, `pnpm check`, como exige [verificação](verificacao.md), com confirmação prévia de quem mantém o projeto.

## 8. Ordem de implementação

Visão resumida; os marcos executáveis, com critério de pronto e pontos de revisão, estão na §11.3.

1. **Domínio isolado:** tipos v4, `kind`/`id`, derivações (§3.3), `stageCycle(offer)`, `convertCalendarV3` e testes de equivalência. Um adaptador v3 → v4 no limite do domínio permite que o resto do código migre aos poucos sem ramo longo.
2. **Domínio por oferta:** `organization/`, `activities/`, `counting/`, `diagnostics.ts`, `readiness.ts`, `base.ts`, `prepare-save.ts`, `normalization/`, `commands/`, `printing/`, `reviews/technical-support.ts`, `institution/catalogue.ts`.
3. **Políticas:** novo contrato, `basis`, `excludes(offer)`, janela por oferta, entrada `editorial`.
4. **Convex (release A):** validadores literais (legado e v4), leitura com conversão, gravação v4, barreira 409, contratos, migrações e contadores.
5. **Interface (na mesma release A):** criação com lista de ofertas; formulário de oferta (tipo, rótulo, modo, organização, etapas, base); escopo e ingresso por oferta; `/regras`; seletores de oferta; parâmetros de URL.
6. **Verificador, ensaio, produção (A), estreitamento (B).**
7. **Documentação:** `arquitetura-convex.md` (id × tipo), `migracao-schema.md` (registro da operação), `uso.md`.

## 9. Riscos

| Risco                                     | Mitigação                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Expurgo irreversível                      | Backup integral com Storage; ensaio em backend descartável; recibo                                |
| Mudança silenciosa de obrigações          | Princípio "sem mudança de regra"; verificação por domínio em todos os calendários reais no ensaio |
| `id` confundido com tipo                  | Separação explícita (§3.1); caso 4 da Melhoria 04 em teste e no navegador                         |
| Clientes antigos entre backend e promoção | Barreira 409; recarga pelo `UpdateProvider`; publicar fora do horário de uso                      |
| Estreitamento arrasta snapshots           | Validadores literais na release A                                                                 |
| Mutação de migração excede limites        | `batchSize` pequeno; contadores incrementais; retomada testada                                    |
| Mudança grande e longa                    | Adaptador no limite do domínio; etapas 1–3 sem mudar a interface                                  |

## 10. Decisões (29/10/2026)

1. **Modo de oferta:** ofertas migradas recebem `delivery: 'a-conferir'`, sem inferência. O campo é informativo: não entra na prontidão, na aplicabilidade nem na contagem até que uma política dependa dele.
2. **Tipos de oferta:** a união `OfferKind` fica com os quatro tipos atuais. `concomitante`, `proeja` e `fic`/qualificação entram só quando houver norma configurada para eles, cada um com sua alteração de política.
3. **Limite:** até 12 ofertas por calendário (`calendarLimits.maximumOffers`).
4. **Importação de cópias antigas** (revista em 29/10/2026): a importação aceita **só formato 4**. Cópias anteriores também são dados de teste; os conversores existem apenas para a migração e saem na release B.
5. **Mudanças de regra adiadas**, cada uma com entrada própria no conjunto de regras e fora deste plano: mínimo só da organização; exigências por modo EaD.
6. **Etapas por ciclo** (retorno de campus): a quantidade é escolhida depois da organização e por ciclo (§3.4). Semestral com 3 etapas no ano deixa de ser representável. Na migração, essas ofertas ficam com etapas a definir, e o ensaio conta quantas existem.

7. **Etapas na organização semestral:** 1 ou 2 por semestre (confirmado em 29/10/2026). Três por semestre não é admitido.

## 11. Guia de execução (handoff)

Esta seção orienta o agente que implementa o plano. As §1–§10 dizem **o que** fazer; esta diz **como conduzir** o trabalho.

### 11.1 Antes de começar

Ler, nesta ordem: `CLAUDE.md`, `AGENTS.md`, `convex/_generated/ai/guidelines.md` (obrigatório antes de qualquer código em `convex/`), [arquitetura](arquitetura-convex.md), [migração de schema](migracao-schema.md), [verificação](verificacao.md) e este plano inteiro.

A execução é **de ponta a ponta e autônoma**: o agente principal implementa, subagentes revisam (§11.7) e ninguém espera intervenção humana até o relatório final. Trabalhar numa branch própria (`ofertas-v4`); para cada release, integrar em `main` por fast-forward e fazer push, como exige `pnpm deploy:production`. Fazer um commit por marco, com mensagem em português no estilo do repositório ("Separa a identidade da oferta do seu tipo", verbo na 3ª pessoa).

**Pré-requisitos do ambiente**, conferidos pelo agente no início. A falta de algum é o único motivo para encerrar antes de começar, com relatório.

- **Release (CLI, sem navegador):** `pnpm deploy:production` autentica só pela Convex CLI e pelo `VERCEL_TOKEN`. Conferir: `pnpm exec convex run --prod operations:status` responde sem manutenção; `.vercel/release.env` com permissão `600`, pasta de backup `700` existente e token aceito pela API da Vercel para o projeto (`GET /v9/projects/{projectId}?teamId={orgId}` → 200, ids em `.vercel/project.json`), sem exibir o token.
- **Ferramentas:** Codex CLI autenticado (`codex login status`); navegadores do Playwright instalados; `main` sem commits locais pendentes de push e permissão de push em `origin`.
- **Navegador (Claude in Chrome, navegador do responsável):** extensão conectada (`list_connected_browsers`). Usos: (1) conferir o portal de produção depois de cada release, com uma sessão do portal já aberta no Chrome; (2) renovar o login da Convex CLI, se expirar, pelo fluxo de dispositivo, com o dashboard do Convex já logado no Chrome; (3) consultar deployments no dashboard da Vercel, com uma conta que enxergue a equipe `dentec-proens`. O agente não digita senhas nem aprova OAuth: se uma dessas sessões não estiver aberta, o uso correspondente é substituído (conferência do portal pelos testes Playwright contra o domínio público; Vercel pela API com o token) e o fato é registrado no diário. Só a falta de login da Convex CLI, sem sessão no Chrome para renová-lo, impede o início.

### 11.2 Operação em produção e limites

O agente **pode operar em produção** (autorização do responsável, 29/10/2026), inclusive publicar releases, executar migrações e consultas e apagar dados previstos no plano. A rede de segurança é o backup integral, por isso:

- **Antes de qualquer escrita em produção**, gerar um backup integral com Storage e conferir que ele restaura num backend descartável (é o próprio ensaio do M7). Sem backup conferido, nada é escrito em produção. O backup de produção é feito imediatamente antes da release A, para que uma restauração não perca trabalho recente.
- **Publicar só por `pnpm deploy:production`**, o fluxo único de release do projeto ([implantação](implantacao-convex-vercel.md)). Não usar `npx convex deploy` diretamente.
- **Produção só depois de um ensaio limpo** e do go unânime do painel (§11.7). Divergência no ensaio significa não publicar.
- Se a verificação pós-migração falhar, restaurar o backup e conferir a restauração (§11.7). Dados criados depois do backup se perdem numa restauração; por isso a janela entre backup e operação deve ser curta.
- **Não** apagar nem editar diretórios `backup-*`.
- **Não** alterar obrigações, mínimos ou aplicabilidade (princípio do plano). Se um teste de equivalência falhar, corrigir o código, nunca o teste esperado, e reportar o caso.
- Validação: typecheck, lint e testes direcionados durante o trabalho; `pnpm check` completo **sem pedir confirmação** antes de cada integração em `main` (esta autorização prevalece, neste plano, sobre a preferência de não rodar a suíte completa).
- Nenhuma pausa para aprovação humana: os portões da §11.7 substituem a revisão do responsável.

### 11.3 Marcos

| Marco                                 | Entrega                                                                                                                                                                                                                                                                                                                                          | Pronto quando                                                                                                                                                                                                           | Portão (§11.7)                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **M1. Modelo v4**                     | Tipos `CalendarOffer`/`OfferKind`, `kindOf`/`levelOf`, `offerLabel`, derivações da §3.3, `stageCycle(offer, n)`, `stageInTerm(n, perTerm)`, `convertCalendarV3` (sobre `convertCalendarV2`), `calendarLimits.maximumOffers = 12`. Sem mudar persistência nem telas.                                                                              | Testes unitários do conversor para todos os casos da §7, incluindo semestral com 2, 3 e 4 etapas e calendário sem etapas. Typecheck limpo.                                                                              | Revisão de conformidade e de modelo                                      |
| **M2. Domínio por oferta**            | `organization/`, `activities/` (incluindo `requirement-table.ts` e `assessment-intervals.ts`), `counting/`, `diagnostics.ts`, `readiness.ts`, `base.ts`, `prepare-save.ts`, `normalization/`, `commands/`, `institution/catalogue.ts`, `reviews/technical-support.ts`. Um adaptador v3 → v4 na entrada do domínio mantém o restante funcionando. | Teste de equivalência (§6.4) verde sobre as fixtures de calendário existentes em `test/`: contagem, diagnósticos, requisitos, aplicabilidade, `baseIdentity`, janela e prontidão iguais. Testes de domínio atualizados. | Revisão de conformidade e de equivalência                                |
| **M3. Políticas**                     | Novo contrato (§4), `basis` nos mínimos, `excludes(offer)`, janela por oferta, nomes das etapas por ciclo, entrada `editorial` (§11.4). `legacy-2026.ts` e `unconfigured.ts`.                                                                                                                                                                    | `rules-view.test.ts` e `ruleset-history.test.ts` verdes; mínimos com os mesmos valores.                                                                                                                                 | Revisão de conformidade e de equivalência                                |
| **M4. Impressão e regras**            | `src/printing/` (etapas agrupadas por semestre, ofertas por `offerLabel`) e o modelo da página `/regras`.                                                                                                                                                                                                                                        | Testes de impressão e de `rules-view` atualizados.                                                                                                                                                                      | Revisão de conformidade                                                  |
| **M5. Convex**                        | Validadores literais (legado, v4, histórico), contratos a partir de `contentStateV4.fields`, leitura com conversão, gravação v4, barreira 409, migrações `purgeReviews`/`purgeHistory`/`purgeAliases`/`contentsToV4` com contadores, cópia exportada e importação só em formato 4, `calendars.offerKinds`.                                       | `convex-test`: migrações idempotentes e retomáveis, lixeira, expurgo restrito às cinco tabelas, barreira 409, critério de aceite da Melhoria 04 (casos 1–4) salvando e recuperando.                                     | Revisão de conformidade e revisão Convex                                 |
| **M6. Interface**                     | Criação de calendário por ofertas, `OfferOrganizationForm` (§5), escopo e ingresso por oferta, seletores de oferta em períodos e eventos, parâmetros de URL, `webmcp.ts`.                                                                                                                                                                        | Playwright: caso do retorno de campus (semestral, 2 por semestre), três graduações no mesmo calendário, impressão. Desktop e mobile.                                                                                    | Revisão de conformidade e de interface                                   |
| **M7. Ensaio e produção (release A)** | Verificador em `scripts/administration/` (§6.4) e consulta interna `legacy:usage` (contagens da §11.6). Backup integral de produção com Storage; restauração e ensaio completo em backend descartável; se limpo, publicação da release A em produção e verificação pós-migração com o mesmo verificador.                                         | Ensaio e produção sem divergências (contagens de v2, órfãos, etapas a definir e avisos novos registradas no relatório); `legacy:usage` executada em produção depois da migração.                                        | Painel go/no-go antes de produção; verificação pós-migração              |
| **M8. Release B**                     | Estreitamento do schema e remoção do código de compatibilidade (§6.3); publicação em produção por `pnpm deploy:production`; atualização de `migracao-schema.md`.                                                                                                                                                                                 | Deploy aceito pela validação de schema do Convex; testes verdes.                                                                                                                                                        | Revisão de conformidade; painel go/no-go                                 |
| **M9. Limpeza de legado**             | Remoção de cada item da §11.6 cuja condição a `legacy:usage` de produção (M7) confirmar; item com uso real fica, registrado no relatório com o motivo. Publicação em produção.                                                                                                                                                                   | Nenhuma referência restante ao item removido (código, testes, docs, `package.json`); testes verdes; release aceita pelo schema.                                                                                         | Revisão de conformidade; painel go/no-go; revisão final do diff completo |

### 11.4 Especificações de implementação

- **Id de oferta nova:** o próprio `kind`, se livre; senão `${kind}-${n}`, com o menor `n ≥ 2` que não aparece em nenhuma oferta, associação de período, `events[].offers` nem sufixo de `requirementId` do calendário. Ids nunca são reaproveitados enquanto houver referência.
- **`label`:** obrigatório quando duas ofertas têm o mesmo `kind`; único no calendário; até `calendarLimits.maximumTextLength`.
- **Remoção de oferta:** continua proibida, como hoje (`prepare-save.ts:22`). Uma oferta ainda não salva pode ser descartada no próprio formulário. A remoção de oferta salva é funcionalidade futura, fora deste plano.
- **Mudança de organização ou de etapas** de uma oferta existente: mantém as salvaguardas atuais de `offers.ts` (ingresso exigido, atividades vinculadas, editais ligados a períodos), agora por oferta. Ao reduzir `perTerm`, os eventos `stage-n` excedentes perdem o vínculo, como já ocorre hoje ao reduzir a contagem.
- **`perTerm` no validador Convex:** `v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4))`. A combinação com a organização (anual: 2–4; semestral: 1–2) é conferida no domínio, com mensagem em português.
- **Criação do calendário (`CreateCalendarForm`):** o select único "Organização do calendário" (`regime`) é substituído por uma lista de ofertas, cada uma com tipo, organização e rótulo (obrigatório só para tipo repetido). Pelo menos uma oferta. Etapas, modo e escopo são definidos depois, no editor. `createInput` passa a receber `offers`.
- **Cópia exportada ("Baixar cópia", `CalendarEditorLayout.tsx`):** passa a gravar `schemaVersion: 4`. A importação aceita só formato 4; arquivos 2 ou 3 são recusados com "Esta cópia foi gerada por uma versão anterior do sistema e não pode mais ser importada." (§10, decisão 4).
- **Entrada no conjunto de regras:** `consup-292-2027-v3`, `effect: 'editorial'`, data da integração, fonte "Decisão da gestão do sistema após retorno de campus", resumo "Atividades aplicadas por oferta; etapas de avaliação numeradas por ciclo da organização. Sem mudança de obrigações."
- **Eventos institucionais:** seguem cadastrados por tipo (`institutionalEvents.modalities` não muda). Ao incorporar, um evento de tipo `graduacao` vale para todas as ofertas daquele tipo (`events[].offers` com seus ids).
- **Fixture de referência:** criar em `test/` um calendário v4 com integrado anual (4 etapas), graduação anual (3 etapas, "Licenciatura em Química"), graduação semestral (2 por semestre, "Engenharia Elétrica") e graduação semestral (1 por semestre, "Tecnologia em Análise de Sistemas"), usado nos testes de domínio, Convex e navegador. A semente de desenvolvimento (`devSetup.ts`) só cria eventos institucionais e não precisa mudar.

### 11.5 Registro e relatório final

O agente mantém um diário em `docs/execucao-ofertas-v4.md` (no Git, sem dados pessoais): por marco, o que mudou, testes executados e resultado, achados dos portões e como foram resolvidos, decisões do painel e desvios do plano. Desvios no modelo ou nas regras exigem atualizar este plano no mesmo commit, aprovados pelo painel (§11.7).

Ao terminar (sucesso ou interrupção), o relatório final no diário resume: estado da produção, contagens do ensaio e da migração, legados removidos e mantidos, testes, e qualquer item que tenha ficado pendente.

### 11.6 Legado a remover no M9

| Item                                                   | Onde                                                                                                                                                                                                                         | Condição para remover                                                                                                                                     | Se a condição falhar                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Política de 2026                                       | `policies/legacy-2026.ts`, `registry.ts`, campo v4 `legacySecondSemesterIntake` e seus validadores/derivações                                                                                                                | Nenhum calendário com `year ≤ 2026`                                                                                                                       | Manter; registrar quantos e de quais campi                                                        |
| Quantidade antiga com organização pendente             | `CalendarOffer.legacyStageCount`, validadores, derivações e preservação por oferta                                                                                                                                           | Nenhuma ocorrência em conteúdos correntes (incluindo lixeira e órfãos) nem snapshots históricos; inventário registra ofertas e distribuição 2/3/4         | Manter; o primeiro ensaio contém 26 ofertas em 14 calendários                                     |
| Tipos de registro `prior-reference` e `retired-stage`  | `model.ts:38`, `activities/validation.ts`, `validators.ts`, impressão                                                                                                                                                        | Nenhum evento com `recordType` diferente de `event`                                                                                                       | Manter                                                                                            |
| Linhas "vínculo legado conservado" na política de 2027 | `consup-292-2027.ts` (`legacy`), `operational-checklist.ts`                                                                                                                                                                  | Nenhum evento com `requirementId` dessas linhas                                                                                                           | Manter; listar os IDs em uso                                                                      |
| Redirecionamento de URLs antigas                       | tabela `calendarAliases` (esvaziada por `purgeAliases` na release A), `calendars.ts:77`                                                                                                                                      | Remover em qualquer caso (alpha): links anteriores aos IDs nativos deixam de abrir                                                                        | —                                                                                                 |
| Resíduos de uma release antiga em produção             | Campus cujo nome começa com "Operação de publicação release-" e seu "Calendário 8700" (`calendars` e `calendarContents`)                                                                                                     | Identificados pela `legacy:usage` (nome do campus e `year` fora de `calendarLimits` usual); nenhum usuário com esse `campusId` além de contas de operação | Se houver usuário real ligado ao campus, apagar só o calendário e registrar o campus no relatório |
| Ferramentas das migrações v1/v2                        | `migration/`, `scripts/migrate-data.ts`, `scripts/canonical-check.ts`, `scripts/canonical-runtime-check.ts`, `test/tooling/` correspondentes, scripts do `package.json`, seção "Fluxo da ferramenta" de `migracao-schema.md` | O verificador do M7 não depende delas                                                                                                                     | Remover só as partes específicas de v1/v2 e manter o que o verificador usa                        |

Os resíduos de dados são apagados por uma mutação interna de uso único, com evento em `audit` (`PURGE_RELEASE_RESIDUE`), retirada do código no mesmo marco depois de executada. Os registros de `audit` que os citam são mantidos.

Remover um item inclui o código, os testes, os validadores, a documentação e os scripts que só existem por ele. O histórico do Git preserva o código, como nas operações anteriores. `migracao-schema.md` ganha uma seção curta registrando o que foi retirado.

### 11.7 Portões de revisão e painel de julgadores

**Portão de marco.** Ao concluir cada marco, com testes direcionados verdes, o agente principal dispara revisores **subagentes de contexto limpo** (não reaproveitar o contexto de quem implementou). Cada revisor recebe o plano, o diff do marco e seu foco:

| Revisor      | Foco                                                                                                                                       | Marcos |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Conformidade | O diff cumpre o marco e o plano; nada fora do escopo; nenhuma regra alterada                                                               | Todos  |
| Modelo       | Separação id × tipo, etapas por ciclo, derivações da §3.3                                                                                  | M1     |
| Equivalência | Requisitos, aplicabilidade, mínimos, contagem, `baseIdentity` e janela iguais nas fixtures                                                 | M2, M3 |
| Convex       | `convex/_generated/ai/guidelines.md`, validadores, limites de transação, idempotência das migrações, autorização (skill `convex-reviewer`) | M5, M7 |
| Interface    | Fluxos do retorno de campus, desktop e mobile, textos em português                                                                         | M6     |

Os achados vêm classificados em **bloqueante**, **importante** ou **sugestão**, cada um com arquivo:linha e evidência. O agente corrige bloqueantes e importantes, roda os testes e reenvia **só os achados corrigidos** ao mesmo revisor. O portão passa quando não resta bloqueante nem importante aberto. Sugestões ficam registradas no diário.

**Painel de julgadores.** Três julgadores independentes: dois subagentes de contexto limpo e o Codex CLI em modo somente leitura (`codex exec -s read-only`), para diversidade de modelo. Cada um recebe a pergunta, o plano e as evidências, e vota sem ver os outros votos. O painel é usado:

1. **Divergência:** o agente discorda de um achado ou o revisor não aceita a correção. Decide a maioria.
2. **Desvio do plano:** qualquer mudança de modelo, regra ou escopo. Decide a maioria; se aprovada, o plano é atualizado no mesmo commit.
3. **Go/no-go de produção** (M7, M8, M9): os julgadores recebem relatório do ensaio ou dos testes, diff e verificação. Exige **unanimidade** para publicar.

**Limites dos ciclos.** No máximo três rodadas de correção por portão e uma rodada do painel por questão.

**Sem aprovação no limite.**

- Antes de produção: não publicar. Registrar no diário o motivo e os achados, e encerrar com o relatório final; o código fica na branch.
- Depois de publicar (verificação pós-migração falhou): restaurar o backup com Storage do M7, conferir a restauração com o verificador e encerrar com o relatório final.

**Revisão final.** Depois do M9, uma revisão completa do diff `main` anterior → `main` final, com o mesmo formato, antes do relatório final.
