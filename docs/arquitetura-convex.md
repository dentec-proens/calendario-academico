# Arquitetura

A aplicação é uma SPA React e Vite com TanStack Router. Convex concentra identidade, sessões, consultas reativas, transações e processamento. `server.ts` serve o build estático para preview e recusa `/api/*`.

Este guia registra decisões, garantias e limites que o código não explica sozinho. A organização dos arquivos e as regras detalhadas devem ser lidas nos próprios módulos e testes.

## Camadas

- `web/` é a interface: rotas, features por assunto e infraestrutura compartilhada de formulários e Convex.
- `src/domain/` contém as regras acadêmicas puras, compartilhadas por editor, revisão, backend e impressão. Não importa React, Router, Convex nem runtime Node.
- `src/printing/` é o modelo puro da prévia, que o navegador imprime ou salva em PDF; `src/runtime/` executa o servidor estático em Node, fora dos bundles do navegador.
- `convex/` autoriza, persiste e orquestra; cada função adapta o domínio às transações.

`test/architecture/boundaries.test.ts` mantém essas fronteiras. Imports apontam ao módulo responsável, sem fachadas de reexport.

## Política por ano

Tudo o que varia com a norma de um ano pertence a uma política em `src/domain/policies/`, que implementa o contrato `CalendarPolicy`. `registry.ts` é o único ponto que associa ano e política. O restante do código consulta a política e não compara anos, de modo que um novo ano é um novo módulo registrado.

Anos sem norma configurada usam uma política que preserva vínculos sem afirmar conformidade. Políticas compõem bases neutras, como a lista operacional sem datas e os itens do parecer, e não dependem umas das outras. Referências históricas de revisão não ativam automaticamente mínimos de contagem.

As atividades exigidas são declaradas como dados: cada `ActivityRule` (`src/domain/calendar/activities/rules.ts`) declara a própria base de repetição, uma vez por ano letivo (`once`), por ciclo da oferta (`cycle`, com `cycles()` derivando os ciclos do calendário), por semestre de referência, mesmo em ofertas anuais (`semester`), ou por etapa de cada oferta (`stage`); `declareRules()` compõe em cada regra a base e os valores comuns (`each`) de um grupo de atividades, num só ponto. Cada regra declara base normativa, critério do parecer, grupo, categoria e formulário; tipos abrangidos (`modalities`), ofertas em que a atividade é opcional com a nota exibida (`optionalFor`), exigência por configuração de ingresso (`intake`) e decisões (`decision`) também são campos. O expansor gera os mesmos IDs persistidos (`stage-1:integrado`, `enrolment-0`), e a aplicabilidade, o grupo, a categoria, o formulário e o critério vêm desses campos, não do formato do ID. O formato ainda identifica etapas de avaliação (`isStageRequirementId`) e editais na validação de registros. Rótulos e exceções que dependem da etapa, do ciclo ou do calendário são funções da posição, ao lado da própria atividade. A lista operacional sem datas usa o mesmo formato para anos sem norma e os IDs legados conservados em 2027.

Políticas vinculadas expõem a tabela em `catalogue`, e a página **Regras do calendário** (`/regras`, em `web/features/rules/`) a apresenta a todos os perfis no próprio navegador, sem consulta ao backend: norma, versão vigente, janela, atividades com a aplicação por oferta, mínimos, histórico e critérios. A aplicação por oferta usa as mesmas linhas do editor, calculadas pela política num calendário com todas as ofertas; `test/web/rules-view.test.ts` garante que a organização e o número de etapas só repetem as atividades, sem mudar a obrigatoriedade, e falha se uma norma passar a variar com eles. A página mostra cada atividade pelo seu `title`, sem a etapa ou o ciclo, e não repete prazo, mês ou carga horária que o nome já traz.

## Regras, salvamento e erros

Comandos de domínio validam e aplicam alterações puras. A preparação do salvamento preserva campus e ano, impede remover ofertas, limita registros legados ao acrescentar ofertas, sem acessar banco nem confirmar gravação. O término de um período é sempre o gravado: uma mudança na base muda a contagem, nunca a data escolhida. A mutation mantém autorização, controle de versão, histórico, auditoria e persistência na mesma transação.

