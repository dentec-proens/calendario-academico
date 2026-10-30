# Arquitetura

A aplicação é uma SPA React e Vite com TanStack Router. Convex concentra identidade, sessões, consultas reativas, transações, arquivos e processamento. `server.ts` serve o build estático para preview e recusa `/api/*`.

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

As atividades exigidas são declaradas como dados: uma tabela de `RequirementSpec` em seções repetidas por etapa de cada oferta, por ciclo letivo, por semestre ou uma vez por calendário (`src/domain/calendar/activities/requirement-table.ts`). Cada linha declara base normativa, critério do parecer, grupo, categoria e formulário; tipos abrangidos (`modalities`), ofertas em que a atividade é opcional com a nota exibida (`optionalFor`), exigência por configuração de ingresso (`intake`) e decisões (`decision`) também são campos. O expansor gera os mesmos IDs persistidos (`stage-1:integrado`, `enrolment-0`), e a aplicabilidade, o grupo, a categoria, o formulário e o critério vêm desses campos, não do formato do ID. O formato ainda identifica etapas de avaliação (`isStageRequirementId`) e editais na validação de registros. Rótulos e exceções que dependem da etapa, do ciclo ou do calendário são funções da posição, ao lado da própria atividade. A lista operacional sem datas usa o mesmo formato para anos sem norma e os IDs legados conservados em 2027.

Políticas vinculadas expõem a tabela em `catalogue`, e a página **Regras do calendário** (`/regras`, em `web/features/rules/`) a apresenta a todos os perfis no próprio navegador, sem consulta ao backend: norma, versão vigente, janela, atividades com a aplicação por oferta, mínimos, histórico e critérios. A aplicação por oferta usa as mesmas linhas do editor, calculadas pela política num calendário com todas as ofertas; `test/web/rules-view.test.ts` garante que a organização e o número de etapas só repetem as atividades, sem mudar a obrigatoriedade, e falha se uma norma passar a variar com eles. A página mostra cada atividade pelo seu `title`, sem a etapa ou o ciclo, e não repete prazo, mês ou carga horária que o nome já traz.

## Regras, salvamento e erros

Comandos de domínio validam e aplicam alterações puras. A preparação do salvamento preserva campus e ano, impede remover ofertas, limita registros legados ao acrescentar ofertas e recalcula quando necessário, sem acessar banco nem confirmar gravação. A mutation mantém autorização, controle de versão, aceitação da base, histórico, auditoria e persistência na mesma transação.

Os diagnósticos são decisões comuns ao editor e à conclusão. Cada chamada examina o snapshot recebido: o editor pode diagnosticar o estado aplicado sem transformar isso em confirmação de persistência; o backend avalia o registro confirmado e a revisão humana atual.

Violações corrigíveis pelo usuário são `DomainError`: 400 para entrada inválida, 404 para registro ausente e 409 para dados alterados. O Convex as converte em `ConvexError` com status e mensagem; outros erros permanecem falhas internas.

## Navegação e formulários

O contrato puro de caminhos atende Vite, preview e rewrites Vercel; somente rotas conhecidas recebem `index.html`, e destinos desconhecidos mantêm erro. Filtros efetivos na URL pertencem ao Router; TanStack Form controla valores, validação e submissão.

Rascunhos não sensíveis ficam em memória por usuário, formulário e entidade, para remontar telas. Credenciais e arquivos nunca são serializados; logout limpa os rascunhos. A confirmação compartilhada mantém foco contido, bloqueia duplicidade e apresenta erros sem fechar prematuramente.

## Atualização do frontend

A identidade opaca de cada build acompanha o cliente e `/version.json`; qualquer diferença, inclusive rollback, indica nova versão. A consulta aceita somente JSON da mesma origem, sem redirecionamento, até 1 KiB e com timeout de cinco segundos. Ocorre ao iniciar, retornar à aba, recuperar conexão e restaurar a página, além de a cada 120 segundos, com intervalo mínimo de quinze segundos entre gatilhos comuns.

A proteção consulta de forma síncrona os proprietários reais de formulários, rascunhos, operações e sessão do editor. Inicialização incompleta bloqueia a atualização. Desmontar um componente não conclui uma operação nem descarta trabalho. Formulários privados registram somente risco, sem copiar valores. `beforeunload` protege saídas manuais, mas não salva dados e pode não ocorrer em navegadores móveis.

Um clique explícito para outra seção do workspace só vira navegação completa quando a aba está limpa e há observação diferente com até trinta segundos. A decisão ocorre no próprio evento, sem esperar rede ou salvamento; cliques modificados, filtros, histórico e navegação programática mantêm sua semântica. A autorização é por aba.

