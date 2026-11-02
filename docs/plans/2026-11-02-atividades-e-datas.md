# Atividades e datas: modelo, interface e migração

Data: 02/11/2026.

Status: proposto. Consolida e substitui os planos “Identidade das atividades e migração” e “Nomenclatura de eventos”, de mesma data, que foram retirados. Implementação, migração e publicação não autorizadas por este documento. As decisões novas desta consolidação foram aceitas pelo responsável em 02/11/2026.

Fonte normativa do vocabulário: [Resolução CONSUP/IFPR nº 292, de 05/10/2026](https://sei.ifpr.edu.br/sei/publicacoes/controlador_publicacoes.php?acao=publicacao_visualizar&id_documento=4606058&id_orgao_publicacao=0), que estabelece o calendário de referência de 2027.

## 1. Problema

Em `exuberant-cheetah-138` (consulta somente leitura, 02/11/2026): 39 calendários de 2027, 1.085 registros locais, 725 vínculos reconhecidos, 339 sem vínculo e 21 vínculos não reconhecidos, em dois rascunhos (Ivaiporã `jd7d4btmynp6qb8khd5045fr658gtdbs`, 11 casos; Cascavel `jd70qxdfjbn19xc2pkqpf0h6h18gtbvz`, 10 casos). Nos dois, todas as ofertas e associações de períodos estão `a-classificar`. Os números orientam a investigação; a execução inventaria tudo de novo.

Causa: `campusEvents()` (`web/features/calendar-editor/events/campus-events.ts`) decide a **seção** de um registro pela checklist gerada. Com organização indefinida, `operational-checklist.ts` gera só o ciclo anual; `final-1`, `diary-2` etc. deixam de existir na lista e o registro aparece como evento próprio do campus. O seletor **Atividade vinculada** permite reproduzir o mesmo estado manualmente.

A mesma dependência afeta a gravação e a organização:

- `normalize-v4.ts:155-184` valida cada `requirementId` contra a checklist gerada e recusa o calendário inteiro quando não há item. Os dois rascunhos só conseguem salvar se o campus desvincular os registros pelo seletor.
- `offerOrganizationIssues()` (`organization/offers.ts:191-220`) recusa confirmar a organização de uma oferta enquanto houver vínculo que ficaria incompatível (“Revise a atividade … antes de alterar a organização da oferta”). Hoje a saída é desvincular pelo seletor; sem ele, os dois rascunhos não conseguiriam classificar suas ofertas.
- `applyOfferOrganization()` (`organization/offers.ts:365-417`) remove `requirementId` que deixa de ser gerado e transforma etapas aposentadas ou duplicadas em notas sem vínculo. Mudar a organização apaga evidência.
- `coverage.ts:32` exige ofertas explícitas em 2027 (`explicitRecordOffers`). Qualquer operação que preencha `offers` automaticamente transforma o registro em atendimento sem confirmação do campus.

Três defeitos se somam:

1. A identidade do vínculo (`requirementId`, string composta) se confunde com a exigência calculada para a configuração atual.
2. A interface tem duas listas com granularidades diferentes (atividades × registros datados) e a localização de um registro é calculada por exclusão.
3. Vocabulário sobreposto: atividade, registro, evento, período, exigência e requisito para coisas parecidas.

## 2. Decisões

Mantidas dos planos anteriores:

1. Sem compatibilidade com o formato antigo em leitores, comandos, formulários, DTOs ou funções Convex. A conversão pertence só à migração.
2. Preservação integral: IDs, ordem, descrições, datas, horas, ofertas, ausências e duplicidades aparentes.
3. Classificação incompleta é estado normal do modelo, sem `legacy`, aliases ou classificações artificiais.
4. Sem novas tabelas: datas continuam em `calendarContents.state.events` e cópias de envio; atividades continuam declaradas nas policies.
5. Remover o seletor **Atividade vinculada** do formulário e o comando `changeRequirement`.

Novas nesta consolidação, aceitas em 02/11/2026:

6. **Vocabulário Atividade + Data, conforme a Resolução 292/2026** (seção 3). Substitui a proposta Evento + Regra.
7. **Uma única etapa "Atividades"** no editor, com visões e filtros, no lugar de “Atividades da Resolução” / “Atividades do Campus” (seção 4). O editor volta a ter 6 etapas.
8. **Localização nunca é armazenada nem decidida por exclusão:** é um filtro calculado de origem + vínculo. Toda data aparece na visão **Por data**.
9. **Entrega em três fases** (seção 8): a fase 1 corrige a perda de visibilidade e a perda de vínculos sem migração de formato; a migração v5 fica restrita ao que o modelo precisa; extensões sem demanda comprovada ficam adiadas.
10. **Vínculo existente nunca é apagado por efeito colateral**, já na fase 1: gravação e comandos de organização conservam vínculos persistidos, mesmo sem atividade gerada; só exclusão da data ou correção explícita os alteram.
11. **Datas internas (art. 18):** uma data do campus pode ser marcada como interna; ao imprimir, o campus escolhe a versão oficial (sem datas internas) ou a versão completa (seção 4.5).

## 3. Vocabulário

A resolução usa **datas** como unidade do calendário (art. 2º: “As atividades acadêmicas e administrativas do IFPR observarão as seguintes datas”; art. 11, caput: “Além das datas previstas no art. 2º”) e enumera no art. 11 o que os campi “deverão contemplar”. “Evento” tem sentido próprio na norma (art. 11, XVII, XIX, XXIV a XXVI; art. 12; art. 18) e na legenda PROENS (categoria `evento`), por isso não é usado como termo geral.

| Conceito                                       | Interface                                             | Código                                                                | Base normativa         |
| ---------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- | ---------------------- |
| Item datado do calendário                      | **Data**                                              | `CalendarEvent` (hoje `CalendarActivity`; array persistido `events`)  | art. 2º; art. 11 caput |
| O que deve ser contemplado                     | **Atividade**, com **Fundamento** (ex.: Art. 11, XII) | `ActivityRule` (hoje `RequirementSpec` + seção)                       | art. 11                |
| Vínculo de uma data com a atividade que atende | **Atividade vinculada** (somente leitura no detalhe)  | `ActivityRef`, campo `event.activity`                                 | —                      |
| Atividade × oferta/ciclo/etapa, avaliada       | Linha de atividade                                    | `ActivityPlanItem` (hoje `ActivityRequirement`), por `activityPlan()` | —                      |
| Datas fixadas pela norma ou pela Proens        | **Datas da base institucional**                       | `InstitutionalEventSnapshot`                                          | arts. 2º e 12          |
| Datas incluídas pelo campus sem atividade      | **Datas do campus**                                   | `CalendarEvent` sem `activity`                                        | art. 11, II; art. 18   |
| Data do campus fora do calendário oficial      | **Data interna**                                      | `CalendarEvent.internal`                                              | art. 18                |
| Data com ajuste permitido                      | **Data ajustável**                                    | `ObservanceRule`                                                      | art. 3º, §§ 1º e 2º    |
| Intervalo usado na contagem de dias            | —                                                     | `CountingInterval` (hoje `CalendarEvent` em `counting/core.ts`)       | arts. 4º e 5º          |

- `ActivityRule` compõe a linha hoje chamada `RequirementSpec` com `repeat`, `cycles()`, `each` e valores comuns da `RequirementSection`, num único ponto. Declara também a **base de repetição**: única, ciclo da oferta (art. 11, VI e VIII: “uma vez ao ano para cursos anuais e duas vezes ao ano para cursos semestrais”), semestre de referência (art. 11, XII: “em cada semestre”) ou etapa (art. 11, I e IX).
- Atividade não significa obrigação: a aplicabilidade é obrigatória, opcional ou a confirmar (art. 11, parágrafo único: semanas XXIV a XXVI obrigatórias para técnicos e facultativas para graduação, já em `optionalFor`).
- Em anos sem norma configurada, o Fundamento aparece como **Catálogo operacional**.
- “Evento” permanece onde a norma o usa: nomes de atividades (XVII, XIX, XXIV a XXVI), eventos institucionais (art. 12), eventos locais (art. 18) e a categoria PROENS “Eventos artísticos, científicos…”.
- “Período letivo” e “período de ingresso” mantêm seus significados. Uma data tem **Início** e **Término**.
- “Regra” não aparece na interface; `ObservanceRule` mantém o nome no código.
- O código já usa “activity” do lado normativo (`activityChecklist`, `ActivityRequirement`, `activityGroups`); as renomeações ficam restritas a `requirementId` → `activity`, `CalendarActivity` → `CalendarEvent` (nome já usado na web) e à colisão da contagem.

## 4. Interface: etapa única "Atividades"

### 4.1 Por que uma etapa

- As duas seções listavam coisas diferentes: atividades (com zero ou mais datas) e datas. A divisão obrigava a decidir, por exclusão, onde uma data “cai”, que é a origem do defeito.
- A prévia já tem uma terceira lista cronológica (**Registros do calendário**); uma etapa única absorve as três.
- Custo: desfaz a separação feita em `27b28f6` (rota `/atividades-campus`, screenshots e testes recém-atualizados). Como esse commit é de hoje e não houve publicação dependente, o custo é baixo.

### 4.2 Visões e filtros

Separar **visão** (o que é uma linha e como se agrupa) de **filtros** (o que entra). Hoje “Visão” (Todas / A preencher / Sem pendências) é, na prática, um filtro de situação.

| Visão                      | Linha                               | Agrupamento                      | Uso                                    |
| -------------------------- | ----------------------------------- | -------------------------------- | -------------------------------------- |
| **Por atividade** (padrão) | Atividade, com suas datas aninhadas | Assunto; depois grupos especiais | Contemplar o que a resolução pede      |
| **Por data**               | Data                                | Mês                              | Conferir tudo o que está no calendário |

Unidade de cada visão: em **Por atividade**, linhas e contadores contam atividades (mais as datas dos grupos especiais); em **Por data**, contam datas. Atividades sem data não têm linha em **Por data**; quando houver atividades a preencher fora da visão atual, ela mostra o aviso “N atividades sem datas” com ação **Ver por atividade**, para que uma lista vazia não pareça ausência de pendências.

Antes dos grupos, nas duas visões, ficam as **Datas ajustáveis a resolver**: escolhas em `observanceDates` sem data correspondente na base e conflitos de `observanceIssues()` (`observances.ts:44`). Cada linha é identificada pela chave da observância, existe mesmo sem data ou grupo institucional, conta em **A preencher** e abre `ObservanceForm` (inclusive **Restaurar data institucional**). Substitui os botões “Resolver observância” da etapa do campus.

Grupos especiais da visão **Por atividade**, sempre ao final e só quando não vazios:

1. **Vínculo a conferir:** datas cujo vínculo não pode ser aceito como atendimento, por dois motivos distintos: a atividade não foi gerada para a configuração atual (os 21 casos; **Classificação pendente**), ou a atividade existe, mas a associação conflita com outra data (**Etapa duplicada**, **Etapas fora de sequência**). Cada linha mostra o motivo e a ação de correção, nunca conta como atendimento e nunca some.
2. **Datas do campus:** feriados municipais, recessos, reposições, eventos locais e editais livres; datas internas com o selo **Interna**.
3. **Datas da base institucional** (recolhido, somente leitura, exceto datas ajustáveis): abre automaticamente quando uma ação exige mostrar um item dele.

Filtros (combinam com as duas visões; contadores refletem os demais filtros):

| Filtro       | Valores                                                                  | Observação                                                   |
| ------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Pendência    | Todas · A preencher · Sem pendências                                     | Chips sempre visíveis; padrão Todas (hoje chamado “Visão”)   |
| Situação     | Todas · Pendente · Parcial · Completo · Opcional · Aplicação a confirmar | Já existe em **Mais filtros**; só afeta atividades           |
| Origem       | Todas · Vinculadas a atividades · Do campus · Base institucional         | Derivada de contêiner + `activity`; substitui as duas seções |
| Visibilidade | Todas · Oficiais · Internas                                              | Só filtra datas; ver regras abaixo                           |
| Oferta       | Todas · cada oferta                                                      | Já existe                                                    |
| Assunto      | Todos · grupos de `activityGroups`                                       | Só afeta atividades                                          |
| Busca        | Texto livre (nome, fundamento, descrição)                                | Já existe                                                    |

- **A preencher** inclui atividades obrigatórias sem planejamento completo, aplicação a confirmar, classificação pendente, divergências e datas ajustáveis não resolvidas. Execução (publicação programada/realizada) é outra dimensão e não conta como pendência de planejamento.
- **Visibilidade** nunca recalcula cobertura, situação ou pendência; apenas esconde linhas de datas. Atividades nunca contêm datas internas (seção 4.5), então em **Oficiais** todas as atividades permanecem, inclusive as sem datas e as **A preencher**; em **Internas**, a lista mostra só as datas internas do grupo **Datas do campus** e um aviso de que as atividades estão ocultas por esse filtro.
- O resumo por oferta (“x de y atividades obrigatórias com planejamento completo”) aparece só em **Por atividade**.
- Atividades selecionadas ou abertas por link de revisão continuam fixadas mesmo fora dos filtros. Um link para atividade abre a visão **Por atividade**, mesmo que a URL anterior estivesse em **Por data**, e abre o painel com ou sem datas; se a chave não corresponder a atividade gerada nem a data em **Vínculo a conferir**, mostrar aviso em vez de lista vazia.
- Somente os **intervalos de avaliação** (`stage-N`, `variant === 'stage'`) são editados em **Etapas de avaliação**, como hoje (`activity-list.ts:47`, `PeriodsSection.tsx:75`); em **Por data**, essas datas têm link para lá. Resultados, conselhos e reuniões por etapa continuam em **Por atividade**, embora compartilhem `StagePosition` no modelo.
- Mobile: visão em controle segmentado; Pendência em chips; Situação, Origem, Visibilidade, Oferta e Assunto em **Mais filtros**, como hoje.

### 4.3 Ações e textos

| Hoje                                   | Proposta                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Atividades da Resolução / do Campus    | **Atividades** (uma etapa)                                                                                    |
| Preencher atividade                    | **Preencher atividade** (atividade sem datas; a atividade vem do contexto)                                    |
| Adicionar período, dentro da atividade | **Adicionar data**                                                                                            |
| Registros desta atividade              | **Datas desta atividade**                                                                                     |
| Novo evento local                      | **Nova data do campus** (cabeçalho da etapa; sempre sem atividade)                                            |
| Editar evento local / Editar período   | **Editar data**                                                                                               |
| Atividade vinculada (seletor)          | Removido do formulário; exibida somente leitura no detalhe                                                    |
| Corrigir associação                    | **Corrigir atividade vinculada**, no detalhe, com prévia                                                      |
| Publicação prevista                    | **Publicação programada** / **Publicação realizada** (UI e impressão; valores `planned`/`published` mantidos) |
| —                                      | **Data interna (art. 18)**, opção no formulário de datas do campus                                            |

Texto de apoio da etapa: “Contemple as atividades previstas na Resolução e inclua as datas próprias do campus, como feriados municipais, recessos, reposições e eventos locais.”

### 4.4 Rotas e URL

- Etapa em `/calendarios/$calendarId/atividades`, no lugar de `/eventos`. Remover `/eventos`, `/atividades-campus`, o redirecionamento `?aba=eventos` e a entrada `campus` de `editorSections` e `editorSteps`, sem aliases.
- Parâmetros mantêm o prefixo exclusivo `atividade*` (`situacao` e `busca` já pertencem aos filtros de documentos validados na raiz do Router, `web/app/search.ts:37-46`): `atividadeVisao` (`atividade` | `data`), `atividadePendencia` (`preencher` | `sem-pendencias`), `atividadeSituacao` (inalterado), `atividadeOrigem`, `atividadeVisibilidade`, `atividadeOferta`, `atividadeAssunto`, `atividadeBusca` e `atividade`. Os valores atuais de `atividadeVisao` (`preencher`, `sem-pendencias`) passam para `atividadePendencia`, sem aliases: links antigos com esses valores caem na visão padrão. `atividade` passa a carregar a chave completa (definição + ciclo/oferta/posição), validada pelo Router. Os parâmetros da etapa não alteram os filtros de documentos nem são alterados por eles.
- `history` passa a apontar para a etapa Atividades. Atualizar links de revisão e `IssuesSection`.
- Prévia (`CalendarPreviewSection`): remover **Registros do calendário** e oferecer **Ver por data**.

### 4.5 Datas internas (art. 18)

O art. 18 permite ao campus “elaborar calendário de eventos locais com finalidade de organização interna”. Em vez de um segundo calendário, uma data do campus pode ser marcada como **interna**: aparece no editor e, se o campus escolher, na versão completa impressa, mas não na versão oficial.

Restrições, validadas no domínio e no backend:

- Só datas do campus (sem `activity`). Datas vinculadas a atividades atendem ao art. 11 e datas da base cumprem os arts. 2º e 12; ambas pertencem ao calendário oficial.
- Só com efeito `note`. Uma data que inclui ou exclui dias letivos altera o cumprimento dos arts. 4º e 5º e precisa constar do calendário oficial; assim, as duas versões impressas têm a mesma contagem.
- Só nas categorias efetivas `comemorativo`, `evento`, `institucional` e `prazo`. Feriados e recessos (art. 11, II; art. 19), férias, limites de período, sábados letivos, formação, conselhos e criação do IFPR ficam sempre no calendário oficial.
- “Categoria efetiva” é a resolvida por `eventCategory()` (`categories.ts:18`): sem `category`, efeito `note` resolve para `institucional`. Uma única função de elegibilidade, sobre a categoria efetiva, é usada por formulário, comando, backend e impressão. `eventCategory()` passa a ler `effect` na fase 2; testar datas sem categoria antes e depois de `kind` → `effect`, inclusive na exportação e importação de JSON.
- Marcar ou desmarcar como interna é edição comum da data, sem mudar ID, datas ou escopo.

Impressão (`CalendarPreviewSection` imprime o próprio DOM da prévia por `window.print()`):

- Antes de imprimir, a prévia oferece **Versão oficial (sem datas internas)**, padrão, e **Versão completa (com datas internas)**. A opção fica no parâmetro `impressao=completa` (ausente = oficial) e a prévia mostra exatamente a versão escolhida.
- A opção só aparece quando o calendário tem datas internas.
- `proensLayout()` recebe a versão: a oficial omite datas internas da grade e das listas; a completa as mostra com marcação própria (legenda “Data interna”) e o cabeçalho “Versão completa: inclui datas de organização interna (art. 18); não substitui o calendário oficial”.
- O nome sugerido do PDF recebe o sufixo `-completo` na versão completa.
- A versão submetida à Proens e publicada (arts. 15 e 16) é a oficial; isso fica explícito no texto de apoio da impressão e em `docs/uso.md`.

Envio, comparação e revisão:

- As cópias de envio guardam o conteúdo inteiro, inclusive datas internas e o campo `internal`; o hash muda quando ele muda.
- A comparação de versões e envios (`diff.ts:167`) só compara campos listados em `fieldLabels`. Acrescentar `internal` com o rótulo **Visibilidade** (“Oficial” / “Interna”), para que marcar ou desmarcar uma data, mesmo como única alteração, apareça como mudança no documento oficial.
- Datas internas ficam fora de toda evidência oficial: candidatos dos critérios por nome/categoria (`technical-support.ts:144`), verificação de evidência textual para liberar publicação (`readiness.ts:242`), sinais do parecer e impressão oficial. O parecer as lista à parte, com o selo **Interna**, apenas para consulta.

### 4.6 Formulários e comandos

- Comandos de domínio, validados também no backend: `planActivityDate` (exige `activity`, vinda do contexto), `createCampusDate` (recusa `activity`), `updateDate` (preserva `activity`). Só `changeActivity` altera o vínculo.
- `changeActivity` (**Corrigir atividade vinculada**) corrige a data inteira, com prévia, sem mudar descrição, datas ou ID. A divisão entre ofertas fica para a fase 3; até lá, o caminho é ajustar as ofertas da data e preencher a atividade correta com outra data.
- Rascunho identificado por calendário + ID da data; a chave da atividade só serve para agrupar, criar contextualmente e montar URL.
- Ofertas pré-selecionadas: **Nova data do campus** pré-seleciona todas as ofertas atuais; **Preencher atividade** / **Adicionar data** mantêm a seleção contextual atual (`recordOffers()`, `event-draft.ts:163`), limitada às ofertas compatíveis com a atividade (oferta da etapa, ofertas do ciclo). Em ambos os casos a lista é explícita e editável, e salvar o formulário confirma a abrangência (seção 5.3).
- O formulário de datas do campus mostra **Data interna (art. 18)** somente quando efeito e categoria permitem; mudar para efeito ou categoria incompatível desmarca a opção com aviso, antes de salvar.
- Router: rotas e estado de URL; TanStack Form: valores; comandos puros: alterações. Antes de mexer em formulários, conferir os exports da versão instalada de `@tanstack/react-form` e os guias citados em `AGENTS.md`.

## 5. Modelo

### Data local (v5)

```ts
type EventEffect = 'include' | 'exclude' | 'note';

interface CalendarEvent {
  id: string;
  name: string;
  start: CivilDate;
  end: CivilDate;
  effect: EventEffect; // hoje `kind: string`
  category?: string;
  scope: EventScope; // ofertas sempre listadas (seção 5.3)
  activity?: ActivityRef; // ausente = data do campus
  internal?: true; // art. 18; só em data do campus com efeito `note` (seção 4.5)
  hours?: number;
  assessmentAutoStart?: CivilDate;
  deadlineExtensionCause?: 'municipal-holiday' | 'municipal-recess'; // art. 3º, § 2º
  deadlineAdjustment?: { date: CivilDate; reviewed: boolean };
  notice?: AdmissionNotice; // agrupa publicationStatus + admission
}
```

- Sem discriminante persistido entre data do campus e data de atividade, nem campo de seção: `activity?` e os comandos bastam.
- `internal` é um fato registrado pelo campus, não um estado derivado. Ausente significa oficial; a conversão não o cria.
- `recordType: 'event'` e os aliases `*V4` deixam de existir no modelo de execução.
- `notice` agrupa os campos de edital hoje soltos no topo. Edital sem atividade é válido; finalidade, publicação e destino podem estar ausentes.
- Horas informadas em atividades sem mínimo (as 28 h de `final-appeal-2`) continuam aceitas e visíveis.
- Fundamento, critério, rótulo e categoria padrão vêm da `ActivityRule`; não são copiados para a data.

### 5.1 Vínculo com a atividade

```ts
type StagePosition =
  | { status: 'unclassified'; reportedOrdinal: number }
  | { status: 'defined'; term: AcademicTerm; number: number };

type ActivityRef =
  | { activityId: OnceActivityId }
  | { activityId: CycleActivityId; term: AcademicTerm } // ciclo da oferta (art. 11, VI e VIII)
  | { activityId: SemesterActivityId; semester: 'first' | 'second' } // semestre de referência (art. 11, XII)
  | { activityId: StageActivityId; offerId: string; position: StagePosition }; // etapa (art. 11, I, IX e XIII)
```

- **Semestre de referência tem forma própria**, em vez de reutilizar `cycle` e depender de uma nota na declaração. O tipo deixa explícito que um PIT de 1º semestre é compatível com oferta anual (“em cada semestre”), e o diagnóstico não precisa consultar a policy para saber como comparar.
- Os conjuntos de IDs vêm das declarações das policies, com validação em runtime; não aceitar string arbitrária por prefixo.
- Atividades por etapa incluem resultados, conselhos e reuniões por etapa, não só `stage`.
- Uma função pura produz a chave da atividade (agrupamento/URL); não é parser nem alias de `requirementId`.
- Etapa confirmada não é reinterpretada quando a quantidade de etapas muda: conserva a posição e gera divergência.
- Anos sem policy normativa mantêm o catálogo operacional como comportamento explícito; retirar dele a recuperação de IDs antigos de 2027 (`operationalRequirements()`).

### 5.2 Origem

A origem tem uma fonte de verdade: o contêiner (`state.events` ou snapshot institucional). `institutional` existe só na projeção do editor. O prefixo `inst:` pode continuar como chave/alvo de observância, mas não decide origem nem permissão; atualizar `automaticEventSource()` e demais consumidores. Snapshots com `requirementId` opcional são inventariados e convertidos; não se cria associação automática catálogo → atividades.

### 5.3 Abrangência

Hoje `offers` ausente/vazio tem dois efeitos diferentes: na contagem significa “todas as ofertas presentes”; na cobertura de 2027 significa “abrangência ainda não confirmada” (`coverage.ts:32`). Materializar a lista preserva o primeiro efeito, mas apagaria o segundo. Por isso a v5 separa a lista da confirmação:

```ts
interface EventScope {
  offers: string[]; // sempre listadas; usadas pela contagem
  confirmed: boolean; // o campus escolheu essas ofertas
}
```

- `confirmed` registra um fato (houve escolha), não uma avaliação derivada. Cobertura em policies com `explicitRecordOffers` só considera escopo confirmado; nas demais, o valor não altera o resultado.
- Salvar o formulário da data confirma o escopo. Acrescentar uma oferta ao calendário não estende nem confirma escopos existentes.
- Hoje o acréscimo de oferta (`prepare-save.ts:33-40`) materializa `offers` vazias com as ofertas anteriores, o que já satisfaz a cobertura sem confirmação. A v5 corrige esse efeito; inventariar quantas datas já passaram por ele, sem reverter automaticamente.

| Origem                           | Conversão                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| Lista não vazia                  | Mesmos IDs, mesma ordem; `confirmed: true`                                                |
| Ausente ou vazia                 | Ofertas do próprio estado de origem, na ordem; `confirmed: false`; registrar no manifesto |
| Estado sem ofertas ou IDs órfãos | Caso excepcional: inventariar e decidir antes de autorizar a conversão                    |

Envios usam suas próprias ofertas, nunca as atuais. Snapshots institucionais mantêm seu escopo por tipo de oferta.

### 5.4 Destino de ingresso

Modelar destino por oferta já na v5, porque a mudança de formato vai acontecer de qualquer modo:

```ts
interface AdmissionNotice {
  publication?: 'planned' | 'published';
  admission?: {
    type?: 'regular' | 'transfer';
    year?: number;
    term?: AcademicTerm;
    destinations: { offerId: string; periodId: string }[]; // vazio = não informado
  };
}
```

- Conversão: o `periodId` antigo é copiado para cada oferta da data, sem confirmar adequação. Período removido ou incompatível é conservado e diagnosticado; nunca vira ausência.
- A UI de destinos distintos por oferta fica para a fase 3: na fase 2 o formulário edita um destino comum e mostra o diagnóstico por oferta. Nenhum dado atual tem destinos distintos (os quatro editais auditados não têm `admission`), então isso evita construir agora um fluxo sem caso real, sem exigir nova migração depois.

### 5.5 Configuração de etapas incompleta

Substituir `legacyStageCount` por quantidade informada sem ciclo confirmado (ex.: `stages: { status: 'reported'; count: 4 } | { status: 'defined'; perTerm: number }`). Confirmar a organização resolve explicitamente quantidade, ciclos e posições, com prévia dos vínculos que ficarão pendentes ou divergentes. Retirar `PeriodAssociationV4`, `CalendarActivityV4` e leitores v4 após o corte.

### 5.6 Avaliação calculada

Um módulo de domínio, consumido por UI, backend, comparação e impressão, calcula separadamente:

| Dimensão       | Valores                              | Fonte                                                        |
| -------------- | ------------------------------------ | ------------------------------------------------------------ |
| Classificação  | pendente · compatível · divergente   | vínculo + organização + períodos                             |
| Aplicabilidade | obrigatória · opcional · a confirmar | policy + configuração                                        |
| Cobertura      | pendente · parcial · completo        | datas da atividade, início/término, horas, escopo confirmado |
| Execução       | publicação programada · realizada    | dados do edital                                              |
| Revisão humana | conferido ou não                     | parecer                                                      |

Nenhuma dessas dimensões é persistida como flag. As 21 datas ficam com classificação pendente por oferta e nunca contam como atendimento apenas por terem datas ou terem sido migradas. Alterar organização ou etapas não remove vínculos. Datas internas não entram na cobertura (não têm atividade) e não alteram a contagem (efeito `note`).

## 6. Migração v5

Classificação: **nível 2** ([Implantação e operação](../implantacao-convex-vercel.md#níveis-de-risco)).

### Inventário

Antes de fechar o conversor, inventariar todos os documentos: `calendarContents.state.events`, `institutionalSnapshot`, cópias em `calendarSubmissions`, e referências em `reviews`, `reviewVersions`, catálogo, comparação de envios, impressão e importação/exportação. Inventariar `requirementId`, `kind`, `recordType`, `legacyStageCount`, ordinais de etapa, `offers` ausente/vazio/explícito, `admission.periodId` e vínculos mantidos pela fase 1 sem atividade gerada. Vínculo desconhecido ou ambíguo interrompe a preparação; não inferir pela descrição nem por regex permissivo.

### Matriz de conversão (exemplos; a matriz completa sai do inventário)

| Origem                                      | Destino                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `final-0` / `final-1` / `final-2`           | `activity: { activityId: 'final', term: 'annual' / 'first' / 'second' }`                                            |
| `pit-1` (repetição por semestre)            | `activity: { activityId: 'pit', semester: 'first' }`                                                                |
| `stage-3:integrado`, organização indefinida | `activity: { activityId: 'stage', offerId: 'integrado', position: { status: 'unclassified', reportedOrdinal: 3 } }` |
| `family-meeting`                            | `activity: { activityId: 'family-meeting' }`                                                                        |
| sem `requirementId`                         | sem `activity`                                                                                                      |
| `kind`                                      | `effect`                                                                                                            |
| `offers` explícita / ausente ou vazia       | `scope` com `confirmed: true` / `false` (seção 5.3)                                                                 |
| `publicationStatus`, `admission`            | `notice`                                                                                                            |
| `legacyStageCount: 4`                       | `stages: { status: 'reported', count: 4 }`                                                                          |
| —                                           | `internal` não é criado; toda data convertida é oficial                                                             |

A matriz identifica a atividade pela declaração e pela base de repetição, nunca só pelo sufixo numérico.

### Conversor

- Função pura e determinística, chamada só por `convex/migrations.ts`. Validators de armazenamento antigos separados dos públicos novos. `schemaVersion: 5`.
- Não usar normalização/salvamento comuns como conversor (recalculam datas, categorias, férias).
- Idempotente: documento v5 não é reescrito. Unidade de retomada = documento inteiro: estado, snapshot e `contentHash` do mesmo envio na mesma transação.
- Etapas entre documentos ordenadas e com verificadores; ensaio interrompe entre lotes e confirma a retomada.

### Provas

- Manifesto privado, fora do Git, por documento/data: forma e vínculo de origem, destino, mudanças e hashes antes/depois. Recuperar a origem a partir de conversão + manifesto, não só por contagem.
- Correspondência um a um: nenhuma data criada, removida, fundida ou movida. Não deduplicar os seis pares anual/semestral coincidentes nem os dois registros de revisão de resultados de Cascavel na mesma data.
- Contagem letiva, abrangência, horas e impressão iguais antes/depois.
- Cobertura e aplicabilidade por atividade/oferta iguais antes/depois, exceto pela nova classificação pendente dos vínculos sem atividade gerada; nenhuma atividade passa a completa por causa da conversão.
- Preservar `calendars.version`, `updatedAt`, `submission.contentVersion`, autoria e pareceres; migração registrada como operação técnica, sem versão acadêmica nova (`convex/calendars/authorship.ts`).
- Recalcular o hash dos envios de forma coordenada, guardando o original no manifesto; testar envio igual ao conteúdo atual e envio diferente. Mapear `baseIdentity` só com prova de equivalência.
- Representação equivalente não é reavaliação: parecer desatualizado nunca é promovido; calendários `revisado`/`vigente` mantêm publicação e status.

### Concorrência e corte

- `saveCalendar` exige contrato v5; `saveReview` exige marcador de formato v5; `synchronizeBase` e identificação preservam suas comparações sem nova contagem de versão.
- Durante expansão/conversão, leitores afetados respondem com indisponibilidade operacional (manutenção hoje bloqueia escritas, não todas as queries), mantendo autenticação e consulta de manutenção. Testar abas antigas e queries reativas.
- Tipos do armazenamento alargado não vazam para DTOs nem são estreitados por cast.

### Release

1. Código, conversor, verificadores e testes locais.
2. Ensaio sobre backup integral restaurado em deployment descartável; plano de recuperação definido.
3. Manutenção com proprietário; snapshot e inventário atuais.
4. **Expansão:** schema aceita v4 e v5 só para converter; aplicação e contratos só v5; migrações em `pending` concluem antes de promover o frontend.
5. Conferência de dados, respostas, recusa de cliente antigo e invariantes. Falha mantém a manutenção; nada de repetir escritas ou restaurar às cegas.
6. Reabertura quando todos os dados forem v5 e todas as escritas recusarem v4 (registrar o ponto).
7. **Contração** em release posterior: retirar v4 do schema, conversor e entrada em `pending`.

Ambas via `pnpm deploy:production` com manutenção. Restaurar backup é decisão operacional própria.

## 7. Fora do escopo desta entrega

- **Versionamento de regras operacionais** (`unconfigured:<ano>`, 2027 só com pós-graduação): a migração é só de representação e não muda condições de conferência; logo não exige reavaliação. Estender o histórico de rulesets às policies operacionais é melhoria legítima, mas independente; vai para plano próprio. Enquanto isso, a migração não pode alterar a atualidade de pareceres nesses escopos.
- Divisão de uma data entre atividades/ciclos por oferta (fase 3).
- UI de destinos de ingresso distintos por oferta (fase 3; o modelo já suporta).
- Associação automática entre catálogo institucional e atividades.
- Calendário de eventos locais como documento separado (art. 18): atendido pelas datas internas e pela versão completa impressa.
- Renomear ofertas, períodos, calendários, envios ou pareceres.

## 8. Fases

### Fase 1 — Etapa "Atividades" sobre o modelo atual (sem migração)

Entrega a correção visível, interrompe a perda de vínculos e troca a interface antes da operação de risco. Não muda o formato persistido; muda regras de domínio e de gravação.

**Gravação e comandos (pré-requisito da remoção do seletor):**

- `saveCalendar` recebe o estado inteiro (`convex/calendars.ts:214`), então a regra vale na fronteira de gravação, comparando com o estado persistido anterior por ID de data:
  - um vínculo sem atividade gerada é aceito somente se já constava, idêntico, na mesma data (mesmo ID) do estado anterior;
  - vínculo novo ou alterado precisa de atividade gerada pela configuração atual;
  - uma data persistida não perde nem troca `requirementId` por gravação; só a exclusão da data remove o vínculo.
- `normalize-v4.ts` passa a receber o estado anterior para aplicar essa regra.
- Três verificações distintas, com regras próprias:
  1. **Identidade do vínculo:** a data mantém o mesmo `requirementId` do estado anterior. Dispensa a exigência de atividade gerada; nada mais.
  2. **Data editada:** início, término, ofertas ou vínculo diferentes do estado anterior. Toda validação de intervalo e associação se aplica a ela (`assessment-intervals.ts:24-43`, `validation.ts:103-115`, `normalize-v4.ts:192-212`: dentro do período do ciclo, duplicidade, sequência, oferta única); um conflito com outra data, mesmo inalterada, recusa a gravação.
  3. **Data inalterada:** início, término, ofertas e vínculo iguais ao estado anterior. Nunca é recusada por conflito de intervalo ou associação, mesmo que a configuração tenha mudado (organização, quantidade de etapas, períodos) e alterado seu ciclo; o conflito vira diagnóstico em **Vínculo a conferir** (**Fora do período do ciclo**, **Etapa duplicada**, **Etapas fora de sequência**).
- Isso substitui a comparação atual de `validateEditedAssessmentCycles` (`convex/calendars.ts:63-95`), que também compara o ciclo e recusaria uma etapa inalterada após reduzir a quantidade de etapas. Mudança de configuração nunca é recusada por datas existentes; mudança de data é sempre validada.
- Nenhuma data em **Vínculo a conferir** conta como atendimento, entra na contagem de dias por etapa ou na distribuição impressa até o campus excluir uma delas ou ajustar início e término.
- Datas regeneradas pelo sistema conservam o vínculo existente pelo ID: férias docentes (`normalize-v4.ts:94-104`, `commands/vacations.ts:22`) recriam `teacher-vacation-*` a partir de `teacherVacations()` sem `requirementId`; se a data persistida com esse ID tiver vínculo, copiá-lo para a data regenerada.
- O comando de edição de data (`commands/events.ts:60`) aplica a mesma regra: hoje ele recusa qualquer `requirementId` sem atividade gerada, inclusive ao editar. Passa a aceitar o vínculo preexistente e inalterado da própria data, sem aplicar a restrição de oferta da atividade (que não existe), para que descrição, início, término, ofertas e demais campos possam ser editados.
- Organização da oferta: `offerOrganizationIssues()` deixa de recusar por vínculos incompatíveis e passa a listá-los como aviso na prévia (“ficarão em Vínculo a conferir”); `applyOfferOrganization()` deixa de apagar `requirementId` e `assessmentAutoStart` e de converter etapas aposentadas ou duplicadas em notas sem vínculo. O comando não cria data nova para uma etapa que já tem data persistida com o mesmo vínculo. A divisão de uma data por destino de ingresso (`organization/offers.ts:375-384`, que cria outro ID) não se aplica a datas com vínculo sem atividade gerada: elas ficam inteiras, com o destino anterior, e aparecem na prévia; a fase 2 resolve isso com destinos por oferta. Datas com atividade gerada continuam divididas como hoje, e a nova data passa pela regra de vínculo novo. Assim o backend não precisa provar a origem de uma divisão. A recusa por editais vinculados a períodos (`organization/offers.ts:221-225`) continua, porque o destino de ingresso segue editável no formulário.
- Remover o seletor e `changeRequirement` só depois dessas regras e de uma regressão no navegador que edite e salve uma das datas pendentes das fixtures e confirme a organização de uma de suas ofertas, para que nenhum calendário fique impedido de salvar, editar ou classificar ofertas.

**Caminhos que leem ou alteram vínculos.** Levantamento por `requirementId` e `activityChecklist(` em `src/`, `convex/` e `web/` (02/11/2026). Todo caminho de escrita ou validação precisa seguir a regra de preservação; nenhum pode continuar como saída alternativa que apague ou bloqueie vínculos.

| Caminho                                                                                                                                                         | Hoje                                                                                                  | Fase 1                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normalize-v4.ts:155-212`, chamado por `saveCalendar`                                                                                                           | Recusa vínculo sem atividade gerada; recusa etapas duplicadas ou fora de sequência                    | Regra de preservação pelo estado anterior; conflitos só de vínculos preexistentes aceitos                                                                      |
| `convex/calendars.ts:63-95` `validateEditedAssessmentCycles`                                                                                                    | Aceita intervalo de avaliação só se data, ofertas, vínculo e ciclo forem iguais                       | Substituída pela regra de três verificações; mover para o domínio e usar em todos os caminhos desta tabela                                                     |
| `activities/validation.ts:103-115`, `activities/assessment-intervals.ts:24-43`                                                                                  | Recusam intervalo de avaliação fora do período do ciclo ou sobreposto                                 | Aplicar só a datas editadas; em datas inalteradas, diagnóstico                                                                                                 |
| `normalize-v4.ts:94-104`, `commands/vacations.ts:22`                                                                                                            | Regeneram férias docentes por ID, sem `requirementId`                                                 | Copiar o vínculo da data persistida de mesmo ID                                                                                                                |
| `organization/offers.ts:375-384` (divisão por destino de ingresso)                                                                                              | Cria nova data com outro ID e o mesmo vínculo                                                         | Não dividir datas com vínculo sem atividade gerada                                                                                                             |
| `printing/teaching-day-breakdown.ts:60-70`                                                                                                                      | Distribui dias por etapa quando há uma única data por `stage-N:oferta`                                | Ignorar datas em **Vínculo a conferir** (duplicadas, fora de sequência ou do ciclo)                                                                            |
| `commands/events.ts:60-66` e `:107` (criar/editar data)                                                                                                         | Recusa vínculo sem atividade gerada também ao editar; restringe a oferta da atividade                 | Aceita o vínculo inalterado da própria data; restrição de oferta só quando a atividade existe                                                                  |
| `activities/validation.ts:77-83` (referência anterior, datas fora do ano)                                                                                       | Recusa vínculo cuja atividade não aceita referência anterior                                          | Mesma regra: vínculo inalterado sem atividade gerada não é reavaliado por essa verificação; vínculo novo ou alterado continua sujeito a ela                    |
| `organization/offers.ts:191-220` `offerOrganizationIssues()`                                                                                                    | Recusa confirmar organização                                                                          | Aviso na prévia, sem recusa                                                                                                                                    |
| `organization/offers.ts:365-417` `applyOfferOrganization()`                                                                                                     | Apaga vínculos; converte etapas em notas                                                              | Conserva vínculos e etapas                                                                                                                                     |
| `prepare-save.ts:53` (retirada de `legacyStageCount`)                                                                                                           | Usa `offerOrganizationIssues()` para exigir organização completa                                      | Recebe a mesma mudança: vínculos incompatíveis não impedem retirar a quantidade anterior                                                                       |
| `commands/organization.ts:69-104` `configureAssessment`, `:106` `configureOrganization`; `commands/periods.ts:36` `applyPeriod`, `:191` `removePeriod`          | Apagam vínculos ou recusam “Revise as atividades vinculadas”; sem chamadas na aplicação, só em testes | Remover na fase 1, com seus testes, para não restar caminho alternativo que contrarie a regra; se algum for necessário, alinhá-lo à regra                      |
| `normalization/input-v4.ts:130` (importação de JSON)                                                                                                            | Aceita qualquer texto                                                                                 | Importação é gravação: vínculos iguais aos já persistidos nas mesmas datas são preservados; os demais exigem atividade gerada, com mensagem que lista as datas |
| `counting/assessment-days.ts:14`, `activities/assessment-intervals.ts:24-43`, `offers.ts:100`                                                                   | Leem `stage-N:oferta` para dias e sequência de etapas                                                 | Intervalos em **Vínculo a conferir** não entram no cálculo de dias por etapa nem na sequência; testar com etapa duplicada preservada                           |
| `coverage.ts:31-40`                                                                                                                                             | Conta datas vinculadas sem verificar duplicidade ou sequência                                         | Usar o diagnóstico compartilhado: datas em **Vínculo a conferir** não contam como atendimento                                                                  |
| `readiness.ts:77`, `technical-support.ts`, `base.ts:66`, `diff.ts:69,96,351`                                                                                    | Leem o vínculo                                                                                        | Sem mudança de regra; conferir que vínculo preservado sem atividade não lança erro                                                                             |
| `web/.../events/` (`EventEditorProvider`, `EventEditor`, `event-draft`, `EventPanel`, `ActivityChecklist`, `activity-list`, `ActivityDetails`, `campus-events`) | Seletor, `changeRequirement`, listas e painel                                                         | Etapa única, grupos e remoção do seletor (seção 4)                                                                                                             |
| `SaturdaysForm.tsx:168`, `IssuesSection.tsx`, `CalendarPreviewSection.tsx`, `web/features/rules/rules-view.ts`                                                  | Escolhem a etapa de destino ou exibem o nome da atividade                                             | Apontar para a etapa **Atividades**; vínculo sem atividade gerada exibe o identificador gravado e o motivo, sem quebrar a tela                                 |

**Interface:**

- Etapa única **Atividades** com visões **Por atividade** / **Por data**, filtros (exceto Visibilidade), datas ajustáveis a resolver e grupos especiais (seção 4); remover `/eventos`, `/atividades-campus`, `?aba=eventos` e **Registros do calendário** na prévia.
- `campusEvents()` deixa de existir. Data com `requirementId` sem atividade gerada vai para **Vínculo a conferir**, por regra direta, sem parser nem fallback. As 21 deixam de aparecer como datas do campus.
- Novos textos de interface e impressão (publicação programada/realizada).

**Limitação até a fase 2:** datas em **Vínculo a conferir** não têm correção pela interface; o campus pode editar início, término e descrição, excluir a data ou ajustar a organização. Nessa fase, esse grupo gera aviso na revisão e conclusão, sem bloquear a conclusão (hoje essas datas nem são avaliadas); o bloqueio entra na fase 2, junto com **Corrigir atividade vinculada**.

**Roteiro da fase 1.** A ordem garante que o seletor só sai quando nenhum caminho depende dele. Commits só em estado verde: o passo 1 (testes vermelhos) não é commitado sozinho; entra junto com os passos 2 e 3. Antes de cada commit de código, `AGENTS.md` exige `pnpm check`; o responsável pede para ser consultado antes de rodar a suíte completa, então combinar no hand off se cada commit roda a suíte ou se os commits intermediários usam typecheck, lint e testes afetados, com `pnpm check` antes de concluir a fase.

**Prova de gravação.** A suíte de navegador usa um cliente sintético que aceita o estado sem passar pelas mutations (`test/fixtures/editor-client.ts:123`), e E2E remoto exige autorização própria (`docs/verificacao.md`). O aceite combina: (a) navegador com o cliente sintético para os fluxos de interface; (b) `convex-test` chamando `saveCalendar` com as mesmas fixtures para provar as validações reais do backend. Não usar deployment remoto nesta fase.

| Passo | Trabalho                                                                                                                                                                                                                                                                                                                                                                                                                   | Pronto quando                                                                                                                                                 |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Fixtures sintéticas dos dois rascunhos (seção 11), mais: etapa duplicada preexistente, duas etapas em sequência invertida, férias docentes com vínculo, edital com destino de ingresso e vínculo sem atividade gerada. Testes que reproduzem hoje: gravação recusada, edição recusada, confirmação de organização recusada, redução de etapas recusada, vínculos apagados (organização e férias), datas na lista do campus | Testes novos falham pelos motivos descritos (sem commit isolado)                                                                                              |
| 2     | Regra de três verificações no domínio (identidade do vínculo, data editada, data inalterada) e diagnóstico compartilhado de **Vínculo a conferir** (sem atividade gerada, fora do período do ciclo, etapa duplicada, fora de sequência), substituindo `validateEditedAssessmentCycles`                                                                                                                                     | Função pura testada isoladamente, sem React nem Convex, com um caso por verificação                                                                           |
| 3     | Aplicar a regra em `normalize-v4.ts`, `saveCalendar`, `commands/events.ts`, `activities/validation.ts`, `assessment-intervals.ts`, férias docentes e importação de JSON                                                                                                                                                                                                                                                    | Testes do passo 1 de gravação, edição e férias passam; vínculo novo sem atividade, troca, remoção e conflito criado por edição continuam recusados            |
| 4     | Organização: `offerOrganizationIssues()` vira aviso, `applyOfferOrganization()` conserva e não divide datas com vínculo sem atividade gerada, `prepare-save.ts:53` acompanha; remover `configureAssessment`, `configureOrganization`, `applyPeriod`, `removePeriod` e seus testes                                                                                                                                          | Testes do passo 1 de organização e de redução de etapas passam; nenhuma função de `src/` remove `requirementId` fora da exclusão da data (conferir por busca) |
| 5     | Leituras: cobertura, contagem de dias por etapa e distribuição impressa usam o diagnóstico compartilhado; leituras da tabela sem erro com vínculo preservado                                                                                                                                                                                                                                                               | Testes de cobertura, contagem e `teaching-day-breakdown` com etapa duplicada e sequência invertida; demais datas inalteradas                                  |
| 6     | Prova de gravação: `convex-test` de `saveCalendar` com as fixtures; navegador com cliente sintético para salvar alteração não relacionada, editar uma data pendente e confirmar a organização de uma oferta                                                                                                                                                                                                                | Os dois conjuntos passam, ainda com o seletor presente                                                                                                        |
| 7     | Etapa única **Atividades**: rotas, `editorSteps`, parâmetros `atividade*`, visões, filtros (exceto Visibilidade), datas ajustáveis a resolver, grupos especiais, prévia sem **Registros do calendário**, `SaturdaysForm`, `IssuesSection`, `history`                                                                                                                                                                       | Testes de interface da seção 9 (exceto datas internas) em desktop e mobile                                                                                    |
| 8     | Remover o seletor e `changeRequirement`; backend recusa troca de vínculo                                                                                                                                                                                                                                                                                                                                                   | Regressão do passo 6 repetida sem o seletor; nenhuma referência restante ao seletor no código                                                                 |
| 9     | Textos de publicação programada/realizada na UI e na impressão; `docs/uso.md` e `docs/componentes-interface.md`; screenshots intencionais                                                                                                                                                                                                                                                                                  | Impressão conferida no Chromium; `pnpm check` aprovado antes de concluir a fase                                                                               |

### Fase 2 — Modelo v5, datas internas e migração

Vínculo estruturado (`activity`), `effect`, `notice`, `scope` com confirmação, `internal` com impressão oficial/completa e filtro Visibilidade, destinos por oferta (com edição de destino comum), etapas informadas, origem por contêiner, renomeações de código (`CalendarActivity` → `CalendarEvent`, `ActivityRule`, `ActivityPlanItem`, `activityPlan()`, `CountingInterval`), `changeActivity` para a data inteira, avaliação calculada em dimensões, migração e corte (seção 6).

Datas internas entram na fase 2 porque acrescentam um campo persistido; a fase 1 não muda o formato.

### Fase 3 — Extensões sob demanda

Divisão confirmada entre ofertas, UI de destinos distintos por oferta e versionamento de regras operacionais, cada uma com plano próprio quando houver caso real.

## 9. Validação

Por fase, rodar a menor suíte afetada; `pnpm check` antes de commitar código (perguntar antes da suíte completa); ensaios/E2E remotos só com opt-in. Consultar [Verificação](../verificacao.md).

- **Domínio:** vínculo inválido recusado (reunião com posição de etapa); calendário novo com configuração incompleta; PIT/RIT/Plano de Ensino em oferta anual, semestral e mista; mudança de quantidade de etapas sem reinterpretação; `changeActivity` com prévia.
- **Gravação (fase 1):** os dois rascunhos auditados salvam alterações não relacionadas; vínculo sem atividade preexistente é aceito; vínculo novo sem atividade, troca ou remoção por gravação são recusados; mudar organização para anual e reduzir etapas conserva vínculos e os mostra em **Vínculo a conferir**; data com vínculo sem atividade gerada não é dividida por destino de ingresso; reduzir a quantidade de etapas não recusa etapa inalterada e a mostra como **Fora do período do ciclo**; férias docentes regeneradas conservam o vínculo; etapa duplicada preexistente salva e aparece como **Etapa duplicada**, sem contar como atendimento; criar ou alterar uma data que gere duplicidade é recusado.
- **Edição (fase 1):** pelo comando e pelo navegador, editar descrição, início, término e ofertas de uma data com vínculo sem atividade gerada salva e conserva o vínculo.
- **Comandos:** `createCampusDate` recusa `activity`; `updateDate` não altera `activity`; acréscimo de oferta sobre cada forma de abrangência, sem estender nem confirmar escopo; escopo não confirmado não conta como atendimento em 2027; destino órfão/incompatível conservado.
- **Datas internas:** recusadas em data com atividade, em data da base, com efeito `include`/`exclude` e em categorias efetivas fora da lista; data sem categoria e efeito `note` aceita como `institucional`, antes e depois de `kind` → `effect` e após exportar/importar JSON; marcar/desmarcar preserva ID, início, término e escopo; contagem letiva idêntica nas versões oficial e completa; versão oficial sem nenhuma data interna na grade e nas listas; versão completa com marcação e cabeçalho; cópia de envio conserva `internal`; marcar ou desmarcar, como única alteração, aparece na comparação como **Visibilidade**; data interna com nome que casa um critério textual não vira candidata no parecer nem libera publicação; filtro **Oficiais** mantém atividades sem datas em **A preencher**.
- **Conversão:** cada forma inventariada; vínculo desconhecido interrompe; reexecução; interrupção/retomada; alteração concorrente; envio com ofertas diferentes das atuais; atomicidade conteúdo/hash.
- **Interface (desktop e mobile):** as 21 em **Vínculo a conferir** e em **Por data**; filtros combinados com contadores coerentes em cada unidade de visão; aviso de atividades sem datas em **Por data**; link de revisão para atividade com e sem datas, inclusive a partir de **Por data**; observância órfã resolvível nas duas visões; filtros da etapa e de documentos independentes na URL; **Preencher atividade** com ofertas contextuais em calendário misto; **Nova data do campus** sem seletor; duas datas da mesma atividade com rascunhos independentes; grupo da base abre quando uma ação exige; escolha da versão impressa refletida na prévia; teclado e retorno de foco.
- **Impressão:** conferir no Chromium as duas versões quando `src/printing/` ou CSS de impressão mudarem; datas anuais e semestrais coincidentes continuam distintas.
- **Visual:** inspecionar screenshots e atualizar apenas referências intencionais no macOS.

## 10. Critérios de aceite

- Toda data local aparece em **Por data**; toda data vinculada aparece em **Por atividade**, na atividade correspondente ou em **Vínculo a conferir**. Nenhuma depende de exigência gerada para ser visível. Toda escolha de observância pendente tem linha resolvível.
- Desde a fase 1, nenhuma gravação, edição ou comando de organização remove ou troca um vínculo persistido, e nenhum calendário fica impedido de salvar ou editar por vínculo preexistente sem atividade gerada ou em conflito.
- Nenhum escopo passa a contar como confirmado sem escolha do campus.
- Uma única etapa **Atividades**; origem e vínculo são filtros calculados; não há campo persistido de seção.
- Datas do campus sem seletor de atividade; o contexto define a atividade; backend garante os mesmos contratos.
- Datas internas só existem em datas do campus com efeito `note` e categoria efetiva permitida; a versão oficial impressa, as evidências do parecer e a liberação de publicação não consideram nenhuma; as duas versões impressas têm a mesma contagem letiva; a comparação mostra mudanças de visibilidade.
- Execução normal usa só v5: sem `requirementId`, `kind`, `recordType`, `legacyStageCount`, aliases v4 ou fallback para IDs antigos de 2027.
- Semestre de referência distinto de ciclo da oferta no tipo; compartilhamento anual/semestral válido não gera divergência.
- Conversão preserva conteúdo, identidade, abrangência, versão acadêmica, autoria, pareceres e envios, comprovada por manifesto e ensaio.
- Pendências e divergências são explicadas, filtráveis em **A preencher**, corrigíveis e nunca contam como atendimento.

## 11. Particularidades obrigatórias das fixtures

Datas de 2027, preservadas mesmo quando pedem conferência acadêmica.

| Campus   | Vínculo original     | Início → término | Particularidade                                                                                      |
| -------- | -------------------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| Ivaiporã | `final-1`            | 22/06 → 22/06    | Integrado e Subsequente                                                                              |
| Ivaiporã | `final-2`            | 14/12 → 17/12    | Coincide com dados de registro anual distinto                                                        |
| Ivaiporã | `diary-1`            | 01/07 → 01/07    | Integrado e Subsequente                                                                              |
| Ivaiporã | `diary-2`            | 20/12 → 23/12    | Coincide com dados de registro anual distinto                                                        |
| Ivaiporã | `final-appeal-1`     | 18/06 → 24/06    | Integrado e Subsequente                                                                              |
| Ivaiporã | `final-appeal-2`     | 15/12 → 20/12    | Preservar 28 horas; registro anual tem início e horas diferentes                                     |
| Ivaiporã | `registration-1`     | 25/01 → 29/01    | Exigência local de matrícula; coincide com dados de registro anual distinto                          |
| Ivaiporã | `admission-notice-1` | 20/11 → 20/11    | Descrição menciona 1º semestre; não corrigir novembro; coincide com dados de registro anual distinto |
| Ivaiporã | `admission-notice-2` | 17/06 → 17/06    | Preservar ausência de metadados de ingresso/publicação                                               |
| Ivaiporã | `recognition-1`      | 11/02 → 19/02    | Coincide com dados de registro anual distinto                                                        |
| Ivaiporã | `recognition-2`      | 20/07 → 29/07    | Integrado e Subsequente                                                                              |
| Cascavel | `final-1`            | 21/07 → 21/07    | Integrado e Graduação                                                                                |
| Cascavel | `final-2`            | 21/12 → 21/12    | Integrado e Graduação                                                                                |
| Cascavel | `diary-1`            | 11/07 → 11/07    | Integrado e Graduação                                                                                |
| Cascavel | `diary-2`            | 23/12 → 23/12    | Coincide com dados de registro anual distinto                                                        |
| Cascavel | `final-appeal-1`     | 16/12 → 16/12    | Mesmo dia do registro semestral seguinte; preservar ambos                                            |
| Cascavel | `final-appeal-2`     | 16/12 → 16/12    | Integrado e Graduação                                                                                |
| Cascavel | `admission-notice-1` | 04/01 → 04/01    | Integrado e Graduação                                                                                |
| Cascavel | `admission-notice-2` | 05/07 → 05/07    | Somente Graduação; descrição original diz “Cursos semestrais”                                        |
| Cascavel | `recognition-1`      | 31/03 → 31/03    | Integrado e Graduação                                                                                |
| Cascavel | `recognition-2`      | 31/08 → 31/08    | Somente Graduação                                                                                    |

Os quatro editais estão sem `admission` e `publicationStatus`: preservar as ausências e mostrar a pendência. Descrições completas e IDs vêm do inventário privado da execução, sem dados pessoais nas fixtures.

## 12. Documentação

Atualizar `docs/uso.md` (inclusive versão oficial × completa e qual delas enviar à Proens), `docs/componentes-interface.md` e `docs/migracao-schema.md` (hoje descreve o formato 4 e a conservação de vínculos legados de 2027). Após a contração, descrever só o formato suportado.

## Histórico

- Plano de identidade e migração: duas revisões independentes por subagentes (02/11/2026), incorporadas: destino incoerente conservado como dado; correção de associação obrigatória; histórico × novas verificações; versão acadêmica não incrementada; tipos mínimos; semestre de referência; abrangência do próprio estado; retomada atômica; rascunho por ID.
- Plano de nomenclatura: avaliado pelo Claude Code CLI (02/11/2026), incorporado: vínculo opcional sem discriminante; `CountingInterval`; origem pelo contêiner; declaração composta com repetição; Publicação programada/realizada.
- Consolidação: etapa única com visões e filtros; semestre de referência como forma própria do vínculo; `notice` agrupado; fases; versionamento operacional, divisão e UI de destinos por oferta movidos para fora do escopo.
- Revisão pelo Codex CLI 0.166.0 (02/11/2026, somente leitura, sem testes nem rede), achados conferidos no código e incorporados: P1 gravação recusa vínculos sem atividade gerada e bloquearia os dois rascunhos sem o seletor; P1 comandos de organização apagam vínculos e o contrato precisa valer na fronteira de gravação; P2 materializar ofertas confirmaria cobertura (`EventScope.confirmed`); P2 observâncias órfãs sem lugar; P2 colisão de `situacao`/`busca` na URL (prefixo exclusivo); P2 só intervalos de avaliação ficam em Etapas de avaliação; P2 ofertas contextuais no preenchimento de atividades; P2 unidade dos contadores e links na visão por data. Parecer do revisor antes da incorporação: não pronto para a fase 1.
- Leitura da Resolução CONSUP/IFPR nº 292/2026 (02/11/2026): vocabulário Atividade + Data no lugar de Evento + Regra, porque a norma usa “datas” como unidade (arts. 2º e 11) e reserva “evento” a itens específicos (art. 11, XVII, XIX, XXIV a XXVI; arts. 12 e 18); etapa **Atividades**, visões **Por atividade** / **Por data**; datas internas com impressão oficial/completa para atender ao art. 18. Plano renomeado de `2026-11-02-eventos-e-regras.md` para este arquivo.
- Segunda revisão pelo Codex CLI 0.166.0 (02/11/2026, somente leitura; sem acesso à resolução), achados conferidos no código e incorporados: P1 o comando de edição (`commands/events.ts:60`) também recusa vínculos sem atividade gerada e bloquearia a edição das datas preservadas; P2 existência da atividade separada da validade da associação (etapas duplicadas ou fora de sequência preexistentes); P2 datas internas fora das evidências do parecer e da liberação de publicação; P2 `internal` na comparação de versões (`fieldLabels`); P2 filtro Visibilidade sem esconder atividades sem datas; P2 elegibilidade de data interna pela categoria efetiva. Parecer do revisor antes da incorporação: não pronto para a fase 1.
- Terceira revisão pelo Codex CLI 0.166.0 (02/11/2026, somente leitura, só a fase 1), achados conferidos no código e incorporados: P1 férias docentes regeneradas apagavam vínculos; P1 “inalterado” separado em identidade do vínculo, data editada e data inalterada, substituindo `validateEditedAssessmentCycles`; P1 divisão por destino de ingresso sem prova de origem no backend (datas com vínculo sem atividade gerada não são divididas); P2 cobertura e distribuição impressa usam o diagnóstico compartilhado; P2 prova de gravação por `convex-test` mais navegador com cliente sintético; P3 commits só em estado verde e `pnpm check` conforme `AGENTS.md`. Parecer do revisor antes da incorporação: fase 1 não pronta para hand off.