Um vínculo gravado nunca é apagado por efeito colateral. A fronteira de gravação compara cada data com a de mesmo ID no estado anterior: um vínculo sem atividade gerada pela configuração atual só é aceito se já constava, idêntico, naquela data; vínculo novo ou alterado precisa de atividade gerada; só excluir a data ou corrigir a atividade vinculada mudam o vínculo. Uma data editada (início, término, ofertas ou vínculo) passa por todas as validações de intervalo e associação; uma data inalterada nunca é recusada por elas, mesmo depois de mudar organização, etapas ou períodos, e o conflito vira diagnóstico em **Vínculo a conferir**, sem contar como atendimento. Mudar a configuração nunca é recusado por datas existentes. Os comandos de data seguem o mesmo contrato (`src/domain/calendar/commands/events.ts` e `activities/links.ts`): `planActivityDate` exige a atividade vinda do contexto, `createCampusDate` recusa atividade, `updateDate` preserva o vínculo e só `changeActivity` (**Corrigir atividade vinculada**) o altera, com prévia.

Classificação do vínculo, aplicabilidade, cobertura, execução e revisão humana são calculadas, nunca gravadas como marcação.

Os diagnósticos são decisões comuns ao editor e à conclusão. Cada chamada examina o snapshot recebido: o editor pode diagnosticar o estado aplicado sem transformar isso em confirmação de persistência; o backend avalia o registro confirmado e a revisão humana atual.

Violações corrigíveis pelo usuário são `DomainError`: 400 para entrada inválida, 404 para registro ausente e 409 para dados alterados. O Convex as converte em `ConvexError` com status e mensagem; outros erros permanecem falhas internas.

## Navegação e formulários

O contrato puro de caminhos atende Vite, preview e rewrites Vercel; somente rotas conhecidas recebem `index.html`, e destinos desconhecidos mantêm erro. Filtros efetivos na URL pertencem ao Router; TanStack Form controla valores, validação e submissão.

Rascunhos não sensíveis ficam em memória por usuário, formulário e entidade, para remontar telas. Credenciais e arquivos nunca são serializados; logout limpa os rascunhos. A confirmação compartilhada mantém foco contido, bloqueia duplicidade e apresenta erros sem fechar prematuramente.

## Atualização do frontend

A identidade opaca de cada build acompanha o cliente e `/version.json`; qualquer diferença, inclusive rollback, indica nova versão. A consulta aceita somente JSON da mesma origem, sem redirecionamento, até 1 KiB e com timeout de cinco segundos. Ocorre ao iniciar, retornar à aba, recuperar conexão e restaurar a página, além de a cada 120 segundos, com intervalo mínimo de quinze segundos entre gatilhos comuns.

A proteção consulta de forma síncrona os proprietários reais de formulários, rascunhos, operações e sessão do editor. Inicialização incompleta bloqueia a atualização. Desmontar um componente não conclui uma operação nem descarta trabalho. Formulários privados registram somente risco, sem copiar valores. `beforeunload` protege saídas manuais, mas não salva dados e pode não ocorrer em navegadores móveis.

Um clique explícito para outra seção do workspace só vira navegação completa quando a aba está limpa e há observação diferente com até trinta segundos. A decisão ocorre no próprio evento, sem esperar rede ou salvamento; cliques modificados, filtros, histórico e navegação programática mantêm sua semântica. A autorização é por aba.

