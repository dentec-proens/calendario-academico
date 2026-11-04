# Evolução das regras e simplificação do modelo

Plano em elaboração. Passou por quatro revisões críticas independentes (duas do Codex CLI e duas do
Opus 5.5, em 04/11/2026), cujos achados estão incorporados aqui. Decisão da gestão do
sistema: **corte limpo**. O aplicativo está em alfa, os dados em produção podem ser alterados por
migração, e o código não sustenta formatos antigos nem estados de transição. O que a migração não
resolve sozinha é resolvido com regra determinística e perda declarada, não com código legado.

Decisões da gestão registradas (04/11/2026): a organização das ofertas a classificar é inferida
pelos períodos do calendário (regra 2 de B1); pareceres não são uma restrição, porque a tabela
`reviews` de produção estava vazia e qualquer parecer existente na data da migração é apagado por
ela.

## Situação

A arquitetura das políticas está bem resolvida no domínio: `CalendarPolicy`
(`src/domain/policies/contract.ts`) e `policyFor(year)` (`registry.ts`) concentram o que varia com
a norma; as atividades são declaradas como dados (`declareRules`/`expandRules` em
`src/domain/calendar/activities/rules.ts`); cada mudança é uma entrada datada e classificada em
`history.ts`, e a classificação (`establishes`, `tightens`, `relaxes`, `editorial`) decide a
equivalência entre versões conhecidas das regras (`reviewBoundary` em `registry.ts`). A identidade
da base depende também de eventos, documentos, ano e modalidades (`base.ts`).

O custo está fora do domínio: nos testes que comparam o catálogo com capturas congeladas, no
oráculo gravado, e no modelo de dados, que carrega estados de transição do formato 4 e campos de
uso raro.

### Custo de mudar uma regra

Em 04/11/2026, três mudanças de regra (v7, `7e1216b`; a mesma separação no catálogo operacional,
`08be502`; v8, `6f1b44f`) custaram poucas linhas de regra e, nos testes: um auxiliar manual novo em
duas delas (`split-withdrawal.ts`, 54 linhas; `optional-notice.ts`, 72), três linhas no auxiliar
existente na terceira, e a regravação do oráculo gravado: 276 a 1.330 linhas geradas por commit.

- **Onde estão as linhas.** O oráculo gravado (`test/helpers/stored-oracle.ts`) guarda a lista de
  atividades e uma linha de cobertura por atividade × oferta × documento. Uma atividade nova gerou
  62 blocos de cobertura em `7e1216b`. É esse o maior custo, e `UPDATE_STORED_ORACLE=1` é uma
  regravação ampla.
- **Tradutores de captura.** `test/domain/ruleset-history.test.ts` compara o catálogo atual com a
  captura da release A (`test/fixtures/ruleset-release-a-catalogues.json`);
  `test/domain/offers-equivalence.test.ts` e `test/domain/reported-stages.test.ts` comparam com o
  oráculo v3 e o de etapas legadas. Como as capturas nunca são editadas, cada mudança de regra
  ganha ou altera um auxiliar em `test/helpers/` (`legacy-classification.ts`,
  `declared-categories.ts`, `split-withdrawal.ts`, `optional-notice.ts`), encadeados em três
  testes. Os tradutores restringem o que pode mudar, o que é uma proteção real; o problema é que o
  código de tradução não tem teste próprio e cresce a cada versão.
- **Impressão do catálogo parada na v3, com ponto cego.** `catalogueFingerprints` registra o hash
  do catálogo expandido só até a v3. Observâncias e art. 5º têm impressões por versão (v4 a v8). As
  configurações de referência (`v4Settings`) usam só `delivery: 'a-conferir'`: o commit `5edda39`,
  que passou a deduzir a norma pelo modo de oferta, mudou aplicabilidade, janela e mínimos para
  ofertas presenciais e EaD sem que nenhum teste falhasse.
