# Ciclo de vida do calendário

Data: 31/10/2026.

Status: concluído em 01/11/2026, salvo o destaque na grade dos dias alterados, previsto para uma segunda etapa. A release 1 foi publicada com a migração `calendarPurposeToStatus` (39 calendários); a operação de nível 2 apagou 218 versões e 218 snapshots do histórico em produção, depois de ensaio sobre o backup restaurado; a release 2 estreita o schema.

## Objetivo e decisões de escopo

Substituir a divisão entre calendário de teste e calendário definitivo (`calendars.purpose`) por um ciclo de vida explícito, do rascunho à publicação. Um calendário "de teste" passa a ser um rascunho que nunca é enviado.

Decisões do responsável pelo projeto:

1. A unicidade vale por **campus + ano + tipo de oferta** (`integrado`, `subsequente`, `graduacao`, `posgraduacao`). Rascunhos são ilimitados.
2. O estado final é **vigente**, com o número do processo SEI informado manualmente na publicação. O sistema passa a representar a publicação oficial desse calendário.
3. `purpose` sai do modelo, inclusive dos dados antigos, e o histórico de versões (`calendarVersions` e `calendarSnapshots`) deixa de existir. Os dados dessas tabelas são apagados nesta entrega, com o protocolo de nível 2.

Decisões tomadas após a avaliação independente:

