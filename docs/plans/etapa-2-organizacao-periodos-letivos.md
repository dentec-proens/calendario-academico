# Proposta: unir períodos letivos e avaliações

**Situação:** implementada e validada localmente em 27/10/2026.

**Recomendação:** unir as atuais etapas 2 e 3 em **Períodos e avaliações**, reduzindo o roteiro de sete para seis etapas. Da atual etapa 2, manter no fluxo principal somente o conteúdo do screenshot enviado pelo usuário: lista e editor de períodos. Retirar os formulários independentes de organização e ingresso.

Esta revisão substitui a recomendação anterior deste arquivo, de três abas para Organização, Datas e Ingresso. Aquela solução preservava o excesso de decisões no preenchimento. A direção atual é reduzir o que se pede, reunindo as datas das aulas e suas avaliações.

A investigação usa o checkout e o histórico Git. Não comprova qual versão está publicada nem quando os campos chegaram à produção. As datas abaixo são dos commits, no fuso de São Paulo. A investigação inicial não alterou código, dados ou ambiente remoto. A implementação está registrada na seção 8.

## 1. Quando os campos extras entraram

| Data e hora       | Commit                                     | Mudança comprovada no histórico                                                                                                                                                                                                                                                    |
| ----------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 20/10/2026, 14h59 | `dc44d71ff702844de31cf3eedebd0af2977e5ab5` | Introduziu a pergunta simples sobre ingresso de novos estudantes no segundo semestre.                                                                                                                                                                                              |
| 26/10/2026, 13h39 | `f09a5d817820dc3d76b06d8937c3bceb1adf5d0f` | Criou o roteiro de sete etapas: ingresso ficou na etapa 2 e avaliações ganharam a etapa 3. Antes, períodos e avaliações já apareciam juntos.                                                                                                                                       |
| 26/10/2026, 20h04 | `a5abbd5ec4c21e0627262165b68fb17090ca4282` | Criou Organização por oferta, escopo da norma, fonte, seletor anual/semestral por oferta e Aplicar organização por oferta. Expandiu ingresso para a matriz oferta/ciclo, com situação, fonte e regra local. Introduziu também as associações oferta/ciclo presentes no screenshot. |
| 26/10/2026, 20h24 | `b068573`                                  | Padronizou os avisos com `Notice`; os campos já existiam.                                                                                                                                                                                                                          |
| 27/10/2026, 09h29 | `162d737`                                  | Incluiu a versão anterior desta proposta, ainda sem implementar a reorganização da etapa 2.                                                                                                                                                                                        |

Reprodução da investigação: `git show <commit> -- web/features/calendar-editor/forms/IntakeForm.tsx web/features/calendar-editor/forms/OrganizationForm.tsx web/features/calendar-editor/sections/PeriodsSection.tsx` e `git log --follow -- <arquivo>`.

O commit de 20h04 implementou a política de 2027 e o conteúdo v3, abrangendo regras, persistência, referências históricas e interface. O [plano correspondente](calendario-2027-ofertas-referencias-e-etapa-6.md) registra três motivações:

- **Organização por oferta:** permitir, por exemplo, integrado anual e graduação semestral no mesmo calendário, com períodos que podem coincidir entre ofertas diferentes; seção 5.2.
- **Escopo e fonte:** tratar a limitação do modelo ao distinguir calendários sujeitos a normas próprias; seções 2 e 5.1. Esta é a motivação registrada no projeto, sem nova análise jurídica nesta investigação.
- **Ingresso por oferta/ciclo:** separar matrícula de ingressantes de veteranos e evitar que uma resposta global dispense atividades de outras ofertas; seção 2.1.

Essas preocupações explicam os dados adicionados. A conclusão de UX é que sua representação em três formulários abertos impôs ao usuário detalhes do modelo antes de cadastrar as datas. Não é necessário reverter o commit inteiro: ele também trouxe as associações úteis do screenshot.

## 2. O que manter e o que retirar da etapa 2