- **Dois catálogos com diferenças deliberadas.** A política de 2027
  (`consup-292-2027/requirements.ts`) e o catálogo operacional
  (`src/domain/calendar/activities/operational-checklist.ts`) declaram listas parecidas, mas não
  iguais: `teaching-plan` é por semestre de referência em 2027 e por ciclo no operacional;
  `enrolment`, `adjustment`, `withdrawal` e `component-cancellation` o contrário; `rit`,
  `regular-admission-notice` e `ethics-week` só existem em 2027; os ciclos do operacional vêm da
  organização global (`cyclesByRegime`). Um vínculo é válido pelo ID e pela base de repetição
  (`activityRef()`), e `test/domain/activity-ref.test.ts` exige que `teaching-plan` e `enrolment`
  existam nas duas bases. Unificar os catálogos é mudança funcional, fora deste plano.
- **Critérios do parecer remendados por texto.** `consup-292-2027/criteria.ts` parte da lista
  base de `src/domain/reviews/parecer-items.ts` (usada também pelos anos sem política) e a corrige
  com `replace('Art. 7º', 'Art. 11')` e `replaceAll('2026', '2027')`. A relação critério–regra é
  muitos-para-um (V, VII, XII, XIII); `minutes`, `II`, `III` e `IV` não têm regra; `XXVI` diz mais
  que a regra.
- **Sete campos de aplicabilidade.** `modalities` (injetado em toda linha de 2027 por
  `supportedKinds`), `optionalFor`, `offerId`, `offerIds` (também produzidos pela expansão),
  `intake`, `required` e `applicability`; `applicability()` em `requirements.ts` resolve a
  precedência, que é da política de 2027 e não está documentada.

### Conceitos e entidades do modelo

Levantamento sobre os 44 conteúdos de calendário em produção (04/11/2026, leitura só; 42 rascunhos
e 2 enviados; 23 sem versão de regras). O inventário completo, antes de migrar, cobre também os
envios (`calendarSubmissions`, mesmos validadores) e a lixeira, e as combinações listadas em Ordem e
verificação.

| Conceito                                                               | Em produção                                                       |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Organização `a-classificar` (oferta)                                   | 25 ofertas em 12 calendários; 13 delas com total `reported`       |
| Período sem associação (`a-classificar`)                               | 18 períodos em 9 calendários                                      |
| Posição `unclassified` de etapa                                        | 83 datas em 7 calendários                                         |
| `scope.confirmed: false`                                               | 192 datas em 26 calendários                                       |
| `deadlineAdjustment`                                                   | 0 (também na variante do snapshot institucional, nunca produzida) |
| `organizationBasis`                                                    | 0                                                                 |
| `targetDays`                                                           | 11 períodos                                                       |
| `offer.scope` explícito                                                | 9 ofertas (fica: é sobreposição deliberada de `delivery`)         |
| `intake`                                                               | 14 ofertas                                                        |
| `assessmentAutoStart`                                                  | 32 datas                                                          |
| `deadlineExtensionCause`                                               | 17 datas                                                          |
| `internal` (art. 18)                                                   | 4 datas                                                           |
| Escopo de data em três formas (`scope.offers`, `offers`, `modalities`) | as três                                                           |

No código, os estados de transição (`a-classificar`, `reported`, `unclassified` de posição,
`confirmed`, classificação legada) ocupam da ordem de 100 a 200 linhas de produção
(`readiness.ts`, `links.ts`, `organization/offers.ts`, `prepare-save.ts`, `stageOrdinal`,
`activityFromKey`) e muito mais nos testes: 53 arquivos de teste, 10 de navegador, 193 literais
`confirmed:`. `a-classificar` aparece ainda no contrato de criação (`contracts.ts`,
`calendars.ts`), como placeholder de oferta nova (`OfferOrganizationForm.tsx`), no `regime` do
parecer técnico via `organizationSummary([])` e na impressão. Dois estados ainda são produzidos
hoje: férias novas nascem com `confirmed: false` (`teacher-vacations.ts`), e “Classificação
pendente” em `links.ts` cobre também o vínculo que a organização atual deixou de gerar, situação
legítima após uma reorganização. `keptWithoutActivity` (`normalize.ts`, `validation.ts`) é a
isenção desse vínculo não gerado, não um estado de transição, e fica.

## Proposta

