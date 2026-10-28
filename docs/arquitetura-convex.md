# Arquitetura

A aplicação é uma SPA React e Vite com uma entrada HTML e TanStack Router. Convex concentra identidade, sessões, consultas reativas, transações, arquivos e processamento. `server.ts` serve o build estático para preview e recusa `/api/*`.

## Responsabilidades

| Módulo                                              | Responsabilidade                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `web/app/`                                          | Árvore tipada de rotas, layouts, sessão, erros e Devtools                          |
| `web/features/`                                     | Páginas e formulários organizados por assunto                                      |
| `web/features/calendar-editor/session/`             | Estado confirmado/aplicado, sincronização, autosave e ciclo de vida do calendário  |
| `web/shared/forms/`                                 | Rascunhos em memória, submissão e composição comum de formulários                  |
| `web/shared/convex/`                                | Cliente, erros, tipos e operações por domínio                                      |
| `web/components/`                                   | Controles visuais e confirmação acessível                                          |
| `src/calendar-edits/`                               | Comandos puros que validam e aplicam alterações de calendário                      |
| `src/calendar-rules/`                               | Política por ano, oferta e período; cobertura, referências e organização acadêmica |
| `src/printing/`                                     | Modelo puro de impressão e distribuição de dias                                    |
| `assets/printing/`                                  | CSS e logo usados no documento                                                     |
| `convex/calendars.ts`, `histories.ts`               | Calendários, versões, lixeira, fontes e análise dos PDFs                           |
| `convex/catalogue.ts`, `documents.ts`, `reviews.ts` | Base institucional, documentos e revisão humana                                    |
| `convex/access/`                                    | Sessão, identidade, membros, convites, recuperação e instalação                    |
| `convex/nativeFiles.ts`                             | Uploads temporários, tickets, restauração e limpeza agendada                       |
| `convex/actions/`                                   | Processamento Node de arquivos, análise e PDF                                      |
| `convex/operations.ts`                              | Admissão de trabalho, manutenção e drenagem de actions                             |

Rotas compõem features; features usam domínio e infraestrutura. Domínio não importa React ou DOM. O runtime Node não entra nos bundles do navegador. Consultas paginadas pertencem às telas que as utilizam.

## Navegação e formulários

TanStack Router tipa caminhos, parâmetros e contexto. O contrato puro de caminhos em `src/app-routes.ts` atende Vite, preview e rewrites Vercel; somente rotas conhecidas recebem `index.html`. Arquivos ausentes e destinos desconhecidos mantêm erro.

TanStack Form controla valores, validação e submissão. Filtros efetivos representados na URL pertencem ao Router. Um registro em memória conserva rascunhos não sensíveis por usuário, formulário e entidade para remontar telas. Credenciais e arquivos não são serializados nesse registro; logout limpa os rascunhos.

O diálogo compartilhado `confirmAction` mantém foco contido, cancelamento e retorno de foco. Durante a confirmação, bloqueia duplicidade e apresenta erros sem fechar prematuramente. Navegação, formulários e operações assíncronas preservam a identidade da entidade envolvida.

## Estado do editor e concorrência

1. O snapshot **confirmado** possui versão aceita pelo backend e revisão institucional incorporada.
2. O calendário **aplicado** contém as ações Aplicar/Adicionar da sessão e pode aguardar gravação.
3. O **preenchimento** pertence ao formulário e só altera o calendário quando aplicado.

Renderização e seletores apenas derivam apresentação. Comandos de domínio validam e recalculam atomicamente; a transação Convex mantém as garantias de autorização, versão e persistência.

Autosave agrupa alterações próximas e mantém uma gravação pendente por sessão. Cada envio usa um snapshot imutável. Sua confirmação atualiza a versão esperada sem apagar alterações aplicadas durante o envio. `saved` depende de confirmação efetiva; validação local e conexão não comprovam gravação.

Uma atualização reativa pode renovar uma sessão limpa. Com alterações locais, a sessão preserva os dados e sinaliza a resolução necessária. Falha recuperável admite nova tentativa; conflito ou sessão expirada bloqueia novas gravações até resolução. Trocar de calendário encerra o ciclo de vida da sessão; resultados tardios não alteram outra entidade.

Exportações que exigem persistência aguardam a conclusão das alterações aplicadas relevantes e usam a versão confirmada. A cópia local representa o estado aplicado; campos ainda não aplicados não entram no arquivo. Não há persistência durável offline, nem promessa de salvar ao fechar o navegador.

## Persistência e autorização

