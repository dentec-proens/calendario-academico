# Calendários independentes no mesmo campus e ano

## Objetivo

O campus organiza seus calendários de um ano como quiser — por regime de etapas, por nível, por
turno ou num só — sem que um calendário prenda outro. Substituir um vigente passa a ser uma relação
**explícita** (a origem de uma nova versão, ou a escolha da administração ao publicar), nunca
deduzida do tipo de oferta. Todo calendário tem um rótulo próprio, para que calendários do mesmo
campus e ano se distingam em listas, impressão e na marca “Substituído por …”.

## Motivação (19/11/2026)

Irati tem em produção “Calendário 2027 - Campus Irati — Cursos Bimestrais” e “… — Cursos
Trimestrais”, ambos com Graduação. O trimestral foi enviado; o bimestral é recusado com “Já há
calendário em análise para Graduação neste campus e ano”. Os dois atendem cursos diferentes. O tipo
de oferta é uma categoria normativa, não um conjunto de cursos: usá-lo como chave de conflito
recusa um caso legítimo e, na publicação, faria o segundo arquivar o primeiro.

## Decisões

- **Sem unicidade em análise.** Calendários tramitam e ficam vigentes ao mesmo tempo, quaisquer que
  sejam suas ofertas e sua origem. Nem por tipo de oferta, nem por linhagem: duas novas versões do
  mesmo vigente são o caminho natural para dividi-lo, e o rótulo distinto (abaixo) já impede que
  versões irmãs sejam cópias indistinguíveis.
- **A origem é substituída se ainda estiver vigente.** Publicar arquiva o calendário de que o novo
  deriva (`derivedFrom`, criado por **Nova versão**), com `supersededBy`. Se a origem já não estiver
  vigente, a publicação não a toca.
- **Os demais vigentes do campus e ano exigem escolha explícita.** No diálogo de publicar, cada outro
  vigente do mesmo campus e ano recebe “Substituído por este” ou “Continua vigente”, sem padrão;
  **Publicar** só é liberado com todos respondidos. Esquecer uma caixa não deixa dois vigentes
  cobrindo os mesmos cursos por descuido. Não há declaração do campus nem campo novo no calendário.
- **Sem substituição parcial.** Somem a confirmação e a exigência de cobrir os tipos de oferta do
  vigente substituído.
- **Sem painel novo de contexto.** O único contexto acrescentado é a lista do diálogo de publicar.
- **Rótulo obrigatório e distinto**, conferido onde um nome pode ficar vazio ou repetido: renomear,
  enviar, publicar e restabelecer.
- **Sem migração de dados.** Os calendários atuais sem rótulo são corrigidos pela administração com
  o renomear existente, a partir de uma consulta de conferência.

## Situação atual

`offerKinds` (`convex/schema.ts:57`) é derivado das ofertas a cada salvamento e governa:

| Onde                                       | Regra                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `assertUniqueInFlow` (`lifecycle.ts:94`)   | Um em análise por campus, ano e tipo; chamado no envio (`transitions.ts:150`) e ao salvar devolvido que ganha tipo (`calendars.ts:224-227`) |
| `replacedCalendars` (`lifecycle.ts:116`)   | No envio e na publicação: arquiva vigentes com tipo em comum; exige cobertura ou substituição parcial confirmada pela ADMIN                 |
| `reinstate` (`transitions.ts:305`)         | Recusa restabelecer se há vigente com tipo em comum                                                                                         |
| `calendarSubmissions` (`calendars.ts:586`) | Base de comparação padrão: vigentes com tipo em comum **e** ancestrais                                                                      |
| `replacementPreview` (`calendars.ts:626`)  | Lista do diálogo de publicar e cálculo de `uncovered`                                                                                       |
| `LifecycleActions.tsx:149-194, 397-465`    | Prévia consultada no envio (confirmação parcial da ADMIN) e na publicação                                                                   |

Os demais usos de `offerKinds` (listagens, filtros, fontes de cópia, impressão, auditoria, envio)
não dependem do ciclo de vida e ficam como estão.

`label` é opcional (`schema.ts:65`), normalizado por `normalizeLabel` (até 120 caracteres) e
editado por `renameCalendar` (`calendars.ts:335`) — pelo campus em rascunho e devolvido, pela ADMIN
em qualquer situação; não entra no envio nem em `contentHash` (`lifecycle.ts:32-48`), então
renomear nunca invalida envio ou parecer. **Nova versão** copia o rótulo (`calendars.ts:487`).
Hoje nada impede nomes repetidos.

## Regras novas

### Rótulo

- **Obrigatório:** não vazio após `normalizeLabel`.
- **Distinto:** dois calendários do mesmo campus e ano, ambos não excluídos e não arquivados, não
  podem ter rótulos iguais pela chave de `searchText` (`src/shared/search-text.ts`: sem diferença de
  maiúsculas e acentos) — **exceto quando um é a origem (`derivedFrom`) do outro**. A exceção cobre
  a correção comum: a nova versão herda o rótulo e substitui a origem. Versões irmãs, que não se
  substituem, precisam se distinguir.