| Elemento atual                                                       | Proposta                                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Lista de períodos, datas, oferta/ciclo e Editar/Remover              | Manter.                                                                                          |
| Ofertas deste período                                                | Manter. Com uma única oferta, pode aparecer como contexto; com várias, manter seleção explícita. |
| Identidade do ciclo/período                                          | Manter, com rótulo mais simples: **Ciclo**. Opções: Ano letivo, 1º semestre e 2º semestre.       |
| Nome, início, quantidade opcional de dias e término                  | Manter o funcionamento do screenshot, inclusive cálculo e recálculo do término.                  |
| Escopo de aplicação da norma e Fonte que identifica o escopo         | Retirar desta etapa; tratar norma e exceções na revisão, conforme seção 5.                       |
| Técnico integrado — Anual/Semestral e equivalentes por oferta        | Retirar como configuração separada. O ciclo escolhido no período expressa essa decisão.          |
| Aplicar organização por oferta                                       | Eliminar. Atualizar a organização junto da aplicação do período.                                 |
| Ingresso por oferta e período, fonte, regra local e Aplicar ingresso | Retirar desta etapa; tratar eventual exigência junto da atividade de matrícula.                  |
| Ajuda sobre migração e organização legada                            | Exibir somente nos registros que precisam de correção.                                           |

Fontes do estado atual: [PeriodsSection](../../web/features/calendar-editor/sections/PeriodsSection.tsx), [PeriodForm](../../web/features/calendar-editor/forms/PeriodForm.tsx); os formulários retirados `OrganizationForm.tsx` e `IntakeForm.tsx` podem ser consultados no commit `a5abbd5`.

O campo com rótulo **Técnico integrado** hoje pergunta novamente se a organização é anual ou semestral. A oferta já foi selecionada na criação, que também pede a organização geral em [CreateCalendarForm](../../web/features/calendars/CreateCalendarForm.tsx). Quando o período informa oferta e ciclo, há informação suficiente para evitar uma nova aplicação independente. O nome da oferta, sozinho, não deve determinar o ciclo.

## 3. Tela unificada

Uma página, com dois blocos em sequência, sem abas adicionais:

```text
Etapa 2 de 6 · Períodos e avaliações
Defina os períodos de aulas e as etapas de avaliação.

Períodos letivos
  Anual · Técnico integrado · 15/02/2027 a 20/12/2027
                                           [Editar] [Remover]

  [Ofertas] [Ciclo] [Nome] [Início] [Dias, opcional] [Término]
  [Adicionar período]
  Informe início e quantidade para sugerir o término.

Etapas de avaliação
  Técnico integrado · [4 etapas / bimestres]
  [Definir etapas]

  1º bimestre · datas                       [Editar]
  2º bimestre · datas                       [Editar]
  3º bimestre · datas                       [Editar]
  4º bimestre · datas                       [Editar]

Voltar à semana letiva              Continuar para sábados letivos
```

O exemplo ilustra um calendário anual com quatro avaliações; não fixa essa combinação para toda oferta. Preservar as opções existentes de duas, três ou quatro etapas de avaliação e sua configuração por oferta.

- O primeiro bloco mantém os campos do screenshot. Com períodos existentes, o editor pode ser aberto por **Adicionar período** ou **Editar**; no estado vazio, pode aparecer diretamente.
- O segundo reaproveita a configuração e a lista da atual etapa 3. As datas continuam editáveis no painel já compartilhado pela aplicação.
- Manter a sugestão de distribuição, o recálculo e a fonte da decisão das avaliações. Não adicionar formulários de ingresso ou norma a esse bloco.
- Diferenciar **Ciclo** de **Etapas de avaliação**. Um período anual pode conter quatro bimestres; bimestres não viram quatro períodos letivos sobrepostos.
- Com várias ofertas, mostrar a configuração e a lista de avaliações por oferta, sem duplicar o mesmo registro quando ele atende a várias.
- No mobile, os dois blocos seguem em uma coluna. Abrir o editor posiciona o foco; fechar devolve à ação de origem. Evitar vários editores de avaliações abertos simultaneamente.

