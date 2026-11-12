# Atividades que não constituem dia letivo

## Base legal

A Resolução CONSUP/IFPR nº 292/2026 (calendário de referência 2027), art. 5º, define dia letivo
como o dia fixado no calendário para atividades de ensino, pesquisa, extensão e inovação previstas no
PPP, no PPC e nos planos de ensino. O parágrafo único exige que essas atividades prevejam “a efetiva
participação de professores e estudantes”.

Atividades exigidas pela policy sem essa participação — conselho de classe, reunião com familiares,
responsáveis e comunidade, formação pedagógica, entre outras — não constituem dia letivo.

## Problema

Hoje essa regra não existe no código:

- Toda data nova de atividade começa com `effect: 'note'` (`activityDraft` em
  `web/features/calendar-editor/events/event-draft.ts`). No grupo “Efeito na contagem” é possível
  trocar para “Acrescenta à contagem” ou “Retira da contagem”, e o servidor aceita salvar.
- As regras em `src/domain/policies/consup-292-2027/requirements.ts` declaram base legal, ofertas,
  critério do parecer e grupo, mas nada sobre dia letivo.
- As validações de efeito em `validateActivityRecord` (`src/domain/calendar/activities/validation.ts`)
  são todas gerais, sem depender da atividade: data fora do ano → `note`; publicação de edital →
  `note`; prorrogação municipal → `exclude`; `include` → só dentro de período letivo. Fora dela, data
  interna (art. 18) exige `note` (`internal-dates.ts`).
- A página Regras do calendário (`web/features/rules/`) não menciona o conceito.

### `note` não impede a contagem

O efeito `note` não significa “não conta”: significa que o dia segue a semana normal de aulas. Em
`countCalendar` (`src/domain/calendar/counting/core.ts`):

```ts
const counted = (ordinary || additions.length > 0) && blockers.length === 0;
```

Um conselho de classe numa quarta-feira dentro do período, salvo com `note`, conta como dia letivo
pela semana normal. Restringir essas atividades a `note` (primeira versão deste plano) proibiria o
único efeito que tira o dia da contagem e deixaria o caso errado passar em silêncio.

## Consequências do art. 5º no modelo

1. **A atividade nunca é a razão de o dia contar.** Efeito `include` é proibido: um conselho num
   sábado não vira sábado letivo.
2. **Em dia de aula, as aulas são mantidas, salvo indicação em contrário.** Marcar um conselho numa
   terça-feira não diz que a terça deixa de ter aula: é um dia regular, e o dia é letivo pelas aulas
   (`note`). Só quando o campus declara que as aulas são suspensas para a atividade o efeito passa a
   `exclude`, com escopo só nas ofertas atingidas. A suspensão é a exceção, informada pelo campus;
   o sistema nunca a presume.

A categoria (cor da legenda) é independente do efeito: um conselho com `exclude` continua `conselho`
na impressão, o que está correto. A impressão se guia pela categoria e não muda.

## Três naturezas de atividade

A consequência 2 só faz sentido para atividades que ocupam um dia. Prazos, janelas e marcos são
intervalos de semanas: perguntar se “as aulas são suspensas” convidaria a retirar semanas inteiras da
contagem (já há na fixture `test/fixtures/stored/contents.json` um `diary` com `exclude` de um mês).
Por isso há três naturezas:

| Natureza                                                                 | Atividades (consup-292-2027)                                                                                                                                                                                | `include` | Editor                                                             |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------ |
| **Letiva** — pode tornar o dia letivo quando houver participação efetiva | `campus-events`, `internship-event`, `robotics`, `course-showcase`, `women-week`, `ethics-week`, `cultural-week`                                                                                            | permitido | três efeitos, como hoje                                            |
| **Reunião** — ocupa o dia, sem estudantes                                | `council`, `extraordinary-council`, `pedagogical-meeting`, `family-meeting`, `alumni-meeting`, `pedagogical-training`, `collective-planning`                                                                | proibido  | aulas mantidas (`note`) por padrão; suspensão como opção explícita |
| **Prazo ou marco** — padrão de toda atividade não listada                | `stage`, `results`, `final`, `diary`, `pit`, `rit`, `teaching-plan`, `recognition`, `final-appeal`, `enrolment`, `adjustment`, `withdrawal`, `registration`, `admission-notice`, `regular-admission-notice` | proibido  | `note` marcado; grupo de efeito sem “Acrescenta à contagem”        |

“Letiva” é elegibilidade, não garantia: o campus usa `include` só quando a ocorrência tiver
participação efetiva de professores e estudantes.