Cada item é um commit próprio, com typecheck, lint e testes afetados; `pnpm check` roda uma vez antes
de concluir cada fase da Ordem (`AGENTS.md`). A parte A não muda comportamento. A parte B muda dados e
comportamento, numa única release de formato, com o que muda e o que se perde declarado.

### Parte A: custo de mudar uma regra

#### A1. Precedência de aplicabilidade documentada e testada

1. Documentar em `requirements.ts`, junto de `applicability()`, a ordem aplicada pela política de
   2027: oferta excluída ou de norma própria → `unconfigured`; oferta **incompatível** com
   `modalities` (sempre presente: `requirements()` injeta `supportedKinds`), `offerId` ou
   `offerIds` → `optional`; **entrada presente** em `optionalFor` para o tipo da oferta, inclusive
   `''` → `optional`; `intake`: a chave é `requirement.term ?? 'annual'`; configuração ausente,
   `unknown`, `no` ou `yes` sem `required` → `optional`, `yes` com `required` → `required`, e o
   ramo encerra aqui; senão `applicability` ou `required`. No contrato, só registrar que a
   precedência é de cada política.
2. Teste de tabela com condições simultâneas: oferta excluída com `applicability: 'required'` →
   `unconfigured`; oferta fora de `offerIds` com ingresso obrigatório → `optional`;
   `optionalFor: { graduacao: '' }` → `optional`; ingresso `yes` + `required` com
   `required: false` na linha → `required`; ingresso `no` com `applicability: 'required'` →
   `optional`; ingresso `yes` sem exigência → `optional`; linha com `intake` e sem `term` lê a
   configuração anual; `applicability: 'required'` com `required: false` → `required`.

#### A2. Vínculos protegidos por ID e base, por catálogo (depois do formato 6)

`released activities stay declared` compara só IDs e só das políticas vinculadas; o catálogo
operacional não tem lista publicada. Passar a registrar pares ID + base de repetição em dois
níveis: (a) no conjunto global que `activityIds(base)` lê, que é o que torna um vínculo gravado
legível; (b) por catálogo de origem, inclusive o operacional, para que retirar `enrolment/cycle`
da política de 2027 falhe mesmo que outro catálogo declare o par. Acrescentar casos de resolução:
um vínculo legível que a política não gera cai em “vínculo não gerado”, nunca em erro de leitura.
`activityIds` tem cache no nível do módulo: testes que registrem catálogos sintéticos precisam de
um ponto de reinicialização.

#### A3. Critérios de 2027 independentes da base

1. Declarar os critérios de 2027 por inteiro em `criteria.ts`, com `frozenCriteria`, sem `replace`
   sobre a lista base; `parecer-items.ts` continua como base dos anos sem política.
2. Prova de extração: a lista declarada é igual, campo a campo (`id`, `title`, `page`, `item`,
   `pattern`, ordem), à produzida hoje, antes de apagar o código de remendo.
3. Teste de integridade: todo `criterion` das regras existe nos critérios; os critérios sem regra
   são exatamente `minutes`, `II`, `III`, `IV`, `annual`, `semester` e `window`.

#### A4. Transição controlada dos oráculos (depois do formato 6)

1. **Configurações de referência completas.** Antes de qualquer impressão, ampliar
   `referenceSettings` em `ruleset-history.test.ts` com ofertas `presencial` e `ead` sem `scope`,
   e com as variantes de `intake`. Só então registrar a impressão do catálogo expandido da
   **versão corrente** (v8, ou a vigente quando A4 rodar), em conferência separada do laço
   histórico, que compara `archive.historicalCatalogues[year]` por versão publicada. Sem
   impressões retroativas de v6 e v7: nada as consome. Documentar o que entra no hash (critérios,
   exclusões, janela, linhas expandidas sem `optionalFor`, `required`, `applicability` e
   `activity`, cujo efeito é medido pela matriz de aplicabilidade e mínimos por oferta) e o que não
   entra (observâncias e art. 5º, com impressões próprias; `explicitRecordOffers`, `review.source`,
   `review.evidence`, `review.dayMinimums`, `scope`, `notices`).