A seção atual [AssessmentsSection](../../web/features/calendar-editor/sections/AssessmentsSection.tsx) já separa configuração e datas, usando [AssessmentSettingsForm](../../web/features/calendar-editor/forms/AssessmentSettingsForm.tsx) e [ActivityChecklist](../../web/features/calendar-editor/events/ActivityChecklist.tsx). A fusão pode preservar essas capacidades e simplificar sua apresentação.

## 4. Organização sem formulário duplicado

Hoje, [applyPeriod](../../src/calendar-edits/commands.ts) rejeita associações cujo ciclo diverge de `organizationByModality`. Por isso, apenas remover `OrganizationForm` pode impedir o cadastro.

A proposta é tornar **Adicionar/Salvar período** uma operação coerente: validar oferta, ciclo, datas e registros dependentes; atualizar o mapa de organização e o resumo `regime`; aplicar o período e os recálculos no mesmo comando puro.

- Ano letivo declara organização anual; 1º ou 2º semestre declara organização semestral para as ofertas selecionadas.
- Um primeiro semestre cadastrado pode deixar o segundo pendente, sem bloquear o salvamento intermediário.
- Um ciclo conflitante com períodos existentes exige correção explícita. Mostrar quais registros conflitam; não reclassificar todos os períodos nem apagar vínculos automaticamente.
- Um período compartilhado só pode atender ofertas com ciclo e datas compatíveis. Preservar os limites de um período anual ou dois semestres por oferta, a vedação de sobreposição na mesma oferta e a possibilidade de coincidência entre ofertas distintas.
- Nos dados legados ambíguos, usar o próprio editor para escolher oferta/ciclo. Conservar IDs, datas, metas e vínculos até a correção; não deduzir semestres pela ordem das datas.
- Reaproveitar a declaração já salva na criação como contexto inicial; mudanças conflitantes precisam ser resolvidas, sem duas fontes independentes para a organização. Uma revisão futura da criação pode eliminar outra redundância, mas não é requisito para esta fusão.

Essa simplificação preserva a capacidade do modelo v3. Muda a maneira como a pessoa informa a decisão.

## 5. Norma e ingresso no lugar da decisão

### Norma aplicável

Retirar escopo/fonte do preenchimento de períodos. Apresentar a norma de referência como informação na **Revisão e conclusão**, com linguagem direta, por exemplo **Norma aplicável ao calendário**.

A fonte institucional já existente pode ser reutilizada quando comprovar a informação necessária. A existência de uma resolução na base, sozinha, não comprova o enquadramento de um curso. Quando faltar informação ou houver exceção, pedir apenas a confirmação ou referência necessária nesse ponto da revisão; manter declarações existentes consultáveis e editáveis. Não preencher `covered` nem inventar uma fonte com base apenas em “Técnico integrado”.

A responsabilidade precisa ficar resolvível na revisão: hoje [evaluateCalendar](../../src/evaluation.ts) usa a confirmação para ativar os mínimos, [readiness](../../src/release.ts) bloqueia a conclusão de 2027 sem escopo coberto e fonte, e [proensLayout](../../src/printing/calendar-layout.ts) apresenta o estado no PDF. Ocultar campos sem adaptar esses consumidores deixaria pendências impossíveis de resolver. O tratamento de norma própria precisa continuar explícito, inclusive quanto aos limites da conclusão suportada pela aplicação.

### Matrícula de ingressantes

Eliminar a grade prévia de perguntas para toda combinação oferta/ciclo. Na etapa **Atividades e datas do campus**, tratar o assunto ao abrir **Matrícula de ingressantes**, perto das datas e da decisão correspondente.

- Cadastro da atividade continua disponível, mesmo sem configuração prévia de ingresso.
- Configuração ausente não significa “não há ingresso”. A proposta é não gerar cobrança de preenchimento dessa configuração para todas as ofertas; a matrícula de ingressantes fica sem exigência automática até existir regra local fundamentada.
- Se for necessário exigir essa atividade no planejamento, oferecer **Exigir esta atividade no calendário**, com referência da regra local, somente no detalhe da atividade e para a oferta/ciclo pertinentes. Essa ação declara a exigência; não inferi-la da simples existência de um evento.
- Preservar situações, fontes e exigências já salvas. Configurações existentes que exigem matrícula continuam produzindo pendência quando faltam datas; não rebaixá-las silenciosamente.
- Matrícula/rematrícula, ajuste e trancamento de veteranos continuam com suas regras próprias, sem dispensa por ausência de ingresso.