`users` e `auth*` pertencem ao Convex Auth. `campuses` e `calendars` guardam unidades e metadados; `calendarContents` guarda o estado editável. Versões e snapshots são registros próprios. `reviews` e `reviewVersions` registram análise e revisão; `histories` e `historyAnalyses` guardam fontes e extração. Documentos e catálogo usam revisão por ano. Datas operacionais são timestamps; datas acadêmicas são civis.

Convex Auth é a biblioteca `@convex-dev/auth`, instalada e configurada pela aplicação para executar autenticação no próprio backend Convex; não é um serviço externo de identidade nem uma funcionalidade ativada automaticamente ao criar o banco. A aplicação personaliza os fluxos de credenciais e a autorização. O login Google está intencionalmente desabilitado até segundo aviso; a integração preparada só deve ser reativada mediante instrução explícita, conforme [Acesso e contas](recuperacao-de-senha.md#google-institucional).

O backend deriva identidade, papel e campus da sessão. CAMPUS só atua na unidade autorizada; ADMIN gerencia o sistema; PARECERISTA revisa sem editar calendários. Guards organizam as telas; cada função Convex autoriza a operação. Tipos gerados e validadores são a referência dos contratos.

Salvar calendário confere versão e base, preserva atributos protegidos e valida fontes históricas; uma gravação sem mudança não cria versão artificial. A revisão humana possui salvamento explícito e depende da versão do calendário, base e revisão do parecer. Atualização institucional exige incorporação explícita.

## Arquivos, impressão e manutenção

PDFs ficam no Storage por `storageId`; URLs são obtidas no acesso. Uploads têm proprietário, limite de 8 MB, assinatura PDF, SHA-256 e consumo único. Restauração exige o original exato e preserva ID, análises e vínculos. Tickets e temporários possuem limpeza agendada em funções de identidade estável.

Prévia, impressão e PDF usam o mesmo modelo de `src/printing/`. O gerador Node controla Chromium, bloqueia rede do renderizador e mantém recursos locais. Produção não carrega módulos de Devtools nem os recursos de depuração de formulários sensíveis.

`operationalControl` guarda a manutenção; `operationalLeases` identifica actions admitidas. A admissão e a pausa são transacionais; mutations de domínio e criação de sessões verificam manutenção. Heartbeat e disconnect de presença continuam disponíveis e usam o ciclo próprio do componente fixado, sem alterar o domínio acadêmico. O smoke pode autorizar temporariamente uma conta ADMIN local na janela do commit; as demais contas permanecem bloqueadas. Actions registram o ID do lease no log e o removem em `finally`. Um lease sem conclusão permanece visível e bloqueia publicação: idade não é prova de término. O procedimento de recuperação está em [Implantação e operação](implantacao-convex-vercel.md).

Comandos e ambientes de validação estão em [Verificação](verificacao.md).

## Conteúdo v3 e política de 2027

Novos conteúdos e cópias usam `schemaVersion: 3`. A ausência do discriminador no conteúdo persistido identifica v2; os leitores preservam os snapshots antigos e adaptam o calendário em memória, sem escrita pela consulta. O próximo salvamento válido grava v3 com controle de versão. Um payload v2 não pode rebaixar um calendário já convertido. A importação de cópia passa pelo conversor e pela confirmação local.

`organizationByModality` define organização anual, semestral ou `a-classificar`; `association` vincula períodos a ofertas e ao ciclo `annual`, `first` ou `second`. O resumo global deriva desse mapa. A contagem recebe períodos disjuntos de uma oferta, permitindo coincidência entre ofertas distintas. Conversões ambíguas preservam IDs/datas e exigem classificação antes de comprovar contagem e cobertura. O ingresso usa estados explícitos por oferta/ciclo e fonte local quando fundamenta exigência.

`recordType`, `publicationStatus` e `admission` separam intenção documental, execução e finalidade. A posição temporal também é derivada das datas, impedindo contornar a política trocando apenas o discriminador. Referências anteriores têm efeito informativo; não satisfazem horas, etapas, férias ou dias atuais. Sua validação civil não enumera intervalos antigos. Editais anteriores exigem execução comprovada; previsões podem integrar planejamento, com metadados e fonte, sem comprovar publicação.

`rulesetVersion` registra o conjunto apresentado; o servidor resolve a política vigente pelo ano e escopo e recusa identidades omitidas ou divergentes em novos payloads. O conjunto de 2027 é `consup-292-2027-v1`. O roteiro de 2026 permanece separado; escopos sem norma configurada não recebem conformidade automática. Salvar trabalho estruturalmente válido continua possível com pendências normativas, mas concluir depende da cobertura e revisão adequadas.

`scopeConfirmation` registra a identificação humana do escopo e sua fonte, sem criar nova modalidade. `deadlineExtensionCause` exige causa municipal explícita e fonte antes de derivar a extensão de prazos de referência pelo art. 3º, § 2º. Um ajuste de cronograma declarado não representa autorização da Proens: a cobertura objetiva e a conferência humana atual do critério são verificações separadas. `readiness.humanReview` informa essa conferência sem confundi-la com a existência de outras pendências.

As análises históricas têm identidade imutável, versão do extrator e hash do PDF. A associação legada aponta à análise original, e novas fontes carregam `analysisId`. Reanálise não substitui candidatos utilizados, nem modifica o calendário ao consultar. Autorização, campus, calendário, análise e chave do candidato são conferidos juntos no salvamento.

A atualização da fonte institucional de 2027 foi ensaiada por `preview2027SourceUpdate`: propõe apenas a troca da fonte antiga quando conteúdo, escopo e datas coincidem com a base inicial. O ensaio é puro e idempotente; diferenças locais aparecem como conflitos. Nenhuma atualização de instalações existentes ocorre na inicialização. Uma operação administrativa futura deve apresentar a prévia, usar controle de concorrência e incorporar explicitamente o impacto nos calendários.

## Compatibilidade da base institucional

`src/calendar-base/` concentra a política de equivalência, comparação e confirmação da base aplicável ao calendário. A revisão numérica é um marcador técnico; a identidade de conteúdo considera eventos, fontes, aplicabilidade e arquivos documentais. Ordem dos registros, ofertas externas ao calendário e metadados operacionais não exigem uma decisão do usuário. O adaptador `convex/calendars/base.ts` seleciona as referências por ano e oferta e adapta os snapshots persistidos para essa interface.

O editor recebe a análise pela sessão. Uma base equivalente não apresenta card: `synchronizeBase` atualiza somente a referência técnica, sem receber campos locais, recalcular datas, alterar autoria/data editorial ou criar versão. A mesma equivalência permite salvamento e PDF sem exigir essa sincronização antecipada. Durante o smoke autorizado em manutenção, a sincronização não grava nem mesmo a referência técnica; o smoke também verifica que os snapshots e a revisão persistida permanecem intactos. Alterações reais exigem uma confirmação vinculada à identidade do conteúdo exibido; a transação verifica novamente a identidade e a versão do calendário. Mudanças em eventos recalculam o calendário; mudanças apenas documentais preservam as datas. Ambas geram versão editorial quando incorporadas.

Novas revisões humanas guardam `baseIdentity`, além da revisão técnica e dos snapshots documentais originais. Uma mudança irrelevante no contador não invalida a análise; alterações no conteúdo aplicável ou na versão editorial invalidam. Registros anteriores sem essa identidade continuam exigindo a revisão técnica original, pois não há evidência suficiente para declarar equivalência retroativamente. A sincronização nunca reescreve uma revisão humana.

Em 2027, a identidade `base-v2:<conjunto>:<hash canônico>` acrescenta a política à identidade de conteúdo. O hash canônico preserva a comparação anterior; anos sem mudança de regras mantêm `base-v1` e não recebem falsa mudança global. A categoria de comparação `rules` exige incorporação e nova revisão, mesmo com catálogo/datas iguais. Se houver também mudança de eventos, a incorporação recalcula as datas. O rascunho de parecer de outro conjunto perde as confirmações antigas; notas ficam identificadas como contexto, e snapshots permanecem imutáveis.

## Controles de segurança

A autorização compara a geração da sessão com a do usuário, inclusive na emissão/renovação de JWT. A criação transacional carimba geração e hora original de autenticação. A revogação é imediata; exclusões físicas são limitadas por lote. Ações de acesso sensíveis exigem ADMIN e login nos últimos 15 minutos. Convites/resets válidos consomem quota persistente antes do hash; tentativas inválidas não abrem leases.

Uploads administrativos recebem bytes limitados em mutation, que valida ticket, propriedade, assinatura inicial e SHA-256 e grava objeto e vínculo de maneira atômica. O cliente não associa IDs de Storage. Sessões e credenciais expiradas têm cron de limpeza limitado e interrompido durante manutenção. O [guia de segurança operacional](seguranca-operacional.md) detalha dependências corrigidas, patches versionados, compatibilidade legada e requisitos da futura publicação.
