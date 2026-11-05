# Base e regras sempre atuais nos calendários em edição

## Princípio

**Um calendário em edição sempre segue as regras e a base institucional vigentes. O que fica gravado
só passa a importar quando o calendário sai da edição.**

O usuário não aceita, incorpora nem adota nada. O sistema aplica, avisa o que mudou e aponta o que
precisa de atenção como uma pendência comum.

| Situação                       | Regras e base                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| Rascunho e devolvido           | Sempre as vigentes, lidas ao vivo                                                    |
| Enviado, em revisão e revisado | O envio fica como está; se a base ou as regras mudarem, cabe ao parecerista devolver |
| Vigente                        | Congelado; a "Nova versão" nasce com as vigentes                                     |

## Por que mudar

Em 04/11/2026 a v7 das regras entrou em produção às 16:04. A partir daí todo salvamento de um
calendário abaixo da v7 passou a ser recusado com "Há mudanças aplicáveis na base institucional",
até alguém encontrar o botão de adoção dentro de um cartão recolhido. Um campus relatou o erro às
16:34, e sair e voltar não resolvia.

O clique não protege nada:

- Pendências, aplicabilidade e mínimos já usam as regras vigentes antes dele. O botão só grava o
  número da versão.
- Não há como recusar: é adotar ou ficar sem salvar, enviar e imprimir. O cartão de eventos tem o
  mesmo defeito.
- O próprio cartão diz que a adoção não representa aprovação institucional.
- Foram 8 versões de regras em 10 dias; a v5 e a v7 exigiram adoção em dias seguidos.

## O que os dados de produção mostram

Conferência local e somente leitura, feita em 05/11/2026 com o código da `main`. Foram 38 calendários
editáveis, dos quais 35 estão abaixo da v7. Outros 2, enviados, estão na v6.

| Conferência                                 | Resultado                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Avaliar a base sem o portão de regras       | 21 em dia; **17 ainda seriam recusados por documentos**; nenhum por eventos                              |
| Normalizar e preparar o salvamento sob a v8 | 38 de 38 passam (sem o portão, que fica antes dessa etapa)                                               |
| O que muda ao salvar                        | Nenhuma data ou período. Só o carimbo da versão, e em 7 o campo vazio `thirdStart`/`thirdEnd` das férias |
| Feriado novo simulado (1.254 combinações)   | 0 falhas; o término muda em apenas 1 calendário                                                          |
| Períodos com `targetDays`                   | 1 de 55; nenhum nos envios                                                                               |

Duas conclusões:

1. **Tirar só o portão de regras não basta.** Nos 17 calendários, o snapshot de documentos está vazio
   e há um documento vigente. O portão de regras escondia essa diferença, porque `kind` dá prioridade
   a regras. Documentos precisam entrar já na fase 1.
2. **O medo de incorporar eventos vinha de "o recálculo move datas".** Isso só acontece por
   `targetDays`, que nenhum formulário grava desde 28/10/2026 (a importação de JSON ainda aceita) e
   existe em um único período. Sem esse campo, uma mudança no catálogo não altera mais o conteúdo do
   calendário, e não é preciso sincronizar nem gravar nada ao abrir: basta ler ao vivo.

Limites da conferência: não cobriu o comportamento na tela, e o feriado simulado foi de um dia, em
datas de 2027 escolhidas uma vez por mês.

## Fases

As fases podem ir para produção separadamente, nesta ordem. A fase 2 não depende das outras.

### Fase 1: regras e documentos sem portão (urgente)

Destrava os 35 rascunhos no deploy, sem migração de dados. Documentos não movem datas e o salvamento
já os copia, então entram aqui.

- **Avaliação:** em calendário editável, `inspectCalendar` deixa de considerar regras e documentos
  como incompatibilidade. A decisão fica no domínio e recebe a situação, porque servidor e cliente
  precisam da mesma resposta. Muda só `compatible`: `kind` continua `documents`, senão cairia em
  `equivalent` e dispararia `synchronizeBase`, que avança a revisão sem copiar os documentos.
  `rules.changes` e `documents` continuam disponíveis para o aviso.
  Calendários travados seguem como hoje, preservando `reviewIsCurrent`, `lockedBaseIssue` e os
  bloqueios de concluir e publicar.
- **Carimbo:** a versão gravada deixa de ser portão e passa a registrar sob qual regra o conteúdo foi
  salvo ou enviado. O salvamento já carimba (`normalize.ts`).
- **Envio:** quando o carimbo difere do vigente, inclusive entre versões equivalentes, ou os
  documentos diferem, atualizar em `calendarContents` o carimbo, os documentos e `catalogueRevision`,
  fazer `version + 1` e só então copiar, para `contentVersion` e `contentHash` saírem coerentes. Sem isso, o calendário travado seria comparado
  com regras não equivalentes e nasceria com "a base mudou depois do envio", bloqueando concluir e
  publicar; o parecerista também perderia o alerta `rulesetDiffers`. Essa escrita registra
  `SAVE_CALENDAR` com o autor do envio e atualiza `updatedAt`, senão some o "atualizado por"
  (`authorship.ts` filtra pela versão). O `scope` de `applyTransition` deve usar a versão nova.