Decisões da gestão do sistema (03/11/2026): encontro de egressos, formação pedagógica e planejamento
coletivo não constituem dia letivo; a fase local da OBR (`robotics`) é letiva. O encontro de egressos
não decorre só do texto do art. 5º, por isso a decisão é registrada no histórico das regras.

O padrão “prazo ou marco” é deliberado: uma atividade nova acrescentada à policy nasce sem poder
tornar o dia letivo, como pede o art. 5º.

## Proposta

A classificação pertence à policy: o que é dia letivo vem da resolução, e a classificação de cada
atividade é interpretação versionada como as demais.

1. **Declaração na policy** (`CalendarPolicy` em `src/domain/policies/contract.ts`): novo campo
   opcional, no padrão de `countingMinimums`:

   ```ts
   schoolDay?: {
     basis: string;
     /** Activity IDs that may make a day a school day. */
     schoolDayActivities: readonly string[];
     /** Activity IDs that take a day without students: classes kept or suspended. */
     meetings: readonly string[];
   };
   ```

   A 292 declara `basis: 'Art. 5º, parágrafo único, da Resolução CONSUP/IFPR nº 292/2026'`. A consulta
   é por `activityId` do vínculo, sem passar pela linha expandida. Assim, `ActivityPlanItem`,
   `expandRule` e o catálogo não mudam, o teste congelado de `ruleset-history.test.ts` continua
   valendo, e um vínculo a uma oferta removida não cai em “prazo” por não achar a linha. **Policy
   sem o campo não restringe nada** (`unconfigured.ts` e anos sem regras aceitam qualquer efeito).

2. **Predicado único** (novo `src/domain/calendar/activities/school-day.ts`):
   `schoolDayNature(policy, event)` devolve `'school-day' | 'meeting' | 'deadline' | undefined` e
   `schoolDayIssue(state, event)` devolve a mensagem com a base legal, ou `undefined`. Validação,
   pendência, editor e página de regras consomem só esse módulo.
   - Data com atividade: natureza pelo `activityId`.
   - Data do campus sem atividade nas categorias `conselho` e `formacao`: natureza `meeting`, que por
     definição não é atividade com estudantes.
   - Incidência por oferta: a regra vale quando ao menos uma oferta do escopo está coberta pela
     norma (não excluída e sem `own-regulation`), porque o `include` contaria para essa oferta.
3. **Fora de `validateActivityRecord`.** A avaliação de cobertura (`plan-evaluation.ts`) chama
   `validateActivityRecord` e descarta o registro inválido; `minHours` soma só os válidos. O efeito
   errado é problema de contagem, não de cobertura: a atividade aconteceu e as horas de formação
   continuam comprovadas. Por isso `schoolDayIssue` fica separado e não entra na cobertura.
4. **Rejeição só em data nova ou alterada.** A normalização revalida todas as datas a cada salvamento
   (`normalize.ts`, laço que chama `validateActivityRecord` com `old`). Chamar `schoolDayIssue` ali
   para todas travaria qualquer edição de um calendário com um registro antigo, e com dois registros
   antigos corrigir um falharia pelo outro. Rejeitar com `DomainError` só quando a data é nova ou
   `effect`, `activity` ou `category` mudaram em relação a `old`, no mesmo espírito de
   `stageInterval`. Como passa pela normalização, a regra vale no salvamento Convex
   (`convex/calendars.ts`).
5. **Prorrogação municipal.** O editor oferece `deadlineExtensionCause` em qualquer `exclude`
   (`EventEditor.tsx`), e a causa estende prazos de verdade (`deadlines.ts`). Um conselho com aulas
   suspensas não é feriado nem recesso: esconder o seletor e rejeitar a causa em data com atividade,
   também só em data nova ou alterada.
6. **Pendência para registros existentes** (`readiness.ts`, grupo `dates`, alvo na data): para toda
   data com `schoolDayIssue`, um `issue` (bloqueante, porque a contagem está errada), sem erro ao
   carregar e sem correção silenciosa. Cobre registros antigos, novas versões de calendário publicado
   e restauração da lixeira, que preservam o conteúdo sem revalidar. Registros com `note` estão
   corretos: significam aulas mantidas, que é o padrão.
   A pendência vale também para data em “Vínculo a conferir”: a correção do vínculo recusa o
   efeito, e sem a pendência o campus não saberia que precisa trocá-lo primeiro.