2. **Expectativa atual legível.** Gerar uma vez, a partir dos tradutores existentes, a expectativa
   do catálogo de 2027 e de 2028 (`unconfigured:2028`) e gravá-la como fixture própria
   (`test/fixtures/catalogue-expected.json`). Depois comparar o código com essa fixture e retirar
   os tradutores e a comparação com `v4Catalogues`. A captura da release A vira arquivo de consulta,
   com o hash do arquivo inteiro conferido.
3. **Regravação revisável.** A fixture só muda por `UPDATE_CATALOGUE_EXPECTED=1`; cada mudança
   normativa declara no commit quais linhas, aplicabilidades e coberturas podiam mudar. Manter os
   testes que afirmam o efeito de cada versão (v7 reabre revisão, v8 mantém a fronteira da v7).
4. **Oráculo v3** (`offers-equivalence.test.ts`): depois do formato 6, sem os casos `a-classificar`
   retirados em B2, os caminhos de catálogo (`requirements`, `diagnostics.coverage`, mensagens de
   `readiness` que citam `[id]`) passam ao mesmo regime da fixture; `events`, `periods`,
   `counting`, `baseIdentity`, `window`, `diagnostics.structure` e `diagnostics.teaching`
   continuam congelados.
5. **Oráculo gravado mais enxuto.** Retirar de `stored-oracle.ts` a lista `activities` e as linhas
   de cobertura sem datas vinculadas e sem pendências, deriváveis da aplicabilidade coberta pela
   fixture de catálogo. É aí que estão as centenas de linhas por commit.

#### A5. Fábrica de políticas: adiado

Nada a extrair enquanto houver uma só norma: “Processo Seletivo ${ano + 1}” também está fixo no
título do critério, e um registro de políticas de teste esbarra no cache de `activityIds` e em
`policies` constante. A política de 2028 nasce quando houver resolução, com histórico começando em
`establishes`; a extração de mecanismos é feita nesse momento, com o segundo caso concreto à vista.

### Parte B: formato 6, um corte só

Decisão: todas as mudanças de dados da parte B entram numa **única migração composta**, que sobe
o conteúdo do formato 5 para o **formato 6**: uma expansão, uma migração, uma contração, um
recálculo de hashes, uma quebra de clientes e cópias antigos. Migrações separadas por item tocariam
todos os hashes várias vezes.

Classificação: **nível 2** de `docs/migracao-schema.md`, porque muda significado e exclui valores.
Exige plano próprio de release, ensaio sobre backup restaurado em deployment descartável,
conferência das exportações antes e depois, e manutenção (`operations:pause`) durante a migração,
porque os campi editam rascunhos em paralelo.

#### B0. Limpezas só de código (antes da migração)

- `ActivityPlanItem.periodId`: sem produtor nem consumidor. Retirar.
- `review.annualReference`: no contrato e numa consulta defensiva em `technical-support.ts`, sem
  política que o forneça. Retirar.
- `intakeRequirements` e `windowInReadiness` no contrato da política: coincidem com `configured`;
  os consumidores (`IntakeRequirementForm.tsx`, `rules-view.ts`, `readiness.ts`) passam a ler
  `configured`. `explicitRecordOffers` sai em B2, com `confirmed`.
- Erro de validação de argumentos do Convex: nada o traduz hoje, e um validador não produz mensagem
  própria. O tratamento de erro de gravação do cliente passa a mostrá-lo como “Atualize a aplicação”.

O mecanismo de prazo ajustado (`plan-evaluation.ts`, critério `admission-regular`) **fica**: permite
cobertura completa com aviso ao edital regular publicado após o prazo de referência. Só o campo
`deadlineAdjustment.reviewed`, nunca lido pela cobertura, sai, em B2, porque muda o schema.

#### B1. O conversor do formato 6

Uma função pura e determinística `convertToFormat6(document, year)` em
`src/domain/calendar/normalization/`, sem `crypto.randomUUID` nem `Date.now`. Recebe o conteúdo ou o
envio inteiro (estado e snapshot institucional) e o ano lido de `calendars`, e devolve o documento
convertido e o relatório da perda. Aplica a mesma regra a `calendarContents` e
`calendarSubmissions`, tem os tipos do formato 5 congelados e existe só até a contração, como o
conversor da v5. Regras, nesta ordem, por documento:

1. **Campos sem uso.** Apagar `organizationBasis` e `deadlineAdjustment.reviewed`.
2. **Organização inferida pelos períodos.** Toda oferta `a-classificar` recebe uma organização a
   partir dos períodos sem associação do calendário:
   - exatamente dois períodos sem associação, sem sobreposição → `semestral`; os dois períodos, em
     ordem de data, passam a 1º e 2º semestres associados às ofertas semestrais; o total informado
     par vira `perTerm = count / 2`, e sem total a oferta fica sem `stages`. O total ímpar decide
     por oferta: ela vira `anual`, com `perTerm = count` e sem período, e as demais continuam
     semestrais; se nenhuma ficar semestral, os períodos seguem para a regra 3;
   - nos demais casos (um período, nenhum, dois com sobreposição, três ou mais) → `anual`, com
     `stages: { defined, perTerm: count }` quando havia total informado e sem `stages` quando não
     havia.

   Nos dados de 04/11/2026 (25 ofertas em 12 rascunhos), 8 rascunhos têm dois períodos e cairiam em
   semestral, salvo ofertas de total ímpar, e 4, sem período nem total, em anual. Perda declarada:
   um campus anual que tenha registrado dois períodos por outro motivo recebe semestral e precisa
   reorganizar; a organização atribuída aparece no relatório por calendário, para o campus conferir.

3. **Períodos sem associação** que a regra 2 não consumiu. Exatamente um, havendo oferta anual
   definida pela regra 2 → período anual compartilhado entre essas ofertas (a normalização aceita
   associação com várias ofertas do mesmo ciclo). Zero → nada. Nos demais casos (dois ou mais, ou
   calendário sem oferta definida pela regra 2) → removidos, listados no relatório com os destinos
   de edital que apontavam para eles (que ficam `orphan` e derrubam a cobertura do edital de
   transferência até o campus escolher outro período). Os números indicam um calendário sem oferta a
   classificar nesse caso: 18 períodos em 9 calendários, dos quais 16 nos 8 rascunhos da regra 2.
   `targetDays` de um período que passa a ter associação, por esta regra ou pela 2, é apagado, para
   que o primeiro salvamento não recalcule o término sem aviso.
4. **`intake` só com `required`.** Nenhum fluxo produz `status: 'no'`; em 2027, `no`, `unknown` e
   `yes` sem exigência dão o mesmo resultado. `intake` passa a `Partial<Record<term, true>>`: só os
   ciclos com `required: true` sobrevivem, e só os que a organização atribuída pela regra 2 tem
   (`termsFor`): uma exigência em `first` numa oferta que vira anual, ou em `annual` numa que vira
   semestral, é apagada e listada, porque uma exigência órfã bloquearia toda reorganização futura
   (`organization/offers.ts`). Perda declarada: a nota “Ingresso informado” do formulário e o sufixo
   “(não exigido: sem ingresso…)” do catálogo operacional, que passa a não distinguir ausência de
   ingresso.
5. **Posições de etapa.** Vínculo com posição `unclassified`, em oferta a classificar ou já
   definida, vira sempre posição definida e conserva o vínculo e `assessmentAutoStart`: se o ordinal
   existe na organização da oferta, a posição dele (`stagePosition`); senão (oferta sem total ou
   ordinal além do total), `{ term: 'annual', number: ordinal }` em oferta anual e
   `{ term: 'first', number: ordinal }` em oferta semestral. Essas posições só são geradas quando
   correspondem de fato àquele ordinal, então nunca apontam para a etapa errada. Até lá a data fica
   em **Vínculo a conferir** (`not-generated`), resolvida ao informar as etapas ou por **Corrigir
   atividade vinculada**; duas datas no mesmo ordinal recebem a mesma posição e, quando gerada, ficam
   em `duplicate-stage`. A data não vira data do campus, porque `validateLinks` não deixa uma data
   sem vínculo ganhar um depois: o campus teria de apagá-la e recriá-la.