- **Nova versão:** nasce com o carimbo e os documentos vigentes.
- **Salvamento sem mudança:** `apply` sem alteração real não deixa o editor sujo só por causa do
  carimbo.
- **Observâncias:** `validateObservances` deixa de recusar todo salvamento por um conflito antigo.
  Recusa só a escolha alterada naquele salvamento, comparando com `previous`; o restante aparece como
  a pendência que `readiness` já produz. Uma mudança de política que reduza `allowedDates` não pode
  prender o campus.
- **Aba com app antigo:** a checagem de `calendars.ts` que compara a versão enviada continua igual.
- **Aviso** informativo, sem botão de decisão e sem código de versão, a partir de `rules.changes` e
  `documents`. Mudanças `editorial` e `establishes` não aparecem. Em calendário sem carimbo, só
  entram as mudanças posteriores ao último salvamento (`updatedAt`), pois `rulesetChangesBetween`
  devolveria o histórico inteiro aos 18 rascunhos nessa situação. A menção a refazer o parecer só
  surge se houver parecer.

  > **As regras de 2027 mudaram em 04/11. As novas regras não alteraram suas datas.**
  > Trancamento de curso e cancelamento de matrícula em componente agora são atividades separadas.
  > · [Ver pendências] · [Fechar]

  O aviso some no próximo salvamento, que atualiza o carimbo e os documentos, mas continua visível
  durante a sessão em que apareceu. "Fechar" só esconde localmente. Não há campo novo no banco.

- **Cartão de eventos até a fase 4:** continua só para eventos. Passa a abrir expandido quando há
  diferença, perde "você pode recolher e atualizar depois", e a mensagem do 409 aponta para ele.
  `hasRules` e o caminho de documentos saem do cartão. Atualizar `base-update.visual.spec.ts`.

**Risco que permanece até a fase 4:** um `saveCatalogue` volta a colocar os calendários editáveis em
409 até alguém incorporar a mudança pelo cartão. Por isso, evitar editar o catálogo de um ano com
calendários em edição antes da fase 4 ou, se for preciso, avisar os campi.

### Fase 2: registro de falhas e mensagens de salvamento

Uma recusa não pode ser gravada pela própria mutação, porque o `throw` reverte a transação. Por isso
o registro parte do cliente.

- **Registro:** mutation autenticada `clientErrors.report` com tipo, status, mensagem conhecida, rota,
  calendário e release, alimentada pelo autosave, pelo `ErrorBoundary` e por `unhandledrejection`.
  Nunca grava `state` nem valores de formulário. Tem limite por usuário e limpeza por cron em 90 dias.
- **Consulta:** visível em `/logs` para ADMIN. Sem fornecedor novo, o que evita nova análise de LGPD
  e mudança na CSP.
- **Autosave:** separa 401 de 409 (`autosave.ts` trata os dois como `blocked`). "Tentar novamente" só
  aparece em falha transitória; conflito de versão oferece só "Reabrir". Cada 409 restante tem
  mensagem própria, dizendo o que fazer.

### Fase 3: retirar `targetDays`

- Remover o campo do modelo, dos validadores e de `diff.ts` (rótulo e `recalculatedByBase`), e o
  recálculo de término (`recalculatePeriods`, `recalculateCalendar`, `reconcile().recalculate`). A
  normalização continua cobrindo a sobreposição de períodos. `durationEnd` fica só para as férias e
  perde `state` e `events`, conferindo os outros chamadores. Ajustar `calendar-diff.test.ts`.
- **Importação:** um JSON antigo com o campo tem o valor ignorado, não recusado.
- **Dados:** remove o valor de um único período, em um rascunho, conservando o `end` já gravado.
  Migração de nível 1, em duas etapas (alargar e estreitar).

### Fase 4: eventos ao vivo

Depende da fase 3.

- **Leitura:** em calendário editável, editor, pendências, contagem, prontidão do servidor, impressão
  e `sinceReturn` usam `institutionalEvents`, `currentDocuments` e `currentCatalogueRevision`.
  Os snapshots deixam de ser lidos durante a edição e são copiados ao salvar e ao enviar. Pontos
  conhecidos: `CalendarEditorProvider.tsx` (`institutional`, cujo desvio por conflito de observância
  sai, porque `applyObservances` já preserva o evento), `CalendarEditorLayout.tsx` (`contentIssues` e
  `currentContent`), `IssuesSection.tsx` e `record.ts` com `readiness.ts`. A comparação do parecerista
  continua igual, porque compara envios congelados.