4. Com o calendário travado, a base institucional fica congelada nos estados publicados, e nos estados em fluxo a mudança gera um aviso (ver [Base institucional com o calendário travado](#base-institucional-com-o-calendário-travado)).
5. Todos os calendários existentes são convertidos para `rascunho` (ver [Migração](#migração)).
6. Não há segregação de funções: o mesmo usuário pode concluir a revisão e publicar.
7. O diff entre dois envios faz parte desta entrega. Cada envio guarda uma cópia do conteúdo enviado (ver [Envios e comparação](#envios-e-comparação)).

## Avaliação independente

O plano foi avaliado por um subagente do Claude Code e pelo Codex CLI, ambos em modo somente leitura e sem testes, deploy ou consulta a dados de deployments. As duas avaliações apontaram os mesmos problemas principais, e este documento já os incorpora:

- **As transições invalidavam o parecer.** `reviewIsCurrent` exige `review.calendarVersion === calendar.version` (`src/domain/calendar/base.ts:185`). Se cada transição avançasse `version`, concluir e publicar desatualizariam o próprio parecer. Também quebrariam `exportReview`, a prontidão, a autoria e o "Versão N" impresso. Correção: `version` passa a contar só o conteúdo (ver [Versão e concorrência](#versão-e-concorrência)).
- **Havia leitor do histórico fora das queries retiradas.** `fullRecord` (`convex/calendars/record.ts:48`) lê `calendarVersions` e expõe `versions` em `calendarDto`. Nenhuma tela usa o campo, mas ele está no contrato e nas fixtures.
- **Faltava política para a mudança da base com o calendário travado.** Um documento publicado ou uma revisão de catálogo deixava `enviado`, `revisado` e `vigente` sem saída possível.
- **A unicidade tinha furos.** Ofertas podem ser acrescentadas num `devolvido`, que é editável. A lixeira e `restoreCalendar` não conferiam nada. A consulta precisava filtrar `deletedAt`.
- **Migração e limpeza estavam subclassificadas.** A conversão `definitive` com parecer → `em_revisao` muda significado e pode gerar conflitos entre documentos. Apagar snapshots exclui dados do usuário. As duas coisas são nível 2 pelo guia.
- **O alargamento quebrava o frontend anterior:** `createInput` sem `purpose` e a remoção imediata de `makeDefinitive`.
- **Faltavam transições:** reabrir uma revisão concluída, devolver sem parecer e desfazer um arquivamento.
- **`readOnly` é fixado por papel na criação da sessão do editor** (`CalendarEditorProvider.tsx`). Por isso o autosave, `flush` e o sincronismo da base gravariam num calendário travado.
- **A nota da devolução não tinha onde ficar.** `appendAudit` não grava `details`, e o campus não lê `reviews`.
- **`officialApproval: false` é fixo** em contratos, prontidão e impressão, o que conflita com a decisão 2.

Uma segunda rodada, com as mesmas duas ferramentas, avaliou a seção [Envios e comparação](#envios-e-comparação). As correções incorporadas:

- **Recolher não apaga o envio.** A sequência é monotônica, e as decisões formam uma lista só de acréscimos, sem um desfecho único que se sobrescreve.
- **O parecer é conferido contra o envio, não só contra a versão.** Sem isso, num reenvio sem alteração o parecer da rodada anterior valeria para a nova, e uma aba antiga gravaria nela.
- **A comparação normaliza os dois lados antes de casar os itens.** Sem isso, ela acusaria mudanças que o campus não fez:
  - a abrangência implícita de `offers`;
  - os eventos de férias derivados;
  - as observâncias refletidas no `institutionalSnapshot`.
- **Nem todo item mantém o `id`.** Dividir um período compartilhado ou recriar um evento gera um `id` novo, e observâncias, férias e semana não têm `id`.
- **O "efeito" é recalculado pelas regras atuais e só com pendências de conteúdo.** As pendências de base e de parecer dominariam a comparação de um envio antigo.
- **A autorização confere a qual calendário pertence cada envio pedido**, para impedir a leitura de envios alheios pelo identificador.
- **O cálculo vai para o navegador**, para não haver uma query reativa refazendo o diff a cada salvamento automático.

## Situação atual

- `purpose: 'test' | 'definitive'` (`convex/validators.ts:8`) é gravado em `calendars` e copiado em cada snapshot.
- O padrão diverge entre as camadas: o backend cria `definitive` quando o campo é omitido (`convex/calendars.ts:211`), e o formulário envia `test`.
- `makeDefinitive` converte de teste para definitivo, sem volta, arquiva um snapshot e avança a versão. A autoria (`convex/calendars/authorship.ts`) e os rótulos de auditoria reconhecem `MAKE_CALENDAR_DEFINITIVE`.
- Nas telas, o campo aparece em rótulos (`[TESTE]` e `[DEFINITIVO]`), no botão "Concluir e tornar definitivo", na faixa "SEM VALIDADE" e no prefixo `teste-` do nome do arquivo. `releaseReadiness` não o consulta.
- Não há trava de unicidade: `createCalendar` não confere duplicidade.
- A fila do parecerista lista todos os calendários, inclusive os de teste. Não existe envio para revisão.
- `archive()` grava um snapshot completo a cada salvamento com alteração e em `makeDefinitive`. Leem esses dados `calendarHistory`, `calendarVersion` e `fullRecord`. Nenhuma tela usa o campo `versions`, e os demais consumidores são testes e fixtures.

## Estados

| Estado       | Edição do conteúdo | Na fila do parecerista | Marca na impressão                 |
| ------------ | ------------------ | ---------------------- | ---------------------------------- |
| `rascunho`   | campus             | não                    | "Rascunho — sem validade"          |
| `enviado`    | ninguém            | aguardando             | "Cópia para análise da PROENS"     |
| `em_revisao` | ninguém            | em análise             | "Cópia para análise da PROENS"     |
| `devolvido`  | campus             | histórico              | "Em ajuste — sem validade"         |
| `revisado`   | ninguém            | concluído              | "Revisado — aguardando publicação" |
| `vigente`    | ninguém            | consulta               | "Processo SEI nº …"                |
| `arquivado`  | ninguém            | consulta               | "Arquivado" ou "Substituído por …" |

A marca depende só do status, não de `readiness.ready`. `officialApproval` passa a ser derivado: verdadeiro apenas em `vigente`. "Sem aprovação oficial" continua em todos os outros estados.

Um vigente nunca é editado no lugar. Nos estados travados, o próprio `calendarContents` (estado, `institutionalSnapshot` e `documentSnapshot`) é a versão avaliada e publicada. Cada envio também guarda uma cópia do que foi enviado (ver [Envios e comparação](#envios-e-comparação)), e é ela que preserva o conteúdo avaliado depois de uma devolução. Ver também [Base institucional com o calendário travado](#base-institucional-com-o-calendário-travado).

## Transições

A tabela fica em `src/domain/calendar/lifecycle.ts`, como função pura `(estado, ação, papel) → estado`, sem acesso a banco, com testes unitários. "CAMPUS" significa `calendarEditor` + `assertCampus`, e "PARECERISTA" significa `reviewer` (`convex/lib/authorization.ts`). O ADMIN pode executar as ações da tabela, mas nunca saltos fora dela.

| Ação            | De → para                                         | Papel       | Condições                                                                |
| --------------- | ------------------------------------------------- | ----------- | ------------------------------------------------------------------------ |
| enviar          | `rascunho`, `devolvido` → `enviado`               | CAMPUS      | Unicidade em fluxo e cobertura dos vigentes; cria o envio                |
| recolher        | `enviado` → estado de origem                      | CAMPUS      | Volta a `rascunho` ou `devolvido`; o envio fica como `withdrawn`         |
| iniciar revisão | `enviado` → `em_revisao`                          | PARECERISTA | Automática no primeiro `saveReview` do envio atual                       |
| devolver        | `enviado`, `em_revisao`, `revisado` → `devolvido` | PARECERISTA | Exige nota, gravada na decisão do envio                                  |
| concluir        | `em_revisao` → `revisado`                         | PARECERISTA | Parecer atual, do envio atual e completo, sem `NAO_ATENDIDO`             |
| reabrir         | `revisado` → `em_revisao`                         | PARECERISTA |                                                                          |
| publicar        | `revisado` → `vigente`                            | ADMIN       | SEI, parecer do envio atual e `readiness.ready`; conteúdo igual ao envio |
| arquivar        | `vigente` → `arquivado`                           | ADMIN       |                                                                          |
| restabelecer    | `arquivado` → `vigente`                           | ADMIN       | Sem vigente concorrente nos mesmos tipos de oferta                       |
| nova versão     | `vigente` → novo `rascunho` (cópia)               | CAMPUS      | O original continua vigente; grava `derivedFrom`; não copia o parecer    |

A exclusão lógica (`deleteCalendar`) fica restrita a `rascunho` e `devolvido`, inclusive para o ADMIN. Excluir um `devolvido` o rebaixa para `rascunho`, o que libera a vaga em fluxo. `restoreCalendar` sempre devolve um `rascunho`, que não ocupa vaga, e passa a conferir `version`.

## Versão e concorrência

- `calendars.version` conta só o conteúdo. Avança em `saveCalendar` e em nada mais. As transições e a migração não a alteram, e com isso continuam corretos `reviewIsCurrent`, `exportReview`, `reviewProgress.calendarChanged`, a prontidão, a autoria e o "Versão N" impresso.
- As transições recebem o status esperado (`from`) e um `statusRevision`, que avança a cada transição. Uma aba desatualizada recebe 409.
- A leitura dos concorrentes, a validação e todas as escritas acontecem na mesma mutation, inclusive o arquivamento e a auditoria de cada vigente substituído. A transação serializável do Convex garante a unicidade contra envios simultâneos.
- `saveCalendar` (inclusive o caminho sem mudança, que corrige `offerKinds` e `catalogueRevision`) e `synchronizeBase` só gravam em `rascunho` e `devolvido`.

## Unicidade

`offerKinds` é um array, e um índice do Convex não filtra por elemento. A mutation consulta `by_campusId_and_year_and_status` para cada status relevante, sem truncar a busca, descarta linhas com `deletedAt` e compara os tipos de oferta em memória.

- **Em fluxo** (`enviado`, `em_revisao`, `devolvido`, `revisado`): um único calendário por campus, ano e tipo de oferta.
  - A regra é conferida no envio.
  - Também é conferida em `saveCalendar` de um `devolvido` que acrescenta oferta. Caso contrário, a sobreposição nasceria entre as transições, e como ofertas não podem ser removidas, o campus ficaria sem correção.
- **Vigente:** um único calendário por campus, ano e tipo de oferta.
  - Na publicação, cada vigente que compartilha um tipo de oferta passa a `arquivado`, com `supersededBy`.
  - O novo calendário precisa cobrir todos os tipos de oferta de cada vigente que substitui.
  - A cobertura é conferida já no envio, para o erro não aparecer só depois da revisão, e de novo na publicação, porque os vigentes podem ter mudado no meio do caminho.
  - Para separar um vigente combinado ou descontinuar um tipo de oferta, o ADMIN pode fazer uma substituição parcial com confirmação explícita. Nesse caso, os tipos não cobertos ficam sem vigente.

## Base institucional com o calendário travado

Hoje, `inspectBase` compara o calendário com o catálogo e os documentos atuais. Quando eles mudam, aparece a pendência "Salve o calendário com a base institucional atualizada." Num estado travado, ninguém consegue resolvê-la. Regra adotada:

- Em `vigente` e `arquivado`, a avaliação e a impressão usam só a base congelada no `calendarContents`. Uma mudança posterior da base não altera um calendário publicado.
- Em `enviado`, `em_revisao` e `revisado`, a mudança da base aparece como aviso ao parecerista e ao ADMIN, sem bloquear. A saída é devolver, para o campus reconciliar e reenviar. A publicação recusa um calendário cuja base esteja incompatível.

## Envios e comparação

Em vez de um snapshot por salvamento, o sistema grava **um registro por envio**. Esse registro serve a três coisas:

- **Diff entre envios:** depois de uma devolução, o parecerista vê o que o campus mudou desde a versão que ele analisou.
- **Evidência:** o conteúdo que cada parecer avaliou continua recuperável depois que o campus edita o calendário devolvido.
- **Histórico do fluxo:** quem enviou, quando, o que foi decidido e com qual nota.

### Tabela `calendarSubmissions`

- `calendarId`, `sequence`, `submittedAt`, `submittedBy` e `submittedFrom` (`rascunho` ou `devolvido`).
  - A sequência é monotônica e nunca é reaproveitada.
- `contentVersion`: o `calendars.version` no momento do envio.
- `contentHash`: impressão digital do conteúdo enviado.
- A cópia do que foi enviado:
  - `state`, `institutionalSnapshot`, `documentSnapshot` e `catalogueRevision`, com os validadores de `calendarContents`;
  - `offerKinds`, que vem de `calendars`;
  - `campusName`, porque o `state` gravado não traz `year` nem `campus`. O ano vem de `calendars`, onde não muda.
- `decisions`: lista **só de acréscimos**, com `{ action, at, by, reviewRevision?, note? }`.
  - `action` é `withdrawn`, `returned`, `concluded`, `reopened` ou `published`.
  - O desfecho atual é a última decisão, e nada é apagado.
  - São poucas entradas por envio.
- Índice `by_calendarId_and_sequence`.

**Ponteiros em `calendars`:**

- `currentSubmissionId` aponta para o envio aberto enquanto o calendário está em `enviado`, `em_revisao` ou `revisado`.
- Em `devolvido`, aponta para o envio devolvido, de onde o campus lê a nota.
- Em `rascunho`, fica vazio.
- `publishedSubmissionId` é preenchido na publicação.

**Ciclo de vida do registro:**

- **Enviar** cria o registro com a próxima sequência e aponta `currentSubmissionId` para ele.
- **Recolher** acrescenta `withdrawn` e preserva o registro. `currentSubmissionId` volta ao envio devolvido anterior, quando o envio veio de `devolvido`, ou fica vazio. Envios recolhidos não servem de base para a comparação.
- **Devolver** acrescenta `returned` com a nota. Grava `reviewRevision` só se o parecer atual pertencer a este envio. Devolver sem parecer salvo nesta rodada não herda o parecer da rodada anterior.
- **Concluir**, **reabrir** e **publicar** acrescentam suas decisões com a revisão do parecer.
- **Publicar** confere que `currentSubmissionId` é este envio, que `review.submissionId` aponta para ele, que `calendars.version === contentVersion` e que o hash do conteúdo atual é igual a `contentHash`.
- **Excluir** um `devolvido` limpa `currentSubmissionId` e preserva os envios. Um rascunho restaurado mostra a última devolução, consultada pelos envios, como informação, e o próximo envio ainda é comparado com ela.

Os envios seguem as migrações futuras de formato de `calendarContents`. A evidência preserva o significado, mas não os bytes.

**Tamanho:** o envio tem o porte de um `calendarContents`, que já respeita o limite de 1000 eventos (`config.ts`). O envio é recusado com mensagem própria se a cópia passar de 900 KiB, com margem para o limite de 1 MiB por documento do Convex. A listagem é paginada e devolve só metadados, nunca as cópias.

### Parecer e envio

- `reviewFields` ganha `submissionId?`. Como `reviewVersions` usa os mesmos campos, cada revisão arquivada também guarda o seu.
- `saveReview` recebe o `submissionId` esperado e recusa com 409 se ele não for o `currentSubmissionId`. Assim, uma aba aberta numa rodada anterior não grava na rodada nova, mesmo depois de recolher e reenviar sem editar. `ReviewEditor` passa a identificar a rodada pelo envio.
- Concluir, publicar, `exportReview` e `humanReview.current` da prontidão passam a exigir `review.submissionId === currentSubmissionId`, além de `reviewIsCurrent`. Um parecer do envio 1 não vale para o envio 2, mesmo sem mudança de conteúdo.
- Os pareceres anteriores à release não têm `submissionId`. No primeiro envio, o parecerista abre e salva o parecer, mantendo os critérios. Essa gravação o liga ao envio.
- O parecer de uma decisão é lido em `reviews`, quando a revisão é a atual, ou em `reviewVersions`, pelo índice `by_reviewId_and_revision`.

### Comparação

A comparação fica em `src/domain/calendar/diff.ts`, como função pura, e é **calculada no navegador**. O servidor só autoriza e entrega as cópias (ver [Backend](#backend)). As cópias de envio não mudam e ficam em cache, e o conteúdo atual já está no editor. Com isso, nenhuma query reativa recalcula o diff a cada salvamento automático.

**Pares comparáveis:** só envios do mesmo calendário ou da mesma cadeia `derivedFrom`. Os `id` são locais ao calendário, e os eventos usam UUID, então comparar calendários sem relação produziria ruído.

**Normalização dos dois lados antes de casar:**

- Um evento sem `offers` é expandido para todas as ofertas do seu lado. Incluir uma oferta preenche `offers` nos eventos (`prepare-save.ts`), e isso não é mudança de abrangência.
- Os eventos de férias derivados (`teacher-vacation-*`) saem da lista de eventos. As férias são comparadas pelo objeto `teacherVacations`.
- As observâncias são casadas pela chave da regra em `observanceDates`. A semana letiva e as férias são comparadas campo a campo.
- Os eventos institucionais (`inst:${code}`) são atribuídos ao campus ou à base:
  - uma mudança explicada por uma observância alterada pertence ao campus;
  - uma mudança só em `offers`, explicada pela inclusão de oferta, não é diferença;
  - o restante pertence à base.
- `rulesetVersion`, `catalogueRevision` e `documentSnapshot` aparecem na seção da base. Um período com `targetDays` cujo fim mudou entre lados com revisões de catálogo diferentes é marcado como "possivelmente recalculado pela base".

**Casamento:** cada item é casado pelo `id`.

- Itens sem par são incluídos ou removidos.
- Entre eles, eventos com o mesmo `requirementId` e as mesmas ofertas são apresentados como "alterado (identificador novo)". Isso cobre a divisão de períodos compartilhados e de eventos vinculados (`organization/offers.ts`) e o evento excluído e recriado no editor.
- Fora disso, a correspondência individual não é garantida. O limite fica explícito na interface.

**Campos comparados:** todos os campos dos validadores, cada um com rótulo.

- Ofertas: inclusive `label`, `organizationBasis` e `legacyStageCount`.
- Períodos: inclusive `association`.
- Eventos: inclusive `category`, `admission`, `publicationStatus`, `deadlineAdjustment`, `deadlineExtensionCause`, `assessmentAutoStart` e `recordType`.

Um teste confere que todo campo dos validadores tem rótulo ou está explicitamente ignorado, no mesmo espírito da impressão digital de `ruleset-history.test.ts`. Assim um campo novo não some do diff em silêncio.

O resultado tem duas camadas:

1. **O que mudou**, agrupado na ordem em que o parecerista confere:
   - ofertas, semana letiva, períodos, eventos do campus, observâncias e férias;
   - a base institucional, numa seção separada.
2. **Efeito da mudança**, recalculado pelas **regras atuais** nos dois lados, o que torna a comparação coerente.
   - Fica rotulado "avaliado pelas regras atuais". Quando o `rulesetVersion` dos lados é diferente, um aviso diz que parte da diferença pode vir da mudança de regra. O que o parecerista viu na época está no próprio parecer.
   - **Dias letivos**, por oferta e por período letivo (`term`) de cada lado. A agregação não usa o `id` do período, que pode mudar numa divisão. Um lado que não pode ser avaliado mostra "indisponível" sem quebrar o diff.
   - **Pendências de conteúdo** novas e resolvidas. Uma função nova, `contentIssues(state, institutionalSnapshot)`, é extraída de `releaseReadiness` e reúne só as checagens do conteúdo, sem as pendências de base e de parecer, que dominariam a comparação. As pendências ganham um código estável para o casamento não depender do texto.
   - O efeito ajuda a análise, mas sozinho não comprova que a devolução foi atendida.

**Base padrão da comparação:**

- **Reenvio:** o último envio com desfecho `returned`, ignorando os recolhidos.
- **Primeiro envio de uma nova versão:** o envio publicado de cada vigente que a publicação substituiria, calculado na consulta, desde que esteja na mesma cadeia `derivedFrom`. Isso cobre a origem já substituída por outro vigente e a publicação que substitui vários.
- **Primeiro envio sem relação com um vigente:** sem comparação, com o aviso "primeiro envio".
- Os dois perfis podem escolher outro par dentro da cadeia.

**Comparação para o campus:** num `devolvido`, o campus compara o conteúdo atual com o envio devolvido ("o que mudei desde a devolução"). O diálogo de reenvio mostra o resumo dessa comparação ao lado da nota.

## Modelo

Campos novos em `calendars`:

- `status` e `statusRevision`.
- `label?`: nome livre, com até 120 caracteres, para diferenciar rascunhos. Entra em `calendarName`, na lista, na auditoria e na impressão.
- `currentSubmissionId?` e `publishedSubmissionId?: Id<'calendarSubmissions'>`. A nota da devolução chega ao campus pelo envio atual.
- `derivedFrom?: Id<'calendars'>`.
- `seiProcess?`, `publishedAt?` e `publishedBy?`.
  - O formulário vem preenchido com `review.processNumber`, que é texto livre de até 100 caracteres, e o ADMIN confirma ou corrige.
  - O formato validado é `00000.000000/0000-00`.
- `archivedAt?` e `supersededBy?: Id<'calendars'>`.

Índices:

- Entram `by_campusId_and_year_and_status` e `by_status_and_deletedAt`, este para a fila do parecerista.
- Sai `by_campusId_and_year`, que não é usado e tem o prefixo coberto pelo índice novo.

Saem do modelo:

- `purpose`;
- `snapshotFields.state` e `historicalState`. `institutionalEvents` e `documentSnapshot` continuam, porque `calendarContents` os usa;
- `archive()`, `calendarHistory`, `calendarVersion`, o campo `versions` de `calendarDto` e, na contração, `makeDefinitive`.

Auditoria: uma ação por transição (`SUBMIT_CALENDAR`, `WITHDRAW_CALENDAR`, `RETURN_CALENDAR`, `CONCLUDE_REVIEW`, `REOPEN_REVIEW`, `PUBLISH_CALENDAR`, `ARCHIVE_CALENDAR`, `REINSTATE_CALENDAR`, `CREATE_CALENDAR_VERSION`), com rótulos em `convex/audit.ts` e `src/app/audit-log.ts`. Como as transições não avançam `version`, `calendarAuthorship` continua correta sem conhecer as ações novas.

Tabela nova: `calendarSubmissions` (ver [Envios e comparação](#envios-e-comparação)). Em `reviewFields`, entra `submissionId?: Id<'calendarSubmissions'>`, opcional porque os pareceres existentes não têm envio. Ver [Parecer e envio](#parecer-e-envio).

## Backend

- `transitionCalendar({ id, from, statusRevision, action, note?, sei?, partial? })` aplica a tabela de transições e confere papel, campus, unicidade, cobertura e as condições de cada ação. Também grava a auditoria.
- `createCalendar` cria sempre em `rascunho`, com `label` opcional.
- `createCalendarVersion({ id })` copia o conteúdo, o `institutionalSnapshot` e o `documentSnapshot` de um vigente para um novo rascunho. É recusada para quem não é vigente, para outro campus e para PARECERISTA.
- `saveReview` aceita só `enviado` e `em_revisao`, recebe o `submissionId` esperado, recusa com 409 se ele não for o atual e move `enviado` para `em_revisao`.
- `calendarSubmissions({ id, paginationOpts })` lista os envios com sequência, datas, autor e decisões, sem as cópias. Também indica a base padrão de comparação.
- `submissionContent({ id, submissionId })` entrega a cópia de um envio para a comparação no navegador.
  - Confere o acesso a `id` por `calendarRow` e recusa um `submissionId` que não pertença a `id` nem à sua cadeia `derivedFrom`. Assim, um envio de outro calendário ou campus não pode ser lido pelo identificador.
  - Os documentos passam por `documentDto`, que não expõe campos de arquivo.
  - Para CAMPUS, as decisões saem sem `reviewRevision` e sem o autor das decisões do parecerista. Hoje o campus não vê o estado do parecer, e isso se mantém.
- `reviewQueue` lê por status pelo índice e não inclui rascunhos.
- Os DTOs trocam `purpose` por `status`, `label`, a devolução e a publicação. `exportReview` e `src/printing/review-export.ts` passam a refletir o status e o SEI.

## Frontend

- **Criação** (`CreateCalendarForm`): um único botão "Criar rascunho" e um campo opcional de nome.
- **Lista** (`CalendarsPanel`): status em badge, nome e a ação "Nova versão" nos vigentes.
- **Editor:**
  - `readOnly` passa a derivar do papel e do status, e a sessão é recriada quando o status muda em outra aba.
  - Autosave, `flush` e o sincronismo automático da base (`CalendarEditorProvider.tsx`) não gravam num calendário travado.
  - Imprimir não chama `save` num calendário travado (`CalendarExportProvider.tsx`).
  - Barra de ações por status: Enviar, Recolher e a nota da devolução em destaque.
  - Num `devolvido`, o painel "O que mudou desde a devolução". O diálogo de reenvio mostra o resumo dele.
- **Fila do parecerista** (`ReviewQueue`): abas por status, as ações Devolver (com nota), Concluir e Reabrir, e a marca "reenvio n" nos reenvios.
- **Revisão:**
  - Painel "Alterações desde o envio n", com a nota daquela devolução no topo, as mudanças agrupadas e o efeito em dias letivos e pendências.
  - Seletor para comparar outro par de envios.
  - Histórico de envios com desfecho e nota.
  - Destaque no calendário dos dias alterados, numa segunda etapa se o custo da grade for alto.
- **Publicação** (ADMIN): campo SEI, lista dos vigentes que serão substituídos e confirmação explícita da substituição parcial.
- **Impressão** (`src/printing/calendar-layout.ts`) e nome do arquivo: a marca depende só do status.

## Migração

Seguindo os níveis de [Implantação e operação](../implantacao-convex-vercel.md#níveis-de-risco). A conversão de status é de nível 1, e a exclusão do histórico é de nível 2:

1. **Alargar (nível 1).**
   - `status` e os campos novos entram opcionais. `purpose` fica opcional, com um comentário de contração pendente.
   - A tabela `calendarSubmissions` e o `submissionId` dos pareceres são aditivos (nível 0). Os calendários existentes não têm envio: o primeiro envio depois da release cria o registro 1.
   - `createInput` aceita e ignora `purpose`. `makeDefinitive` permanece como função de transição sem efeito, para o frontend anterior.
   - Até a contração, o DTO deriva `status` com a mesma função pura da migração quando o campo falta. Assim `calendarPage` e `reviewQueue` não falham durante a janela.
   - A migração `calendarPurposeToStatus`, incluída em `pending`:
     - converte **todo** calendário para `rascunho`, inclusive os da lixeira, sem conflitos entre documentos;
     - preserva a informação de teste em `label: 'Teste'` quando não houver `label`;
     - remove `purpose` e não altera `version`.
     - Os pareceres existentes continuam ligados ao calendário. No primeiro envio, eles precisam ser salvos de novo para ganhar `submissionId` (ver [Parecer e envio](#parecer-e-envio)).
   - `archive()` deixa de ser chamada, e as queries de histórico e o campo `versions` saem. As tabelas `calendarVersions` e `calendarSnapshots` continuam no schema até a exclusão, sem novas gravações.
   - `dryRun` no deployment de desenvolvimento antes da release.
2. **Exclusão do histórico (nível 2).** Depois que a release 1 estiver em produção e nada mais gravar nas tabelas:
   - Uma `internalMutation` paginada apaga `calendarVersions` e `calendarSnapshots` em lotes. Ela só é chamada manualmente e registra a contagem de cada lote.
   - Antes, o ensaio é feito sobre o backup restaurado num deployment descartável. Ele confere que só essas duas tabelas mudaram e que `calendars`, `calendarContents`, `reviews` e `reviewVersions` ficam idênticas, conforme [Operações administrativas de dados](../migracao-schema.md).
   - A execução em produção depende de autorização explícita do responsável no momento da operação, com o backup da release como ponto de recuperação.
3. **Estreitar.** `status` passa a ser obrigatório. Saem `purpose`, a derivação provisória do DTO, `makeDefinitive`, a mutation de exclusão e as tabelas `calendarVersions` e `calendarSnapshots` do schema. O Convex recusa o deploy se ainda houver documento que viole o schema estreitado.

## Testes

- **Unitários** da tabela de transições: cada par de estado e papel, as transições recusadas e o alcance do ADMIN.
- **Parecer:** continua atual, e `exportReview` continua válido ao longo de `enviado → em_revisao → revisado → vigente`.
- **Unicidade e cobertura:**
  - unicidade no envio e na publicação, com sobreposição parcial;
  - oferta acrescentada num `devolvido`;
  - cobertura conferida no envio e de novo na publicação, depois que o vigente mudou;
  - substituição de vários vigentes;
  - substituição parcial com confirmação;
  - recusa sem nenhuma escrita.
- **Concorrência:**
  - dois envios simultâneos do mesmo campus e ano;
  - envio e publicação ao mesmo tempo;
  - recolher e `saveReview` ao mesmo tempo;
  - `statusRevision` desatualizado.
- **Travas:**
  - `saveCalendar`, inclusive o caminho sem mudança;
  - `synchronizeBase`, `saveReview` e `deleteCalendar` por status;
  - lixeira e restauração, com o filtro de `deletedAt`.
- **Base:** mudança da base em `enviado`, `revisado` e `vigente`, com o efeito na prontidão, no parecer e na impressão.
- **Nova versão:** cópia do conteúdo e das bases, sem o parecer, e recusas por status, campus e papel.
- **Envios:**
  - enviar cria o registro com a cópia exata, o hash e a sequência seguinte;
  - recolher acrescenta `withdrawn`, preserva o registro e nunca reaproveita a sequência;
  - recolher a partir de `devolvido` reaponta `currentSubmissionId` e a nota para o envio devolvido;
  - concluir, reabrir, concluir de novo e devolver acumulam as decisões sem apagar nenhuma;
  - devolver sem parecer na rodada não grava `reviewRevision`;
  - publicar recusa conteúdo diferente do envio, mesmo com a mesma `version`;
  - exclusão e restauração preservam os envios, e o rascunho restaurado mostra a última devolução;
  - envio acima de 900 KiB recusado com mensagem própria;
  - listagem paginada e sem as cópias.
- **Parecer e envio:**
  - `saveReview` com `submissionId` antigo é recusado, inclusive depois de recolher e reenviar sem editar;
  - um parecer do envio 1 não vale para o envio 2 em concluir, publicar, `exportReview` e prontidão;
  - um parecer sem `submissionId` exige nova gravação;
  - o parecer de `reviewRevision` é encontrado em `reviews` e em `reviewVersions`.
- **Comparação (`diff.ts`, unitários):**
  - itens incluídos, removidos e alterados por `id` em ofertas, períodos e eventos;
  - observâncias por chave; semana e férias campo a campo;
  - eventos de férias derivados fora da lista, sem contar a mudança duas vezes;
  - evento sem `offers` igual a evento com todas as ofertas;
  - observância trocada atribuída ao campus, não à base;
  - inclusão de oferta que só altera `offers` dos eventos institucionais, sem diferença;
  - período recalculado pela base;
  - divisão de período compartilhado e de evento vinculado, e evento recriado no editor, apresentados como "alterado (identificador novo)";
  - mudança de `label`, `organizationBasis` e `association`;
  - ordem diferente dos itens sem diferença semântica;
  - dois registros iguais sem diferenças;
  - todo campo dos validadores com rótulo ou ignorado explicitamente.
- **Efeito:**
  - dias letivos agregados por oferta e `term`;
  - pendências de conteúdo novas e resolvidas, por código, sem pendências de base e de parecer;
  - aviso quando o `rulesetVersion` difere;
  - lado não avaliável mostrado como indisponível sem quebrar o diff.
- **Comparação (Convex e base padrão):**
  - base padrão num reenvio, ignorando os recolhidos;
  - nova versão cuja origem foi substituída por outro vigente, e publicação que substitui vários;
  - primeiro envio sem relação, sem comparação;
  - `submissionContent` recusa envio de outro calendário, de outro campus ou fora da cadeia;
  - CAMPUS não recebe `reviewRevision` nem o autor das decisões do parecerista.
- **Interface da comparação:** seletor de par, direção da comparação, nota da rodada correspondente, estados sem base e o painel do campus atualizado durante o salvamento automático.
- **Migração:**
  - `test`, `definitive` com e sem parecer, lixeira e documento já convertido (idempotência);
  - `version` intacta;
  - linha sem `status` lida pelo código novo;
  - `createCalendar` com `purpose` durante o alargamento.
- **Funções retiradas não são mais chamáveis**, no padrão de `native-history-retirement.test.ts`.
- **Testes que hoje usam `calendarVersion`** como prova de preservação são reescritos sobre o conteúdo atual, não apagados:
  - `legacy-stage-count`, `offer-addition`, `source-retirement-native`, `native-calendar-v4`;
  - o helper `test/helpers/native-database.ts` e `test/fixtures/editor-client.ts`;
  - `dev-setup.test.ts` passa a usar outra tabela como exemplo de dado parcial.
- **Interface:**
  - ações por status no editor e na fila;
  - mudança de status com o editor aberto;
  - campo SEI;
  - testes E2E que dependem de `teste-calendario-*` e de "CALENDÁRIO DE TESTE".

## Documentação

- `docs/arquitetura-convex.md`, seções Persistência, Conteúdo v4 e Períodos: ciclo de vida, unicidade e o fim do histórico por salvamento.
- `docs/seguranca.md`: "Versões e snapshots evitam sobrescrita silenciosa" passa a falar do controle de versão e do status.
- `docs/migracao-schema.md`: formatos antigos que permaneciam nas versões arquivadas.
- `docs/uso.md`: o fluxo de rascunho, envio, revisão, devolução e publicação.

## Entregas

1. **Release 1 (alargar):** domínio do ciclo de vida, envios e comparação, backend, frontend, migração `calendarPurposeToStatus` e o fim das gravações de histórico. Os envios precisam existir desde o primeiro envio, então não ficam para uma entrega posterior. Só o destaque na grade pode vir depois.
2. **Operação de nível 2:** ensaio e exclusão do histórico.
3. **Release 2 (estreitar):** contração do schema e retirada das funções de transição.