A transição trava novas edições antes da navegação e oferece cancelamento após dez segundos. Timeout sozinho não libera a interface: a resposta tardia precisa ser interrompida ou a restauração por BFCache confirmada. Falha de carregamento repete o URL original do módulo, mantendo os mesmos proprietários de sessão e rascunho. Não há persistência durável contra encerramento do processo, descarte da aba ou falta de energia. Os builds herdam os arquivos públicos das publicações anteriores para que abas abertas continuem carregando seus módulos; a confirmação no domínio canônico fica pendente até a próxima publicação, conforme [Implantação e operação](implantacao-convex-vercel.md#continuidade-dos-arquivos-entre-publicações).

## Estado do editor e concorrência

1. O snapshot **confirmado** possui versão aceita pelo backend e revisão institucional incorporada.
2. O calendário **aplicado** contém as ações Aplicar/Adicionar da sessão e pode aguardar gravação.
3. O **preenchimento** pertence ao formulário e só altera o calendário quando aplicado.

Renderização apenas deriva apresentação. Autosave agrupa alterações próximas e mantém uma gravação pendente por sessão, com snapshot imutável por envio. A confirmação atualiza a versão esperada sem apagar alterações aplicadas durante o envio. "Salvo" depende de confirmação efetiva; validação local e conexão não comprovam gravação.

Uma atualização reativa pode renovar uma sessão limpa; com alterações locais, a sessão preserva os dados e sinaliza a resolução necessária. Falha recuperável admite nova tentativa; conflito ou sessão expirada bloqueia gravações até resolução. Trocar de calendário encerra a sessão, e resultados tardios não alteram outra entidade.

Exportações que exigem persistência aguardam as alterações aplicadas relevantes e usam a versão confirmada. A cópia local representa o estado aplicado, sem campos ainda não aplicados. Não há persistência offline nem promessa de salvar ao fechar o navegador.

## Persistência e autorização

O estado editável fica separado dos metadados do calendário; versões, snapshots e revisões são registros próprios e imutáveis. Documentos e catálogo usam revisão por ano. Datas operacionais são timestamps; datas acadêmicas são civis. O histórico de versões continua disponível após a retirada das tabelas de extração de calendários anteriores.

Convex Auth é a biblioteca `@convex-dev/auth`, configurada pela aplicação para autenticar no próprio backend; não é um serviço externo nem é ativada automaticamente ao criar o banco. O login Google está intencionalmente desabilitado até segundo aviso e só deve ser reativado mediante instrução explícita, conforme [Acesso e contas](recuperacao-de-senha.md#google-institucional).

O backend deriva identidade, papel e campus da sessão. CAMPUS só atua na unidade autorizada; ADMIN gerencia o sistema; PARECERISTA revisa sem editar calendários. Guards organizam as telas, mas cada função Convex autoriza a operação.

Salvar confere versão e base e preserva atributos protegidos; uma gravação sem mudança não cria versão artificial. A revisão humana tem salvamento explícito e depende da versão do calendário, da base e da revisão do parecer. Atualização institucional exige incorporação explícita.

## Arquivos, impressão e manutenção

PDFs ficam no Storage. Um link abre uma nova aba da aplicação, que verifica a sessão e a publicação do documento, emite acesso temporário e encaminha ao original com `Content-Disposition: inline`. A leitura, impressão e cópia ficam a cargo do navegador; o portal não inclui leitor nem worker PDF. Uploads têm proprietário, limite de 8 MB, assinatura PDF, SHA-256 e consumo único. Restauração exige o original exato e preserva ID, análises e vínculos. Tickets e temporários têm limpeza agendada.

O PDF é a impressão da prévia pelo navegador, com `@page` A4 definido em `assets/printing/calendar.css`; não há gerador no servidor. O título da página sugere o nome do arquivo. Produção não carrega Devtools nem a depuração de formulários sensíveis.

A admissão de actions e a pausa de manutenção são transacionais; mutations de domínio e criação de sessões verificam a manutenção. A presença mantém o ciclo próprio do componente, sem alterar o domínio acadêmico. Actions registram o lease no log e o removem em `finally`; um lease sem conclusão permanece visível e bloqueia publicação, pois idade não prova término. A recuperação está em [Implantação e operação](implantacao-convex-vercel.md), e a validação em [Verificação](verificacao.md).

## Conteúdo v4 e política de 2027

Novos conteúdos e cópias usam `schemaVersion: 4`. Cada oferta tem `id` imutável, `kind` para aplicabilidade normativa, rótulo, modo e organização. É possível repetir um tipo com rótulos distintos. Eventos e associações de períodos usam IDs de ofertas; o catálogo institucional continua selecionado por tipo e é materializado para todas as ofertas daquele tipo. `offerKinds` no registro é um resumo dos tipos distintos e ordenados; organização geral e ingresso geral são derivados, não persistidos.

A organização é anual, semestral ou a classificar. Etapas são configuradas por ciclo: duas, três ou quatro no ano letivo, ou uma ou duas por semestre. Os vínculos `stage-1..4:offerId` conservam o ordinal global; a apresentação reinicia a numeração em cada semestre. Períodos são disjuntos por oferta e podem coincidir entre ofertas. Escopo e ingresso pertencem a cada oferta/ciclo. Modo e base da organização são informativos e não alteram obrigações ou mínimos.

O armazenamento aceita somente o formato 4, inclusive em snapshots históricos e na lixeira, e importações de cópias de outro formato são recusadas. Os valores antigos que continuam válidos nesse formato estão em [Operações administrativas de dados](migracao-schema.md#formatos-antigos-que-permanecem-nos-dados).

Conversões ambíguas preservam IDs e datas e mantêm a configuração pendente. Uma inconsistência migrada de ciclo gera aviso e permite salvar outra parte; uma etapa nova ou alterada precisa caber inteiramente no período do seu ciclo. A preparação preserva identidade e tipo de ofertas já salvas, cuja remoção permanece proibida.

Execução e finalidade de ingresso são dados separados. A posição temporal é derivada das datas e validada pelo domínio. Referências anteriores são informativas e não satisfazem horas, etapas, férias ou dias atuais; editais anteriores exigem execução comprovada, e previsões podem integrar o planejamento sem comprovar publicação.

O conjunto de regras apresentado é gravado com o conteúdo. O servidor resolve a política vigente pelo ano e escopo e recusa identidades omitidas ou divergentes. Trabalho estruturalmente válido pode ser salvo com pendências normativas, mas concluir depende da cobertura e da revisão adequadas.

A confirmação do escopo é humana e individual por oferta, sem alterar seu tipo. A extensão de prazos de referência pelo art. 3º, § 2º, exige causa municipal explícita e fonte. Um ajuste de cronograma declarado não representa autorização da Proens: cobertura objetiva e conferência humana atual são verificações separadas.

O upload e a extração de PDFs de calendários anteriores foram retirados; referências digitadas pelo usuário continuam possíveis, com datas reais e fontes textuais. Os PDFs anteriores e suas análises foram excluídos em 27/10/2026.

A atualização da fonte institucional de 2027 foi apenas ensaiada: a prévia pura e idempotente propõe trocar a fonte antiga quando conteúdo, escopo e datas coincidem com a base inicial, e diferenças locais aparecem como conflitos. Nenhuma instalação é atualizada na inicialização; uma operação futura deve apresentar a prévia, usar controle de concorrência e incorporar o impacto explicitamente.

### Fonte e limites das regras

A referência para 2027 é a Resolução CONSUP/IFPR nº 292, de 5 de outubro de 2026, documento SEI 4422750, processo 23411.011715/2026-07. O arquivo fornecido na investigação tinha cinco páginas e SHA-256 `594fee1beb5f0cc5f09479dfd6f1ed3c55a9f84dde6c72370641873aa052c554`; ele não é dependência do build. A política executável está em `src/domain/policies/`. A fonte fundamenta requisitos, sem atribuir autorização institucional à aplicação.

Cobertura é calculada por atividade, oferta e ciclo. Matrícula de ingressantes, rematrícula de veteranos e ajuste são atividades distintas. As exigências dos incisos V e VII do art. 11 têm recorte de subsequente e graduação e não são herdadas pelo integrado num calendário combinado; o inciso VIII não tem esse recorte. A periodicidade de editais acompanha a organização da oferta, mas obrigações docentes semestrais, como Plano de Ensino, PIT e RIT, permanecem em ofertas anuais. A falta de configuração de ingresso não significa ausência de ingressantes: não gera exigência automática sem regra local e fonte, mas preserva exigências já declaradas.

Ano do calendário, data real da publicação, destino do ingresso e prazo normativo são dados independentes. Previsão pode completar o planejamento após conferência, sem comprovar execução, e a passagem do tempo não muda seu estado. Intervalos informativos podem atravessar a virada do ano, mas registros com efeito letivo respeitam ano, períodos e oferta.

A primeira e a segunda semana das atividades mantêm conferência humana, pois a fonte não define o intervalo operacional. Ajuste de cronograma de processo seletivo exige fonte da Proens. A extensão por feriado municipal ou recesso não se aplica genericamente aos prazos do art. 11. Pós-graduação, EaD e qualificação não recebem conformidade automática.

## Períodos, atividades e painéis

Períodos e avaliações são organizados juntos, por oferta, e aplicados num único comando. Uma oferta nova só entra no calendário com organização completa; a mutation grava conteúdo, ofertas e versão na mesma transação, preservando o escopo dos snapshots anteriores. Ciclos conflitantes exigem correção explícita, e legado ambíguo conserva IDs e datas até a classificação. Períodos de ofertas diferentes podem coincidir, mas não se sobrepõem dentro da mesma oferta. Quantidade de avaliações não representa quantidade de períodos.

A exigência local de matrícula é declarada no detalhe da atividade, com fonte e oferta/ciclo próprios. Cadastrar um evento não declara sozinho uma nova exigência normativa.

Consulta e edição de atividades têm identidades distintas: abrir uma atividade não escolhe silenciosamente seu primeiro registro, filtros não alteram valores preenchidos e padrões só inicializam criação. Fechar o painel conserva o rascunho, descartar afeta somente o preenchimento e remover atua no registro aplicado. O fechamento devolve o foco à origem; sessão expirada fecha o painel sem apagar o rascunho. A referência dos componentes está em [Componentes da interface](componentes-interface.md).

Na grade de sábados, o estado aplicado vem dos comandos e a seleção pertence ao formulário. Cada lote usa uma atividade e fonte, e metas não são completadas automaticamente. Sábados fora dos períodos ou impedidos não são selecionáveis.

## Compatibilidade da base institucional

A revisão numérica da base é um marcador técnico; a equivalência considera o conteúdo aplicável ao calendário: eventos, fontes, aplicabilidade e arquivos documentais. Ordem dos registros, ofertas externas e metadados operacionais não exigem decisão do usuário.

Uma base equivalente não apresenta card: a sincronização atualiza somente a referência técnica, sem recalcular datas, alterar autoria ou criar versão, e não é pré-requisito para salvar ou imprimir. Alterações reais exigem confirmação vinculada à identidade do conteúdo exibido, verificada novamente na transação. Mudanças em eventos recalculam o calendário; mudanças apenas documentais preservam as datas. Ambas geram versão editorial.

Revisões humanas guardam a identidade da base. Uma mudança irrelevante no contador não invalida a análise; mudanças no conteúdo aplicável ou na versão editorial invalidam. Revisões antigas sem essa identidade continuam exigindo a revisão técnica original, pois não há evidência para declarar equivalência retroativa. A sincronização nunca reescreve uma revisão humana.

Quando a política vincula base e revisão ao conjunto de regras, como em 2027, a identidade da base inclui esse conjunto. Anos sem essa vinculação mantêm a identidade anterior e não recebem falsa mudança global. Snapshots permanecem imutáveis.

### Mudanças de regra

Cada política vinculada mantém em `rulesetChanges` o histórico ordenado das versões do conjunto de regras. A última entrada é a versão vigente, gravada no conteúdo, na revisão e na impressão. Cada entrada registra data, fonte (norma, comunicação da Proens ou decisão), resumo, critérios do parecer afetados e efeito:

- `establishes`: primeira versão da política.
- `tightens`: cria, amplia ou antecipa uma exigência. Uma mudança que aperta e afrouxa ao mesmo tempo é `tightens`.
- `relaxes`: dispensa ou restringe uma exigência.
- `editorial`: muda redação sem alterar exigências.

A base e a revisão se vinculam à última versão `establishes` ou `tightens` até a versão em que foram feitas. Somente uma nova versão desses dois tipos exige incorporação e nova revisão; o rascunho de parecer de outro vínculo perde as confirmações antigas, e o card de atualização lista as versões adotadas com fonte e resumo. Versões `relaxes` e `editorial` mantêm a identidade da base e as revisões atuais, pois a conferência feita continua válida. O servidor aceita conteúdo e revisão de uma versão equivalente e grava a versão vigente.

Quando uma regra restringe ou amplia o que o inciso diz, `decision` registra a decisão e a versão que a adotou, e o detalhe da atividade a mostra ao lado da base normativa. Em 2027, `consup-292-2027-v2` restringiu ao técnico integrado a reunião com familiares, responsáveis e comunidade (Art. 11, XVI).

## Controles de segurança

A autorização compara a geração da sessão com a do usuário, inclusive ao emitir e renovar JWT. A revogação é imediata; exclusões físicas são limitadas por lote. Ações de acesso sensíveis exigem ADMIN e login nos últimos 15 minutos. Convites e resets válidos consomem quota persistente antes do hash; tentativas inválidas não abrem leases.

Uploads administrativos são validados e gravados de forma atômica numa mutation; o cliente não associa IDs de Storage. Sessões e credenciais expiradas têm limpeza limitada, interrompida durante manutenção. O [guia de segurança operacional](seguranca.md) detalha dependências, patches versionados e requisitos da futura publicação.