- **Salvamento:** `unchanged` compara também a `identity` da base. Se a base mudou, grava tudo com
  `version + 1`; se não, não toca em nada. Corrige dois caminhos que hoje dependem de base compatível:
  avançar `catalogueRevision` sem copiar snapshots (`calendars.ts`) e gravar no cliente `base.events`
  como snapshot (`editor-session.ts`).
- **Removidos:** `baseAcceptance`, `reconcile`, `confirmBase`, `rejectedBaseAcceptance`,
  `synchronizeBase`, `BaseUpdateCard` e a trava de impressão por base.
- **Sem escrita ao abrir:** não há autoria "Sistema", `version + 1` por leitura nem conflito com outra
  sessão suja. Mudança de catálogo com edição local em andamento deixa de ser `remote` e não bloqueia
  o envio.
- **Envio:** depois do flush, em `prepare()`, o cliente informa a `identity` da base que estava vendo.
  - Se o servidor tiver outra, recusa com 409 sem escrever nada, e o editor já mostra a base nova pela
    assinatura. Ninguém envia datas que não viu. A mensagem é neutra, pois pode ser só um documento.
  - Se coincidir, grava os snapshots vigentes em `calendarContents` com `version + 1` e só então copia
    para o envio; a publicação compara esse hash.
  - O argumento é opcional no contrato: a ausência, vinda de aba antiga, responde 409 com "Atualize a
    aplicação".
- **Aviso:** o mesmo da fase 1, ampliado com a diferença entre o snapshot gravado e a base vigente:
  qual evento mudou e o efeito na contagem de dias letivos. Aqui não vale "suas datas não mudaram",
  porque um evento institucional que muda é uma data que muda no calendário. Some no próximo
  salvamento.
- **Edição de catálogo:** uma query de impacto, lendo os editáveis do ano, mostra ao ADMIN quantos
  calendários são alcançados e quantos ganham pendência antes de confirmar. `saveCatalogue` registra
  no audit o que mudou. Não há rascunho de catálogo, e o clique do campus, ainda que fraco, era a
  única barreira a um erro de digitação.

### Fase 5: ensaio automático na release

- Núcleo puro em `src/domain`, usado também pela aplicação, para o ensaio rodar exatamente o mesmo
  código.
- `pnpm deploy:production` passa cada calendário editável do backup que já exporta por `inspectCalendar`
  e `prepareOfferCalendarSave`, com as regras e o catálogo do candidato. Relata o que muda e o que
  falha, e lista os calendários travados que precisarão de devolução.
- Falha de salvamento bloqueia a release, com saída explícita e registrada para emergência.
- **Regra de autoria:** uma mudança de regras nunca pede ação manual ao campus. Se muda o sentido de
  uma data, a migração de formato resolve ou a própria data vira pendência, como já ocorre em
  "Vínculo a conferir".

### Fase 6: documentação

Levar as decisões para a documentação permanente e apagar este plano. Em
`docs/arquitetura-convex.md`, `tightens` deixa de exigir incorporação e continua invalidando o parecer.
Atualizar também `docs/uso.md`.

## Critérios de aceite

Fase 1:

- Os 17 calendários com documento pendente e os demais em versão antiga salvam, enviam e imprimem sem
  clique adicional, e o aviso aparece até o próximo salvamento.
- Enviar um calendário em versão antiga não nasce com "a base mudou", e o parecerista pode concluir.
- Uma mudança de regras durante a revisão continua bloqueando concluir e publicar.
- O envio registra a versão vigente, e `rulesetDiffers` continua funcionando.
- Calendário vigente não muda de forma alguma com catálogo, documentos ou regras novos.
- Um conflito de observância antigo não impede salvar outra alteração e aparece como pendência.

Fase 2:

- Uma recusa de salvamento aparece em `/logs`, sem conteúdo do calendário.

Fase 4:

- Uma mudança de catálogo não altera `calendarContents` nem `version` até um salvamento humano.
- Uma mudança de base entre a tela e o envio resulta em 409, sem escrita, e sem falso 409 ao adicionar
  uma oferta logo antes de enviar.

Em todas as fases, cada regressão reproduz a falha pelo mesmo fluxo real antes da correção.

## Decisões

Confirmadas em 05/11/2026:

1. **Documentos automáticos:** sim, já na fase 1.
2. **Eventos automáticos:** sim, na fase 4, com o aviso e a conferência de impacto pelo ADMIN.
3. **Ciência formal:** eliminada. Histórico, audit e carimbo preservam o rastro.
4. **Retirada de `targetDays`:** tratada como nível 1, por decisão do responsável, embora a tabela de
   riscos classifique a remoção de um valor sem equivalente como nível 2. O valor não é usado por
   nenhum formulário, existe em um único período de rascunho, e o `end` gravado é conservado.
5. **Orientação aos campi:** só se a publicação da fase 1 demorar.