- Conferido em:
  - `renameCalendar`: recusa vazio e repetido (é onde o editor recebe a resposta imediata);
  - envio e publicação: recusa vazio e repetido (cobre a herança de **Nova versão**, a restauração
    da lixeira e os calendários antigos);
  - restabelecer: recusa repetido.
- Mensagens: “Informe o complemento do nome para distinguir este calendário dos demais do campus.”
  e “Já há {nome} neste campus e ano. Escolha outro complemento do nome.”
- O editor mostra só a falta de rótulo, como pendência ao lado da de cursos
  (`src/domain/calendar/identity.ts:22`, `IssuesSection.tsx:151-163`,
  `CalendarEditorLayout.tsx:180-192`). A repetição aparece ao renomear ou ao enviar, sem consulta
  nova no editor.

### Envio

- Remove `assertUniqueInFlow` e `replacedCalendars` do envio e a verificação do salvamento de
  devolvido (`calendars.ts:224-227`).
- Acrescenta a regra de rótulo.
- A prévia de substituição deixa de ser consultada no envio (`LifecycleActions.tsx:149-194`).

### Publicação

- Regra de rótulo.
- Substitui a origem se ela estiver vigente.
- Substitui os vigentes escolhidos (`request.replaces`). O validador limita o tamanho da lista; o
  servidor recusa o próprio calendário, ignora repetidos e a origem, e revalida cada item: mesmo
  campus e ano, vigente, não excluído. Um item que deixou de ser vigente recusa a publicação, para a
  administração rever a escolha. Um vigente do campus e ano ausente da lista **continua vigente**:
  a obrigação de responder cada um é da interface.
- Arquivamento, `supersededBy` e auditoria como hoje.

### Restabelecer

Recusa se houver calendário vigente:

- na cadeia de sucessores (`supersededBy` de A, depois o dele, …) — V1→V2→V3 com V3 vigente impede
  restabelecer V1; ou
- derivado de A (`derivedFrom` = A) — cobre A arquivado à mão com a nova versão A′ já publicada.

Mais a regra de rótulo distinto. Mensagem: “{nome} está vigente no lugar deste calendário.”

### Comparação

Base padrão do primeiro envio de uma nova versão: o envio publicado da origem (`derivedFrom`),
esteja ela vigente ou não. Deixa de consultar `overlapping`. A comparação continua restrita à
linhagem (`calendars.ts:609-611`).

### Diálogo de publicar

- “Substitui {origem}” quando a origem está vigente; “A origem, {origem}, já foi substituída por
  {sucessor}” quando não está (o sucessor aparece na lista abaixo, se ainda vigente). A PROENS vê
  que o calendário comparado não é o que está em vigor.
- Lista os demais vigentes do campus e ano com nome, ofertas e cursos, e a escolha
  **Substituído por este** / **Continua vigente** em cada um, sem padrão. Sem outros vigentes:
  “Nenhum outro calendário vigente neste campus e ano.”
- `replacementPreview` passa a devolver `origin` (com situação e sucessor) e `others`, em vez de
  `replaced`/`uncovered`.

### Implementação no Convex

Sem índice novo. As versões herdam campus e ano (`calendars.ts:482-488`), então todas as consultas
leem os calendários do campus e ano pelo prefixo `campusId`, `year` de
`by_campusId_and_year_and_status` e filtram em memória: um helper `campusYearCalendars` substitui
`overlapping` e atende rótulo, prévia, publicação e restabelecer. A transação serializável protege
contra operações simultâneas. A cadeia de sucessores é seguida com limite, como `lineage`.

## Calendários atuais sem rótulo