6. **Abrangência.** `scope.confirmed` deixa de existir; `scope: { offers }` é achatado em `offers`,
   nunca vazio, nas datas locais e nas entradas do snapshot institucional. Num snapshot não regravado
   desde a materialização: `modalities` resolve para as ofertas desses tipos; `[]` em `offers` ou
   `modalities`, ou nenhum dos dois, resolve para todas as ofertas, como `appliesTo` já faz; uma
   entrada cujos tipos não têm oferta no calendário não alcança ninguém e sai do snapshot. Os casos
   de `[]` e de entrada retirada mudam a identidade da base e vão para o relatório. `appliesTo` fica
   com uma forma. Efeito declarado: datas convertidas do formato 4 com todas as ofertas passam a
   contar como atendimento para todas; o relatório lista, por calendário, as atividades cuja
   cobertura muda. O catálogo institucional (`convex/catalogue.ts`) continua declarando `modalities`;
   a resolução fica na cópia.
7. **Inclusões letivas** cujo escopo tinha oferta a classificar são conferidas contra os períodos
   das regras 2 e 3; se ficarem fora, perdem o efeito `include` (viram `note`) com registro no
   relatório.
8. **Validação, não reescrita.** O resultado é validado por `normalizeOfferCalendar(m, m)`, com o
   ano, mas o que se grava é a saída do conversor. A normalização carimba a versão de regras atual em
   todo documento (nas fixtures, 25 dos 27 que passam por ela hoje), preenche `category` e regenera
   as férias. `rulesetVersion` fica como estava, inclusive ausente, e o documento segue pela
   conferência de regras normal. Se a validação lançar erro, o documento é recusado e o ensaio para.
   `schemaVersion: 6`.
9. **Hashes.** Antes de converter um envio, conferir que `contentHash` é o do próprio envio; um hash
   divergente interrompe a migração sem escrita. Depois, `contentHash` recalculado sobre o conteúdo
   convertido; `contentVersion` inalterado.

**A migração** fica em `convex/migrations.ts`, em `pending`, nesta ordem: conteúdos, envios,
`reviewVersions`, `reviews`. Converte um documento por lote, lê o ano em `calendars` e não reescreve
um documento já no formato 6, de modo que reexecutar não muda nada.

- **Status na janela.** `revisado`, `vigente` ou `arquivado` interrompem a migração sem escrita. O
  primeiro perderia o parecer e é reaberto ou devolvido pelo fluxo normal antes da janela; os outros
  dois teriam um documento publicado reescrito e exigem decisão própria. `enviado` e `em_revisao`
  seguem, e a revisão recomeça sobre o conteúdo migrado.
- **Conferência.** Comparando as exportações: só `calendarContents` e `calendarSubmissions` mudam, e
  só como o conversor determina; `reviews` e `reviewVersions` ficam vazias; `calendars` (versão e
  status inclusive), catálogo, documentos e auditoria ficam iguais. A identidade da base de cada
  documento é igual antes e depois, salvo os casos listados pela regra 6. Envio igual ao conteúdo
  antes continua igual depois. Divergência bloqueia a reabertura.

Perda declarada e transferida ao campus, por calendário: organização decidida pela migração, períodos
removidos, destinos de edital órfãos, vínculos que ficam a conferir (posições e vínculos `term` que a
organização atribuída não gera), exigências de ingresso apagadas, inclusões rebaixadas, entradas
retiradas do snapshot, coberturas que mudam. O relatório do ensaio é prévia, porque os campi continuam
editando; o definitivo sai do backup feito já em manutenção e é enviado a cada campus. Um calendário
enviado cuja cópia recebe organização atribuída ou outra perda fica apontado no inventário, e o
relatório dele vai também a quem faz a revisão.

#### B2. O que muda no código com o formato 6

Roteiro em passos, com cada commit verde. Em cada passo, as fixtures gravadas
(`test/fixtures/stored/*`, `offers-oracle-inputs.json`) recebem as regras correspondentes do
conversor, com o que muda no oráculo declarado no commit. Do passo 1 até a expansão a `main` não é
publicada e não entra mudança de regra.