A transição trava novas edições antes da navegação e oferece cancelamento após dez segundos. Timeout sozinho não libera a interface: a resposta tardia precisa ser interrompida ou a restauração por BFCache confirmada. Falha de carregamento repete o URL original do módulo, mantendo os mesmos proprietários de sessão e rascunho. Não há persistência durável contra encerramento do processo, descarte da aba ou falta de energia. Os builds herdam os arquivos públicos das publicações anteriores para que abas abertas continuem carregando seus módulos, conforme [Implantação e operação](implantacao-convex-vercel.md#continuidade-dos-arquivos-entre-publicações).

## Estado do editor e concorrência

1. O snapshot **confirmado** possui versão aceita pelo backend e a cópia da base gravada no último salvamento.
2. O calendário **aplicado** contém as ações Aplicar/Adicionar da sessão e pode aguardar gravação.
3. O **preenchimento** pertence ao formulário e só altera o calendário quando aplicado.

Renderização apenas deriva apresentação. Autosave agrupa alterações próximas e mantém uma gravação pendente por sessão, com snapshot imutável por envio. A confirmação atualiza a versão esperada sem apagar alterações aplicadas durante o envio. "Salvo" depende de confirmação efetiva; validação local e conexão não comprovam gravação.

Uma atualização reativa pode renovar uma sessão limpa; com alterações locais, a sessão preserva os dados e sinaliza a resolução necessária. Falha recuperável admite nova tentativa; conflito ou sessão expirada bloqueia gravações até resolução. Trocar de calendário encerra a sessão, e resultados tardios não alteram outra entidade.

Exportações que exigem persistência aguardam as alterações aplicadas relevantes e usam a versão confirmada. Não há persistência offline nem promessa de salvar ao fechar o navegador.

## Persistência e autorização

O estado editável fica separado dos metadados do calendário. O catálogo usa revisão por ano. Datas operacionais são timestamps; datas acadêmicas são civis.

O calendário tem um ciclo de vida explícito (`calendars.status`): rascunho, enviado, em revisão, devolvido, revisado, vigente e arquivado. A tabela de transições é uma função pura em `src/domain/calendar/lifecycle.ts`; `transitionCalendar` a aplica e confere papel, campus, unicidade, cobertura e as condições de cada ação na mesma mutation, junto da auditoria. `calendars.version` conta só o conteúdo e avança apenas em `saveCalendar`; as transições usam `statusRevision` como controle de concorrência. Assim, a autoria, a prontidão e o parecer não mudam com uma transição.

Há um calendário em análise (enviado, em revisão, devolvido ou revisado) e um vigente por campus, ano e tipo de oferta. `offerKinds` é um array, que um índice não filtra por elemento: a mutation lê `by_campusId_and_year_and_status` para cada status, sem truncar, descarta a lixeira e compara em memória. A transação serializável do Convex protege a regra contra envios simultâneos. Um devolvido que acrescenta oferta passa pela mesma conferência no salvamento.

Cada envio grava um registro em `calendarSubmissions` com a cópia do conteúdo enviado (estado, bases, ofertas e nome do campus), uma impressão digital do conteúdo e uma lista de decisões só de acréscimos (recolhido, devolvido, concluído, reaberto, publicado). A sequência nunca é reaproveitada. `currentSubmissionId` aponta o envio aberto, ou o devolvido em um calendário devolvido. O parecer guarda `submissionId` e só vale para o envio atual; a publicação confere ainda a versão e a impressão digital do conteúdo. O salvamento não arquiva snapshots: o envio é a evidência do que cada parecer avaliou. A comparação entre envios (`src/domain/calendar/diff.ts`) é pura e calculada no navegador, a partir das cópias, que não mudam; nenhuma query reativa a recalcula a cada salvamento automático.

A decisão de devolução guarda em `returnedCriteria` (opcional; devoluções antigas não têm) os critérios **Não atendido** avaliados no parecer deste envio sob regras equivalentes, com nome e observação, porque o campus não lê o parecer. A mutation deriva a lista do parecer salvo, sem aceitá-la do cliente, e `maximumReturnedCriteriaBytes` (64 KiB) a mantém na margem acima de `maximumSubmissionBytes`, junto de um teto para o documento inteiro; o que não couber recusa a devolução, sem cortar observações. O destino de correção não é gravado: é calculado na leitura pelo identificador do critério.

Nos estados publicados, a avaliação e a impressão usam só a base congelada no conteúdo. Em enviado, em revisão e revisado, uma mudança da base aparece como aviso e impede a publicação; a saída é devolver o calendário ao campus.

Convex Auth é a biblioteca `@convex-dev/auth`, configurada pela aplicação para autenticar no próprio backend; não é um serviço externo nem é ativada automaticamente ao criar o banco. O login Google está intencionalmente desabilitado até segundo aviso e só deve ser reativado mediante instrução explícita, conforme [Acesso e contas](recuperacao-de-senha.md#google-institucional).

O backend deriva identidade, papel e campus da sessão. CAMPUS só atua na unidade autorizada; ADMIN gerencia o sistema; PARECERISTA revisa sem editar calendários. Guards organizam as telas, mas cada função Convex autoriza a operação.

Salvar confere versão, status e base e preserva atributos protegidos; uma gravação sem mudança não cria versão artificial. Salvar só grava em rascunho e devolvido; o editor deriva o modo somente leitura do papel e do status e recria a sessão quando o status muda em outra aba. A revisão humana tem salvamento explícito e depende da versão do calendário, da base e da revisão do parecer.

## Arquivos, impressão e manutenção

O sistema não guarda arquivos. A norma de cada ano é citada pela política, com link para a publicação oficial.

O PDF é a impressão da prévia pelo navegador, com `@page` A4 definido em `assets/printing/calendar.css`. O título da página sugere o nome do arquivo. Produção não carrega Devtools nem a depuração de formulários sensíveis.

A admissão de actions e a pausa de manutenção são transacionais; mutations de domínio e criação de sessões verificam a manutenção. A presença mantém o ciclo próprio do componente, sem alterar o domínio acadêmico. Actions registram o lease no log e o removem em `finally`; um lease sem conclusão permanece visível e bloqueia publicação, pois idade não prova término. A recuperação está em [Implantação e operação](implantacao-convex-vercel.md), e a validação em [Verificação](verificacao.md).

## Conteúdo do calendário e política de 2027

O vocabulário segue a Resolução CONSUP/IFPR nº 292/2026: a unidade do calendário é a **Data** (arts. 2º e 11) e o que deve ser contemplado é a **Atividade** (art. 11), com seu **Fundamento**. “Evento” fica só onde a norma o usa (nomes de atividades, eventos institucionais do art. 12, eventos locais do art. 18 e a categoria PROENS), e “Regra” não aparece na interface. No código, uma data é `CalendarEvent`, uma atividade declarada é `ActivityRule`, a linha avaliada por oferta e ciclo é `ActivityPlanItem` (de `activityPlan()`), o vínculo é `ActivityRef` e a contagem trabalha com `CountingInterval`; `test/architecture/naming.test.ts` impede a volta dos nomes antigos.

Novos conteúdos e cópias usam `schemaVersion: 7`; o efeito de cada data na contagem fica em `effect`. Cada oferta tem `id` imutável, `kind` para aplicabilidade normativa, rótulo, modo e organização. É possível repetir um tipo com rótulos distintos. Eventos e associações de períodos usam IDs de ofertas; o catálogo institucional continua selecionado por tipo e é materializado para todas as ofertas daquele tipo. Cada data local lista sempre suas ofertas em `offers` (nunca vazio), que a contagem usa, e uma data vinculada conta como atendimento para todas elas; acrescentar uma oferta ao calendário não estende as ofertas de datas existentes. Férias docentes recebem sempre as ofertas atuais, por serem únicas para o campus; sábados criados no passo Sábados letivos recebem as ofertas atuais. As entradas do snapshot institucional listam em `offers` as ofertas que alcançavam quando foram copiadas (nunca vazio); o catálogo institucional continua declarando `modalities`, resolvidas em ofertas na cópia. `offerKinds` no registro é um resumo dos tipos distintos e ordenados; organização geral e ingresso geral são derivados, não persistidos.

Uma data local com atividade guarda o vínculo em `activity` (`ActivityRef`), com uma forma por base de repetição; sem `activity`, é uma data do campus. Não há campo de seção nem de origem: a origem vem do contêiner (`state.events` ou snapshot institucional). Uma data do campus informativa, em categoria permitida, pode ter `internal: true` (art. 18): fica fora da impressão oficial, das evidências do parecer e da liberação de publicação, e a mesma regra de elegibilidade (`src/domain/calendar/internal-dates.ts`) vale no formulário, nos comandos, na gravação e na impressão.

A organização é anual ou semestral. Etapas são configuradas por ciclo: duas, três ou quatro no ano letivo, ou uma ou duas por semestre. Os vínculos por etapa (`activity` com `offerId` e `position`) guardam o ciclo e o número na etapa; a apresentação reinicia a numeração em cada semestre. Mudar a organização nunca reinterpreta uma posição: a que deixa de existir, ou ainda não existe numa oferta sem etapas informadas, fica em “Vínculo a conferir” (`not-generated`). Períodos são disjuntos por oferta e podem coincidir entre ofertas. Escopo e ingresso pertencem a cada oferta/ciclo. Modo e base da organização são informativos e não alteram obrigações ou mínimos.

O código aceita somente o formato 7, inclusive nos envios e na lixeira. A migração concluída do formato 4 e os valores antigos que continuam válidos estão em [Operações administrativas de dados](migracao-schema.md#formatos-antigos-que-permanecem-nos-dados).

Conversões ambíguas preservam IDs e datas e mantêm a configuração pendente. Uma inconsistência migrada de ciclo gera aviso e permite salvar outra parte; uma etapa nova ou alterada precisa caber inteiramente no período do seu ciclo. A preparação preserva identidade e tipo de ofertas já salvas, cuja remoção permanece proibida.

As férias não têm campo próprio: `events` é a única fonte, com datas vinculadas às atividades `school-vacation` (critério III) e `teacher-vacation` (critério IV), preenchidas no passo **Férias** (variante `vacation`). `activities/vacations.ts` guarda o que vale em todo ano, com ou sem norma: efeito `exclude`, categoria `ferias`, datas no ano do calendário e nenhuma sobreposição no mesmo tipo em ofertas comuns. Os 45 dias docentes são `exactDays` da regra de 2027, avaliado em `plan-evaluation.ts`. Períodos estruturados com datas derivadas na projeção foram descartados porque um leitor esquecido de `events` contaria dias de férias sem erro. Um registro único para as duas férias também foi descartado: coincidência é um resultado calculado, e o registro teria de ser dividido no primeiro ajuste.

Execução e finalidade de ingresso são dados separados. A posição temporal é derivada das datas e validada pelo domínio. Referências anteriores são informativas e não satisfazem horas, etapas, férias ou dias atuais; editais anteriores exigem execução comprovada, e previsões podem integrar o planejamento sem comprovar publicação.

O conjunto de regras apresentado é gravado com o conteúdo. O servidor resolve a política vigente pelo ano e escopo e recusa identidades omitidas ou divergentes. Trabalho estruturalmente válido pode ser salvo com pendências normativas, mas concluir depende da cobertura e da revisão adequadas.

A confirmação do escopo é humana e individual por oferta, sem alterar seu tipo. A extensão de prazos de referência pelo art. 3º, § 2º, exige causa municipal explícita e fonte. Um ajuste de cronograma declarado não representa autorização da Proens: cobertura objetiva e conferência humana atual são verificações separadas.

Referências a calendários anteriores são digitadas pelo usuário, com datas reais e fontes textuais.

A atualização da fonte institucional de 2027 foi apenas ensaiada: a prévia pura e idempotente propõe trocar a fonte antiga quando conteúdo, escopo e datas coincidem com a base inicial, e diferenças locais aparecem como conflitos. Nenhuma instalação é atualizada na inicialização; uma operação futura deve apresentar a prévia, usar controle de concorrência e incorporar o impacto explicitamente.

### Fonte e limites das regras

A referência para 2027 é a Resolução CONSUP/IFPR nº 292, de 5 de outubro de 2026, documento SEI 4422750, processo 23411.011715/2026-07. O arquivo fornecido na investigação tinha cinco páginas e SHA-256 `594fee1beb5f0cc5f09479dfd6f1ed3c55a9f84dde6c72370641873aa052c554`; ele não é dependência do build. A política executável está em `src/domain/policies/`. A fonte fundamenta requisitos, sem atribuir autorização institucional à aplicação.

Cobertura é calculada por atividade, oferta e ciclo. Matrícula de ingressantes, rematrícula de veteranos e ajuste são atividades distintas. As exigências dos incisos V e VII do art. 11 têm recorte de subsequente e graduação e não são herdadas pelo integrado num calendário combinado; o inciso VIII não tem esse recorte. A periodicidade de editais acompanha a organização da oferta, mas obrigações docentes semestrais, como Plano de Ensino, PIT e RIT, permanecem em ofertas anuais. A falta de configuração de ingresso não significa ausência de ingressantes: não gera exigência automática sem regra local e fonte, mas preserva exigências já declaradas.

Ano do calendário, data real da publicação, destino do ingresso e prazo normativo são dados independentes. Situação de publicação e finalidade de ingresso ficam agrupadas em `notice` (`AdmissionNotice`), com destino por oferta (`destinations`); o destino é diagnosticado por oferta (`noticeDestinationIssues`) e nunca corrigido automaticamente. Previsão pode completar o planejamento após conferência, sem comprovar execução, e a passagem do tempo não muda seu estado. Intervalos informativos podem atravessar a virada do ano, mas registros com efeito letivo respeitam ano, períodos e oferta.

A primeira e a segunda semana das atividades mantêm conferência humana, pois a fonte não define o intervalo operacional. Ajuste de cronograma de processo seletivo exige fonte da Proens. A extensão por feriado municipal ou recesso não se aplica genericamente aos prazos do art. 11. Pós-graduação, EaD e qualificação não recebem conformidade automática.

## Períodos, atividades e painéis

Períodos e avaliações são organizados juntos, por oferta, e aplicados num único comando. Uma oferta nova só entra no calendário com organização completa; a mutation grava conteúdo, ofertas e versão na mesma transação, preservando o escopo dos envios anteriores. Ciclos conflitantes exigem correção explícita, e legado ambíguo conserva IDs e datas até a classificação. Períodos de ofertas diferentes podem coincidir, mas não se sobrepõem dentro da mesma oferta. Quantidade de avaliações não representa quantidade de períodos.

A exigência local de matrícula é declarada no detalhe da atividade, com fonte e oferta/ciclo próprios. Cadastrar um evento não declara sozinho uma nova exigência normativa.

Consulta e edição de atividades têm identidades distintas: abrir uma atividade não escolhe silenciosamente seu primeiro registro, filtros não alteram valores preenchidos e padrões só inicializam criação. Fechar o painel conserva o rascunho, descartar afeta somente o preenchimento e remover atua no registro aplicado. O fechamento devolve o foco à origem; sessão expirada fecha o painel sem apagar o rascunho. A referência dos componentes está em [Componentes da interface](componentes-interface.md).

Na grade de sábados, o estado aplicado vem dos comandos e a seleção pertence ao formulário. Cada lote usa uma atividade e fonte, e metas não são completadas automaticamente. Sábados fora dos períodos ou impedidos não são selecionáveis.

## Compatibilidade da base institucional

A revisão numérica da base é um marcador técnico; a equivalência considera o conteúdo aplicável ao calendário: eventos, fontes e aplicabilidade. A antiga base de documentos foi removida. A lista gravada em cada calendário fica congelada e entra apenas no cálculo da identidade, para que as identidades já registradas em pareceres continuem valendo. Calendários novos nascem com a lista vazia; uma nova versão copia a do calendário de origem, para a comparação entre os dois não apontar uma retirada que não houve. Ordem dos registros, ofertas externas e metadados operacionais não exigem decisão do usuário.

**Um calendário em edição sempre segue as regras e a base vigentes; o que fica gravado só passa a importar quando ele sai da edição.** Ninguém aceita nem incorpora nada:

- Em rascunho e devolvido, editor, pendências, contagem, impressão, prontidão do servidor e comparação com a devolução leem `institutionalEvents` e `currentCatalogueRevision`. Abrir o calendário não grava nada e não há autoria "Sistema".
- O próximo salvamento humano grava carimbo de regras e cópias da base, com `version + 1`. Uma base apenas equivalente não grava nada. Catálogo novo com edição em andamento não é conflito entre sessões.
- `BaseChangesNotice` informa o que difere da cópia gravada: regras e eventos, com o efeito nos dias letivos de cada oferta. Um evento mudado é uma data que mudou; o que ele deixa inconsistente vira pendência comum.
- O envio informa a `identity` da base que a pessoa viu, lida depois do flush. Se o servidor tiver outra, recusa com 409 sem escrever, e o editor já mostra a base nova; uma base que só chegou com o último salvamento também pede nova conferência. Se coincidir, grava a base vigente e só então copia para o envio, cujo hash a publicação compara. Sem a identidade, a aba antiga é orientada a atualizar.
- Enviado, em revisão e revisado ficam como enviados; se a base ou as regras mudarem, cabe ao parecerista devolver. Vigente não muda, e a nova versão nasce com o que está vigente.

Como nenhum campus confirma a base antes de ela valer, um erro de digitação no catálogo alcança direto os calendários em edição. Por isso `catalogueImpact` mostra ao ADMIN quantos calendários em edição são alcançados e quantos ganham pendência antes de salvar, e o audit registra o que mudou. Não há rascunho de catálogo. A consulta examina no máximo 100 conteúdos e, passando disso, diz "ao menos".

Uma mudança de regras nunca pede ação manual ao campus. Se muda o sentido de uma data, a migração de formato resolve, ou a própria data vira pendência, como em "Vínculo a conferir".

Revisões humanas guardam a identidade da base. Uma mudança irrelevante no contador não invalida a análise; mudanças no conteúdo aplicável ou na versão editorial invalidam. Revisões antigas sem essa identidade continuam exigindo a revisão técnica original, pois não há evidência para declarar equivalência retroativa.

Quando a política vincula base e revisão ao conjunto de regras, como em 2027, a identidade da base inclui esse conjunto. Anos sem essa vinculação mantêm a identidade anterior e não recebem falsa mudança global. Os envios permanecem imutáveis.

### Mudanças de regra

Cada política vinculada mantém em `rulesetChanges` o histórico ordenado das versões do conjunto de regras. A última entrada é a versão vigente, gravada no conteúdo, na revisão e na impressão. Cada entrada registra data, fonte (norma, comunicação da Proens ou decisão), resumo, critérios do parecer afetados e efeito:

- `establishes`: primeira versão da política.
- `tightens`: cria, amplia ou antecipa uma exigência. Uma mudança que aperta e afrouxa ao mesmo tempo é `tightens`.
- `relaxes`: dispensa ou restringe uma exigência.
- `editorial`: muda redação sem alterar exigências.

A base e a revisão se vinculam à última versão `establishes` ou `tightens` até a versão em que foram feitas. Somente uma nova versão desses dois tipos exige nova revisão e, em calendário já enviado, a devolução; o rascunho de parecer de outro vínculo perde as confirmações antigas. Em edição, a versão vale de imediato e o aviso resume o que mudou. Versões `relaxes` e `editorial` mantêm a identidade da base e as revisões atuais, pois a conferência feita continua válida. O servidor aceita conteúdo e revisão de uma versão equivalente e grava a versão vigente.

Quando uma regra restringe ou amplia o que o inciso diz, `decision` registra a decisão e a versão que a adotou, e o detalhe da atividade a mostra ao lado da base normativa. Em 2027, `consup-292-2027-v2` restringiu ao técnico integrado a reunião com familiares, responsáveis e comunidade (Art. 11, XVI).

## Controles de segurança

A autorização compara a geração da sessão com a do usuário, inclusive ao emitir e renovar JWT. A revogação é imediata; exclusões físicas são limitadas por lote. Ações de acesso sensíveis exigem ADMIN e login nos últimos 15 minutos. Convites e resets válidos consomem quota persistente antes do hash; tentativas inválidas não abrem leases.

Sessões e credenciais expiradas têm limpeza limitada, interrompida durante manutenção. O [guia de segurança operacional](seguranca.md) detalha dependências, patches versionados e riscos residuais.

## Falhas vistas no navegador

Uma recusa não pode ser gravada pela própria mutation, porque o erro reverte a transação. Por isso `clientErrors.report`, autenticada, recebe do cliente as recusas de salvamento, as falhas de exibição e as promessas sem tratamento, e a administração as lê em `/logs`. Não há fornecedor externo.

O registro nunca recebe o estado do calendário nem valores de formulário, e a rota perde a query. Só as mensagens de situação do registro (403, 404, 409 e 503) são guardadas; uma recusa 400 pode citar um nome digitado e vira "Recusa do servidor", e qualquer outro erro vira tipo e posição no código. Há limite de 30 relatos por pessoa por hora, deduplicação de um minuto no cliente e limpeza diária do que passa de 90 dias.