7. **Editor** (`EventEditor.tsx`, `activityDraft`):
   - **Reunião:** o rascunho continua com `effect: 'note'`. No `<details>` “Categoria e efeito”, o
     grupo de três efeitos dá lugar a duas opções no vocabulário da atividade, com a primeira
     marcada:
     - “Aulas mantidas — o dia segue a semana normal de aulas” → `note`;
     - “Aulas suspensas para esta oferta — o dia deixa de contar” → `exclude`.
       O resumo do `<details>` fechado mostra “Aulas mantidas” ou “Aulas suspensas” no lugar de “Sem
       efeito na contagem” e “Exclui dias letivos”, que descrevem mal uma reunião em dia de aula. Ajuda
       curta citando o art. 5º e orientando a criar outra data se a suspensão for do campus todo.
   - **Prazo ou marco:** `note` marcado como hoje; o grupo de efeito não oferece `include`.
   - Um `include` salvo, ou mantido ao trocar a categoria para conselho ou formação, não é trocado
     em silêncio: um aviso “Efeito a corrigir” mostra o motivo até outro efeito ser escolhido.
   - A prorrogação municipal não é oferecida em reunião, com ou sem atividade.
   - Ofertas fora da norma (excluídas ou de norma própria) mantêm os três efeitos.
   - **Letiva:** sem mudança.
8. **Página Regras do calendário** (`rules-view.ts`, `RulesPage.tsx`), só quando a policy declara
   `schoolDay`:
   - em `details` das atividades de reunião e de prazo: “Não constitui dia letivo (Art. 5º,
     parágrafo único).”;
   - um bloco curto “O que conta como dia letivo”, antes de “Mínimos de dias letivos”: semana normal
     de aulas, inclusões e exclusões, a regra do art. 5º e a diferença entre aulas mantidas (`note`) e
     suspensas (`exclude`).
9. **Versão das regras** (`history.ts`): `consup-292-2027-v5`, `effect: 'tightens'`, fonte “Art. 5º,
   parágrafo único, da Resolução 292 e decisão da gestão do sistema em 03/11/2026”, resumo citando a
   decisão sobre egressos, formação, planejamento e OBR. O catálogo não muda, então não há impressão digital
   nova (como na v4).

## Fora do escopo

- **Nomes livres.** Sábados letivos são datas livres com `include` e categoria `sabado`
  (`saturdays.ts`), e o catálogo institucional (`convex/catalogue.ts`) aceita efeito e categoria
  livres. Um “Conselho de classe” cadastrado como sábado letivo não é detectado: a regra vale para
  vínculos e categorias conhecidos e não infere pelo nome.
- **Turnos.** Se há aulas em algum turno com participação de estudantes, o dia é letivo para a oferta.
  O modelo de contagem é por dia e oferta, sem turnos.
- **Datas institucionais** (`institutionalSnapshot`) vêm da base da Proens e não passam por esta regra.
- **Semanas com `include`.** Um `include` de semana inteira conta sábado e domingo; o problema já
  existe hoje e merece aviso próprio.

## Testes

- Domínio (`school-day.ts`): natureza de cada atividade da 292; `council` com `include` tem
  problema citando a base, com `note` e `exclude` não; `campus-events` com `include` não tem; data do
  campus em `conselho` com `include` tem; policy sem `schoolDay` nunca tem; escopo só com ofertas de
  norma própria não tem.
- Normalização: data nova de reunião com `include` é rejeitada; calendário com registro antigo nessa
  situação salva quando se edita outra data; corrigir um de dois registros antigos salva;
  `deadlineExtensionCause` em data com atividade é rejeitado só quando nova ou alterada.
- Cobertura: formação com `include` antigo continua cobrindo a atividade e somando horas.
- Contagem: conselho com `exclude` numa quarta do período retira o dia só das ofertas do escopo;
  exclusão vence inclusão simultânea.
- Pendência: registro antigo com `include` em `family-meeting` aparece como `issue` em Conferir e enviar, sem
  erro ao carregar; `keptWithoutActivity` não é reavaliado.
- Página de regras: a linha de `council` mostra “Não constitui dia letivo”; a de `campus-events` não
  (teste de ausência justificado: a regra distingue as duas linhas). Atualizar a versão esperada em
  `test/browser/rules.spec.ts`.
- Navegador: em “Adicionar data” do conselho de classe, “Categoria e efeito” fechado resume “Aulas
  mantidas”; aberto, oferece só “Aulas mantidas” (marcada) e “Aulas suspensas para esta oferta”
  (teste de ausência justificado: a regra esconde “Acrescenta à contagem”). Escolher a suspensão salva
  `exclude` e não oferece prorrogação municipal. Os fluxos de `family-meeting` em
  `test/browser/editor-activity-flows.spec.ts` que salvam `note` sem mexer no efeito continuam
  válidos; ajustar só os seletores de `#event-effect` se o grupo mudar de id.