Essa é uma mudança proposta de produto e política de pendências, além da retirada visual do formulário. Hoje [applicabilityFor](../../src/calendar-rules/index.ts) retorna `unconfigured` quando ingresso é desconhecido e exige matrícula somente com ingresso confirmado, regra e fonte. A implementação deverá alinhar cálculo de cobertura, contadores, revisão e backend à nova apresentação, sem transformar desconhecimento em ausência.

## 6. Roteiro e implementação

Novo roteiro:

1. Semana letiva.
2. Períodos e avaliações.
3. Sábados letivos.
4. Férias docentes.
5. Atividades e datas do campus.
6. Revisão e conclusão.

Manter `/periodos` como endereço da etapa unificada. O endereço antigo `/avaliacoes` deve abrir diretamente o bloco de avaliações na mesma etapa, preservando links de pendência e o histórico do navegador. Atualizar numeração, títulos, ações Continuar e referências que dependem das etapas antigas. A fonte atual do roteiro é [editor-steps](../../web/features/calendar-editor/editor-steps.ts).

Ordem recomendada para a implementação:

1. Ajustar o comando de períodos para dispensar a aplicação separada de organização; cobrir conflitos e conversão legada.
2. Reunir períodos e avaliações, retirar os formulários extras e adaptar navegação/links.
3. Reposicionar a confirmação normativa na revisão e a exigência local de matrícula no detalhe da atividade; ajustar os consumidores das regras.
4. Conferir dados existentes, rascunhos e mensagens; validar o fluxo completo antes de publicar.

Não ampliar esta mudança para um novo sistema geral de autosave. Usar o hook compartilhado de formulários, os comandos puros e a persistência existentes. **Adicionar/Salvar período** aplica a unidade válida; somente a confirmação Convex permite mostrar gravação concluída. Ao implementar os formulários, consultar exports/tipos da versão instalada do TanStack Form e as referências oficiais exigidas pelo [AGENTS.md](../../AGENTS.md).

## 7. Critérios de aceite e validação

- Calendário anual de uma oferta permite cadastrar as datas pelo conteúdo do screenshot, sem aplicar organização em outro formulário.
- Integrado anual e graduação semestral continuam funcionando juntos, inclusive com datas coincidentes entre ofertas diferentes.
- Mudanças conflitantes de ciclo e legado ambíguo recebem correção contextual, preservando dados.
- Avaliações mantêm configuração por oferta, datas, fontes e distribuição automática; não se confundem com períodos de aulas.
- Configurações antigas de ingresso e norma continuam preservadas e acessíveis. Não surgem bloqueios sem ação de resolução, nem afirmações automáticas de conformidade sem fundamento.
- O roteiro tem seis etapas. Links antigos de avaliações e links de revisão abrem o bloco/item correto; voltar, avançar e rascunhos funcionam.
- Desktop 1440 px e mobile 390 px, teclado, foco e controles desobstruídos são verificados. Referências visuais só mudam após inspeção.

Na implementação, começar pelas regressões de períodos/organização e pelo fluxo real de cadastro; depois cobrir navegador e regras de cobertura/prontidão. Executar `pnpm check` antes de concluir mudanças de código. Se o modelo ou runtime de PDF mudar, executar também `pnpm test:runtime:linux`, conforme [Verificação](../verificacao.md).

**Validação da investigação inicial:** descoberta local com `pnpm exec intent list`, leitura de código, planos e histórico Git; conferência de formatação do arquivo com Prettier. A entrega inicial era somente documental. A implementação e seus resultados estão registrados abaixo.

## 8. Implementação

Implementada a etapa **Períodos e avaliações**, com seis etapas no roteiro. `/avaliacoes` redireciona para `/periodos#assessment-area`; links de atividade da revisão e retomada de avaliações usam a etapa unificada. As avaliações são agrupadas por oferta e usam o painel existente.