1. **Conversor e schema alargado.** Conversor puro e relatório, testados sobre as fixtures, sem mudar
   o modelo. `convex/schema.ts` passa a aceitar os validadores congelados do formato 5 e os atuais.
2. **Ofertas sempre organizadas** (regras 1 a 4). `Organization` sem `a-classificar`; `OfferStages`
   e `PeriodAssociation` só `defined`; `IntakeConfiguration` reduzida, com os casos de `unknown` e
   `no` saindo da tabela de A1; `deadlineAdjustment.reviewed` retirado, inclusive da variante do
   snapshot; `organizationSummary([])` devolve `null`. Retirados `reportedStageCount`, a guarda de
   `prepare-save.ts` e `secondSemesterIntake`. Contrato de criação (`contracts.ts`, `calendars.ts`):
   oferta nova nasce sem organização só no cliente, o servidor exige organização definida, e o
   placeholder do formulário é ajustado. Prontidão: some `organization-unclassified`, e as
   conferências hoje silenciadas para `reported` passam a valer. Consumidores a ajustar também:
   `diff.ts`, `counting/evaluation.ts`, `diagnostics.ts`, `activities/validation.ts`,
   `printing/calendar-layout.ts`, `printing/teaching-day-breakdown.ts`, o `regime` de
   `technical-support.ts` e `contracts.ts`.
3. **Posições** (regra 5). `StagePosition` só `defined`; retirados `LinkStates` e `sameLink`
   (`links.ts`, `normalize.ts`), o ramo `unclassified` de `stageOrdinal` e `activityFromKey` e a
   conversão de ordinal em `reorganizedLinks`; `keptWithoutActivity` **fica**, é a isenção do vínculo
   não gerado. “Vínculo a conferir” fica com `duplicate-stage`, `stage-sequence`, `out-of-cycle` e
   **`not-generated`** (a organização atual não gera a atividade), que hoje divide o nome
   `unclassified` com a posição legada. A situação de edital `Execution 'unclassified'` é outra coisa
   e não muda.
4. **Abrangência** (regras 6 e 7). `CalendarEvent.offers` no lugar de `scope`; retirados
   `explicitRecordOffers`, a confirmação de abrangência em `plan-evaluation.ts` e o rótulo de
   `diff.ts`; `regeneratedVacations` preserva só o vínculo.
5. **Corte.** `calendarSchemaVersion = 6`, e os validadores de argumentos aceitam só o formato 6,
   inclusive o marcador de `reviewInput` (`contracts.ts`), como na v5, em que saveReview sem o
   marcador aceitava o corpo antigo. A validação da regra 8 é ligada no conversor; a migração e a
   retirada de pareceres entram em `pending`. Provas em `convex-test`, como na v5: `migrations:start`
   sobre as fixtures conclui, reexecutar não muda nada, hash alheio e status bloqueante param sem
   escrita, e um cliente antigo é recusado em `saveCalendar` e `saveReview`. Cópias JSON:
   `readCalendarOfferInput` aceita só o formato 6, e cópias dos formatos 4 e 5 são recusadas com
   mensagem própria, sem conversão. `reported-stages.test.ts` e `legacy-stage-count-oracle.json` são
   apagados; os casos `a-classificar` do oráculo v3 saem.
6. **Contração** (release seguinte à expansão). O schema aceita só o formato 6; conversor, validadores
   congelados e migrações saem. As fixtures continuam convertidas, e “each stored submission keeps
   its hash” continua valendo sobre elas.

#### B3. Efeitos de comportamento declarados

- Calendários com oferta a classificar passam de contagem com erro a números, e o mínimo de 200
  dias passa a ser cobrado; surgem pendências `period-count`, `stages`, `out-of-cycle`.
- Em 2027, `termsFor` deixa de devolver `[]` para essas ofertas: todas as atividades por ciclo
  passam de opcional a obrigatória. Vínculos `term` que a organização atribuída não gera ficam em
  “Vínculo a conferir”.
- No catálogo operacional, `cyclesByRegime` muda quando uma oferta vira semestral: vínculos
  `term: 'annual'` viram “não gerados”.