Sem migração. Uma migração que agrupa por campus e ano não é conversão por documento (nível 2 em
[Implantação](../implantacao-convex-vercel.md#níveis-de-risco)), o `dryRun` do componente não lista
propostas nem vê produção, o `deploy:production` aplicaria sem conferência, e `appendAudit` não tem
ator de sistema. Rótulos gerados de ofertas (“Graduação (versão 2)”) teriam pouco sentido.

1. Uma `internalQuery` de conferência lista, por campus e ano, os calendários não excluídos sem
   rótulo ou com rótulo repetido pela regra nova, com situação e ofertas. Executada em produção com
   `npx convex run --prod` após a release (só leitura).
2. A administração renomeia pela tela — Londrina e os demais —, com o próprio nome na auditoria.
3. Os que ficarem sem rótulo são pegos pela regra: rascunho e devolvido no envio (pendência no
   editor), em análise na publicação, arquivados no restabelecer. Vigentes sem rótulo continuam
   válidos até a administração os renomear.

A consulta é retirada do código depois da conferência, como as ferramentas de operações
concluídas.

## Compatibilidade

Não há atualização forçada do portal (`docs/implantacao-convex-vercel.md:159`;
`web/app/updates/detector.ts` só oferece atualizar). Numa aba aberta antes da release:

- enviar com `partial` é recusado pelo validador de `transitionCalendar` (`calendars.ts:455`) com a
  mensagem de cliente desatualizado (`web/shared/convex/errors.ts:10`);
- publicar sem `replaces` substitui só a origem — os demais continuam vigentes;
- o diálogo de publicar quebra com o formato novo da prévia (`LifecycleActions.tsx:157`) e cai no
  tratamento de erro.

Só a ADMIN publica; recarregar resolve. Aceito.

`offerKinds` permanece e deixa de participar do ciclo de vida.

## Consequências aceitas

- Publicações de calendários criados do zero deixam de arquivar vigentes sozinhas; a administração
  responde por cada vigente no diálogo. Comunicar aos campi e à PROENS.
- Na divisão, `supersededBy` guarda um só sucessor: a origem aponta para a primeira parte
  publicada; a segunda não a substitui (já arquivada). A auditoria registra as duas publicações.
- Arquivar à mão não grava `supersededBy`: a impressão diz “Arquivado”, não “Substituído por …”.
  Corrigir uma escolha esquecida no diálogo usa esse caminho.
- Na fusão, o calendário novo não compara com os substituídos por escolha, porque a comparação é
  restrita à linhagem.

## Arquivos afetados

- `convex/calendars/lifecycle.ts`: remover `assertUniqueInFlow`, `replacedCalendars`,
  `overlapping`, `kindList`; acrescentar `campusYearCalendars`, `assertLabel`, `publicationTargets`
  e a verificação de restabelecer.
- `convex/calendars/transitions.ts`: `TransitionRequest` (`:59`), envio, publicação, restabelecer.
- `convex/calendars.ts`: validador de `transitionCalendar` (`:455`, `partial` → `replaces`),
  `renameCalendar`, salvamento de devolvido (`:224-227`), `calendarSubmissions` e seu comentário
  (`:544`), `replacementPreview`; consulta interna de conferência temporária.
- `convex/contracts.ts`, `convex/validators.ts`: contratos da ação e da prévia.
- `src/domain/calendar/lifecycle.ts`: comentário de `inFlowStatuses` (`:76`); remover `sharedKinds`
  se ficar sem uso.
- `src/domain/calendar/label.ts`: regra de rótulo obrigatório e chave de comparação (`searchText`).
- `src/domain/calendar/identity.ts`: pendência de rótulo.
- `web/features/lifecycle/LifecycleActions.tsx`: envio sem prévia; diálogo de publicar novo.
- `web/features/calendar-editor/CalendarEditorLayout.tsx`, `sections/IssuesSection.tsx`.
- `docs/uso.md:31-37,108`; `docs/arquitetura-convex.md:72`.

## Testes

- Fixtures passam a criar calendários com rótulo (`test/helpers/lifecycle.ts:203`,
  `test/helpers/native-database.ts:181-193`, `test/convex/calendar-lifecycle.test.ts:30-48`,
  `test/fixtures/editor-client.ts:13`). Isso muda cerca de 22 asserções de nome em 9 arquivos e as
  contagens de pendências dos testes de navegador.
- Reescrever: `calendar-lifecycle.test.ts:366` (mantendo recolher, excluir e restaurar), `:497`
  (restabelecer), `:502` (substituição parcial → escolha no diálogo), `:658-668` (prévia);
  `test/helpers/lifecycle.ts:139` (`partial`); `test/fixtures/editor-client.ts:122` (prévia).
  Ajustar comentários em `review-assignment.test.ts:200` e `calendar-lifecycle.test.ts:202`.
- Regras vivas cobertas: dois calendários com o mesmo tipo de oferta em análise e vigentes ao mesmo
  tempo; versões irmãs tramitando juntas e a segunda publicada com a origem já substituída; origem
  substituída na publicação; vigentes escolhidos substituídos e os não escolhidos mantidos;
  `replaces` inválido recusado; rótulo obrigatório e distinto em renomear, enviar, publicar e
  restabelecer, com a exceção da origem; restabelecer recusado por sucessor e por derivado vigente.
- Não registrar a ausência das regras retiradas.

## Fora do escopo

- Detectar sobreposição de cursos entre calendários: `courses` é texto livre.
- Declaração de substituição pelo campus.
- Painel de outros calendários na revisão.
- Comparação com calendários substituídos fora da linhagem.

## Revisão do plano (19/11/2026)

Duas análises independentes (regras de negócio e impacto no código) mudaram a primeira versão:

- **Saiu a unicidade por linhagem** e a recusa de publicar com a origem já substituída: tornavam a
  divisão por **Nova versão** impossível, sem caminho de volta (`canCreateVersion` só aceita
  vigente).
- **Rótulo distinto “exceto a origem”**, em vez de “fora da linhagem”: `lineage` só segue
  ancestrais, e versões irmãs ficariam com nomes idênticos.
- **Escolha explícita por vigente** no diálogo, em vez de caixa desmarcada.
- **Restabelecer segue a cadeia de sucessores e os derivados**, não só o sucessor direto.
- **Sem migração**: conferência e renomear manual (motivos acima).
- **Compatibilidade reescrita**: não há recusa de clientes antigos.
- Não adotado: exigir rótulo só quando houver outro calendário no campus e ano, que pouparia as
  fixtures. A decisão é rótulo sempre obrigatório.