O comando `applyPeriod` atualiza o mapa de organização e o resumo junto do período, rejeita ciclos conflitantes e protege exigências de matrícula e editais vinculados. A classificação de legado atualiza seu estado de conversão sem alterar IDs ou datas. Os dois formulários extras e o CSS exclusivo de ingresso foram retirados.

`ScopeForm` oferece a confirmação de norma na revisão, sem presumir enquadramento nem fabricar fonte. `IntakeRequirementForm` permite exigir matrícula com fonte dentro do detalhe da atividade. Seu comando altera apenas a oferta/ciclo escolhido e conserva declarações anteriores. Ingresso desconhecido deixa de produzir uma tarefa de configuração; regras de veteranos e exigências locais já registradas permanecem independentes.

Foram adicionadas regressões de domínio em `test/period-organization.test.ts`, um fluxo real em desktop/mobile em `test/browser/periods-assessments.spec.ts` e referências visuais em `test/browser/periods-assessments.visual.spec.ts`. As três regressões iniciais foram executadas e falharam antes da correção. Após a implementação, os cinco testes de domínio e o fluxo completo em 1440/390 px passaram, incluindo geração de quatro etapas, fontes, matrícula contextual, foco e compatibilidade do endereço antigo. As capturas da nova tela foram inspecionadas nos dois tamanhos.

A validação completa está sendo coordenada com a mudança simultânea da tela de atividades no mesmo checkout, autorizada pelo usuário na conversa correspondente. Não houve publicação, commit, alteração do modelo de impressão ou do runtime de PDF nesta implementação. E2E remoto não foi executado; as verificações usam fixtures locais. O `pnpm check` consolidado final passou: formatação, lint, lint de tipos, todos os typechecks, `agents:check`, **434 testes unitários em 76 arquivos**, **176 testes de navegador** com comparações visuais desktop/mobile e build. Log local: `/tmp/stage6-final-check.log`. A rodada direcionada final passou em cinco casos de navegador (fluxo em 1440/390 px, duas comparações visuais sem atualização e aviso acessível) e em 37 testes Vitest nos quatro arquivos afetados. `git diff --check` e a formatação dos Markdown alterados também passaram.

## 9. Revisão e acabamento antes da release

A revisão independente de padrões e requisitos identificou três problemas: exigência de matrícula de um ciclo antigo bloqueava períodos da organização atual; a mudança de organização podia deixar uma atividade vinculada somente a outra oferta; e o foco do bloco de avaliações era sobrescrito ao voltar pelo histórico do navegador. As correções preservam os dados antigos, validam a pertinência das ofertas e dão prioridade ao foco do destino específico. Prazos docentes semestrais continuam válidos quando a oferta passa a ser anual.

As regressões reproduziram as falhas antes dos ajustes. O arquivo de domínio passou em oito testes; o fluxo de navegador inclui o retorno por histórico em desktop/mobile, cadastro com exigência antiga preservada e rejeição de mudança que invalidaria um vínculo. Os revisores conferiram os ajustes e não apontaram novos problemas concretos.

Por solicitação adicional do usuário, **Períodos letivos** e **Etapas de avaliação** agora ocupam dois cards empilhados, com fundo, bordas, títulos e espaçamento distintos. As referências desktop/mobile foram inspecionadas e sua comparação foi repetida sem atualização. Não foi necessária migração de dados; a publicação solicitada seguirá o procedimento de fast release após a validação de desenvolvimento.

Após os ajustes da revisão e a separação em cards, `pnpm check` passou novamente: formatação, lint, lint de tipos, todos os typechecks, `agents:check`, **437 testes unitários em 76 arquivos**, **180 testes de navegador** com as referências desktop/mobile e build. A suíte de navegador levou cerca de dois minutos. Log local: `/tmp/release-review-check.log`. `git diff --check` e a formatação dos Markdown alterados também passaram. E2E remoto não foi executado, por não haver opt-in; o modelo e o runtime de PDF não foram alterados.