- Datas do formato 4 passam a contar como atendimento para todas as ofertas listadas; o
  parecerista vê cobertura que o campus não afirmou explicitamente.
- O histórico de envios mostra diferenças produzidas pela migração; a garantia de
  `docs/migracao-schema.md` (“a evidência preserva o significado”) é revogada para o formato 6, e
  o backup pré-migração fica como evidência de registro.
- A versão de regras gravada não muda: rascunhos em versões anteriores continuam passando pela
  conferência de regras, inclusive da v7.
- Pareceres não ficam desatualizados pela migração (`reviewIsCurrent` compara versão do calendário,
  versão de regras e identidade da base, que a migração preserva salvo os casos da regra 6). Por isso
  a migração apaga `reviews` e `reviewVersions` (vazias em 04/11/2026), e os calendários enviados
  continuam enviados, com o hash do envio recalculado; a revisão começa do zero sobre o conteúdo
  migrado.
- Abas abertas com o bundle anterior quebram ao ler dados do formato 6 e caem no `ErrorBoundary`
  (`coversDate` lê `event.scope.offers`); ao salvar recebem o erro de validação traduzido em B0.
  Recarregar resolve, e a janela é comunicada aos campi.

#### B4. Período como parte da oferta (avaliar depois do formato 6)

Com `a-classificar` fora, avaliar a lista plana com `offerId` e `term` no lugar de `association`
(menor, preserva a identidade dos períodos que os destinos de edital referenciam) contra o
aninhamento na oferta. Qualquer das duas exige IDs determinísticos para conteúdo e envio (senão a
publicação falha por hash), separação dos períodos compartilhados que as regras 2 e 3 de B1
criam, e conservação de `targetDays` com o recálculo do término.

#### B5. Férias com representação única (avaliar depois do formato 6)

`teacherVacations` guarda os intervalos e `events` guarda as datas derivadas, que a normalização
apaga e recria preservando o vínculo. Avaliar intervalos como fonte única e datas derivadas na
projeção.

## Fora do escopo

- Unificar o catálogo operacional com o de 2027.
- Mudar a classificação de efeitos das versões ou o vínculo entre versão e revisão.
- A fábrica de políticas (A5), até haver segunda norma.

## Ordem e verificação

1. A1 → A3 → B0 (só código). B0 é publicado, para a tradução do erro valer nas abas abertas no corte.
2. Inventário de produção por script de leitura, cobrindo conteúdos, envios e lixeira e cada
   combinação de B1: status dos calendários, pareceres existentes, ofertas sem total, totais ímpares
   com dois períodos, períodos sem associação em calendário sem oferta a classificar, posições não
   classificadas em oferta definida, destinos de edital por período, `targetDays`, inclusões letivas
   fora de período, `intake` fora dos ciclos da oferta, entradas do snapshot só com `modalities`, com
   `[]` ou sem oferta correspondente, e calendários enviados com perda.
3. Apresentar à gestão a lista nominal da perda por calendário. Uma regra de B1 só volta à decisão se
   o inventário contradisser os números usados para decidi-la.
4. B1 e B2 (passos 1 a 5), com `pnpm check` antes de concluir a fase.
5. Ensaio sobre backup restaurado em deployment descartável, com a validação da regra 8 passando em
   todos os documentos, a conferência de B1 sem divergência e relatório por calendário.
6. Release de expansão (`docs/implantacao-convex-vercel.md`): `operations:pause`, conferência dos
   status, backup, `pnpm deploy:production --maintenance`, migração de conteúdos e envios com
   recálculo de hashes, retirada de pareceres, conferência das exportações, relatório definitivo,
   `operations:resume`.
7. Contração (passo 6 de B2), numa release seguinte: os validadores já recusam o formato antigo, então
   ela não precisa da janela.
8. A2 e A4 sobre as fixtures já simplificadas, com `pnpm check` antes de concluir a fase.
9. B4 e B5, como avaliações.
10. Fechamento: levar para `docs/migracao-schema.md`, `docs/arquitetura-convex.md` e `docs/uso.md` o que
    continua valendo, registrar o que ficou em `docs/pendencias.md` e apagar este plano.
