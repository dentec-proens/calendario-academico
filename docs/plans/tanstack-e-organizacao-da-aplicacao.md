# Plano de adoção TanStack e organização da aplicação

## Objetivo e decisões

Entregar uma aplicação React com entrada única, navegação tipada com TanStack Router, todos os fluxos de preenchimento e edição em TanStack Form, Devtools de desenvolvimento e orientação oficial das bibliotecas para agentes. A entrega abrange interface, domínio, integração Convex, autenticação, arquivos, impressão, build, servidores, testes e documentação.

A proposta é recomendada porque organiza responsabilidades que precisam evoluir juntas: navegação, ciclo de vida dos formulários e sincronização dos dados. A divisão de `web/app.ts` faz parte dessa organização; distribuir suas funções entre arquivos sem mudar a propriedade do estado e dos efeitos não atende ao objetivo.

Decisões do plano:

- Uma SPA, com um `index.html`, uma raiz React e uma árvore de rotas definidas em código. Portal, editor, revisão, logs, acesso, ativação e recuperação pertencem à mesma aplicação.
- Corte completo na entrega: remover entradas, implementações, exports e testes substituídos. Não manter fachadas de compatibilidade, dois editores, modos alternativos ou flags permanentes de migração.
- Preservar os endereços funcionais do produto, seus dados, identidades, permissões e regras acadêmicas. A reorganização não exige conversão de schema, recriação de usuários ou transferência de arquivos.
- Convex permanece responsável por autenticação, consultas reativas, transações, autorização, arquivos e processamento. Router controla navegação; Form controla preenchimento e submissão.
- Renderização não modifica o calendário, recalcula valores com efeitos colaterais nem inicia salvamento. Comandos explícitos aplicam alterações; seletores puros produzem a apresentação.
- Módulos são separados por responsabilidades e interfaces pequenas. Não estabelecer um limite artificial de linhas nem substituir `app.ts` por um hook ou controlador igualmente abrangente.
- Manter Node, pnpm, PowerShell e Docker Desktop como caminhos suportados. A validação Windows é parte da conclusão.

TanStack Query, Table, Store, DB, Pacer e Start não são necessários para esta entrega. Também não é necessário um novo MCP para documentação. A orientação para agentes usa Intent e documentação oficial; a consulta pela CLI TanStack é complementar.

## Organização dos arquivos

Estrutura de referência para a implementação. Cada diretório contém apenas módulos com responsabilidades efetivas; não criar arquivos vazios, reexports agregadores ou um `data.ts` em toda feature por convenção.

```text
web/
  index.html
  main.tsx
  app/
    router.tsx
    routes/
      root.tsx
      public.tsx
      workspace.tsx
      calendar-editor.tsx
    providers.tsx
    session.tsx
    layouts/
      PublicLayout.tsx
      WorkspaceLayout.tsx
    errors.tsx
    devtools.tsx
  features/
    access/
    accounts/
    campuses/
    calendars/
    documents/
    catalogue/
    reviews/
    presence/
    audit/
    calendar-editor/
      CalendarEditorLayout.tsx
      session/
        CalendarEditorProvider.tsx
        reducer.ts
        selectors.ts
        useCalendarSync.ts
        useEditorNavigationGuard.ts
      sections/
        IdentitySection.tsx
        PeriodsSection.tsx
        DaysSection.tsx
        EventsSection.tsx
        HistorySection.tsx
        IssuesSection.tsx
        CalendarPreviewSection.tsx
      forms/
        WeekForm.tsx
        PeriodForm.tsx
        EventForm.tsx
        SaturdaysForm.tsx
        VacationsForm.tsx
        AssessmentSettingsForm.tsx
        TeacherDayForm.tsx
        IntakeForm.tsx
        ImportCalendarForm.tsx
      events/
        event-draft.ts
        EventEditor.tsx
        ActivityChecklist.tsx
        StageSuggestions.tsx
      history/
        HistoryUploadForm.tsx
        RestoreHistoryForm.tsx
        HistoryCandidates.tsx
        useHistoryAnalysis.ts
      export/
        useCalendarExport.ts
      calendar-editor.css
  shared/
    forms/
      useAppForm.ts
      fields.tsx
      FormFeedback.tsx
      drafts.ts
    ui/
    convex/
      client.ts
      errors.ts
    files/
    navigation/
    integrations/
      webmcp.ts
    styles/
      tokens.css
      global.css
      layout.css
src/
  calendar-edits/
    periods.ts
    events.ts
    teaching-days.ts
    assessment.ts
    import.ts
  printing/
    calendar-layout.ts
    teaching-day-breakdown.ts
    types.ts
    assets.generated.mjs
    assets.generated.d.mts
  calendar.ts
  evaluation.ts
  ...módulos puros de regras acadêmicas e revisão
assets/
  printing/
    calendar.css
    ifpr-logo.png
convex/
  workspace.ts
  campuses.ts
  calendars/
  catalogue/
  documents/
  reviews/
  access/
  actions/
  lib/
  nativeFiles.ts
  schema.ts
  auth.ts
  ...configuração, presença e auditoria
```

Os nomes das features expressam o assunto; arquivos de página compõem apresentação, formulários e operações. Cálculos compartilhados permanecem em `src/`, sem importações de React, DOM ou Convex. Módulos puros pequenos que já tenham uma responsabilidade clara não precisam ser movidos apenas para uniformizar a árvore.

Dependências permitidas: rotas compõem features; features usam infraestrutura compartilhada e domínio; infraestrutura de navegador não entra em `src/printing`; domínio não importa features; actions Node não entram nos bundles do navegador. Módulos específicos de uma feature não são importados por outra para acessar seus detalhes internos.

## 1. Orientação das bibliotecas para agentes

1. Adicionar `@tanstack/intent` em `devDependencies`, com versão exata e lockfile. Selecionar versões de Form e Devtools compatíveis com o React e o Router do projeto e fixá-las também.
2. Configurar uma allowlist explícita das skills dos pacotes utilizados, incluindo o núcleo do Router quando necessário. Descobrir as identidades reais com a instalação local; não copiar nomes de exemplos nem apontar para caminhos internos do armazenamento pnpm.
3. Acrescentar ao `AGENTS.md` a consulta às skills pertinentes antes de alterar código TanStack e as decisões arquiteturais deste projeto. A orientação precisa funcionar para a equipe, sem depender de instalação global ou de um chat específico.
4. Usar a CLI local, por exemplo `pnpm exec intent list` e `pnpm exec intent load <identidade>`. Atualizações das bibliotecas incluem a revisão das orientações distribuídas e dos mapeamentos aplicáveis.
5. Acrescentar verificação de descoberta e carregamento das skills no CI Linux e Windows. A checagem deve funcionar após a instalação com lockfile e não depender de baixar uma versão `latest` em cada execução.
6. Manter comandos e explicações de instalação no README. Hooks de um editor específico não são requisito para usar ou desenvolver a aplicação.

Aceite: as skills de Router e Form são descobertas e carregadas nas versões instaladas; instruções locais explicam a propriedade de rotas, formulários e persistência. Intent é uma ferramenta de orientação, não uma garantia de que o agente aplicou suas instruções.

## 2. Entrada única e Router tipado

### Árvore e contratos de navegação

- Declarar rotas com referências e caminhos literais, registrar o tipo inferido do Router e usar `Outlet` nos layouts. Não construir toda a árvore com um `.map()` de strings que apague os tipos de cada rota.
- Separar layouts público e autenticado. A rota pai de `/calendarios/$calendarId` mantém a sessão do editor acima de `editar`, `periodos`, `dias`, `eventos`, `historico`, `pendencias` e `visualizar`.
- Manter as telas de listas, criação, edição de evento institucional e revisão individual com endereços próprios. A rota ativa determina a tela e a entidade; não duplicar essa informação em estados paralelos de seleção.
- Substituir comparação manual de pathname, painéis ocultos permanentemente montados e strings arbitrárias de navegação por parâmetros e links tipados. URLs externas, arquivos e retorno OAuth possuem tratamento próprio.
- Validar campus, ano, situação, busca e outros parâmetros de navegação. Definir valores padrão e comportamento para parâmetros inválidos, repetidos, entidades inexistentes e acesso negado. Validar IDs no backend; um cast TypeScript não valida um parâmetro de URL.
- Preservar tipos literais no frontend e um contrato puro dos caminhos de produto para Vite, preview e Vercel. Testar a equivalência entre esse contrato e a árvore React, sem fazer o servidor importar React.
- Carregar editor, revisão e processamento de PDF no navegador somente quando necessários. Usar divisão de código por rota sem adicionar uma segunda camada de cache de dados.

### Sessão, permissões e navegação

- Distinguir sessão em carregamento, usuário não autenticado e acesso negado. A mudança de identidade ou permissões invalida o contexto do Router e limpa estado que não pode continuar acessível.
- Ler identidade e metadados comuns na raiz autenticada; montar subscriptions paginadas somente nas features que as utilizam. Não manter consultas de documentos, lixeira e revisão ativas em qualquer tela.
- Continuar autorizando cada operação no Convex. Guards e controles visuais apenas organizam o acesso às telas.
- Preservar retorno interno seguro após login local e Google, rejeitando retornos externos ou malformados. Manter o fluxo de primeiro ADMIN, ativação e recuperação.
- Navegar entre seções do mesmo calendário sem recriar sua sessão. Ao sair dela ou trocar de calendário, resolver explicitamente alterações aplicadas e gravações em trânsito. O fechamento/recarregamento usa também `beforeunload`, sem depender de uma gravação assíncrona durante o encerramento.
- Tratar foco, títulos, anúncio de mudança de página, scroll e restauração pelo histórico de forma central e acessível. Preservar Ctrl/Cmd+clique, clique intermediário e abertura em nova aba.

### Build e servidores

- Vite gera um `index.html` e chunks; remover entradas HTML adicionais, imports de scripts DOM e decisões de navegação entre documentos.
- Servir `index.html` apenas nos caminhos de produto conhecidos, nos servidores de desenvolvimento, preview e Vercel. URLs desconhecidas, assets inexistentes, `/api/*`, caminhos malformados e métodos não suportados mantêm resposta apropriada de erro; não adotar fallback universal para HTML.
- Conferir trailing slash, codificação de IDs, query, hash, `GET` e `HEAD`, CSP, headers de segurança, manifesto de build e cache dos assets.
- Atualizar juntos `vite.config.ts`, `src/app-routes.ts`, `src/app-server.ts`, `vercel.json`, servidor de fixtures e testes que enumeram entradas ou caminhos. Não disponibilizar aliases para os HTMLs removidos.

Aceite: todos os endereços funcionam por acesso direto, recarga e histórico; uma única raiz controla as telas; a navegação interna não usa `reloadDocument` para alternar entre áreas ou calendários.

## 3. Padrão de TanStack Form e inventário completo

Criar a composição tipada de Form integrada aos campos Base UI existentes. Compartilhar apenas comportamento repetido: associação de label/descrição/erro, conversão de valores, submissão, feedback e foco. Evitar um gerador genérico de formulários ou exigir uma biblioteca adicional de schemas quando os validadores existentes forem suficientes.

| Área                    | Fluxos incluídos                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Acesso                  | Login, primeiro ADMIN, ativação, pedido de recuperação e redefinição de senha.                                                                                    |
| Contas                  | Criação por convite, Google e credencial local; alteração de papel e campus.                                                                                      |
| Campi                   | Cadastro e demais campos editáveis existentes no fluxo de gestão.                                                                                                 |
| Calendários             | Criação de teste/definitivo, campus, ano, modalidades, regime, cursos, turmas e turnos.                                                                           |
| Documentos              | Upload de documento/versão, metadados, conferência e publicação/vigência, arquivamento e restauração de original.                                                 |
| Base institucional      | Criação/edição de evento, nome, datas, modalidades, categoria, referência e situação ativa.                                                                       |
| Revisão humana          | Processo, norma, critérios por ID, situação, notas, confirmação, conclusão e confirmação de reavaliação.                                                          |
| Identificação do editor | Todos os campos editáveis de identificação e configuração do calendário.                                                                                          |
| Dias e períodos         | Semana letiva, evidência e confirmação; períodos, intervalos, metas e edição/cancelamento; seleção e inclusão de sábados.                                         |
| Eventos e configuração  | Evento, modalidades e vínculos; férias docentes; etapas por modalidade; Dia do Professor; segundo ingresso semestral; categoria e atividade nos controles inline. |
| PDFs de anos anteriores | Upload, metadados, restauração de original, seleção de candidatos e preenchimento do evento associado.                                                            |
| Importação              | Seleção de JSON, validação do conteúdo e confirmação da aplicação ao calendário.                                                                                  |

O inventário inclui os controles criados dinamicamente e os que editam dados sem uma tag `<form>`. Campos somente leitura e botões de ação sem preenchimento não precisam de uma instância Form. Filtros imediatos de navegação pertencem à URL; se houver um formulário de filtros com botão Aplicar, Form controla o preenchimento e o submit atualiza o Router, sem duplicar o filtro efetivo.

Regras comuns:

- Valores de domínio, valores de apresentação e conversões são explícitos. Datas acadêmicas permanecem `YYYY-MM-DD`, sem conversão acidental de fuso.
- Validação de campo ou cruzada usa regras de domínio compartilhadas quando aplicável. O Convex repete a validação e autorização necessárias à consistência dos dados.
- Distinguir submissão em curso, sucesso e erro. Falha de mutation/action precisa chegar ao formulário; callbacks que capturam e escondem a exceção não podem produzir reset ou estado de sucesso.
- Bloquear submissões duplicadas; considerar Enter, botões externos associados ao formulário e a intenção de cada submit, inclusive criação de teste/definitivo.
- Exibir erros junto ao campo e ao formulário; manter `aria-invalid`, descrições, resumo quando necessário e foco no primeiro erro. Definir uma política consistente para validação nativa e Form, sem duas mensagens concorrentes.
- Arrays de critérios, eventos e candidatos usam IDs estáveis, inclusive após reordenação e atualização remota. Campos condicionais removidos não enviam valores ocultos indevidos.
- Inicializar com dados assíncronos por identidade e versão. Uma nova resposta de consulta não pode executar reset indiscriminado de formulário modificado.
- Assinar apenas o estado necessário de cada campo e área. Digitação não deve recalcular todo o calendário nem renderizar novamente a prévia de impressão; contagens e sugestões observam as dependências pertinentes.
- Arquivos usam `File` efêmero, com seleção e limpeza explícitas. Não tentar restaurar `input.value`, serializar bytes em rascunhos ou repetir o upload automaticamente após resultado incerto. A retomada consulta o estado da operação e evita consumo duplicado.
- Senhas, códigos de instalação, tokens e links privados não entram em registro de rascunhos, logs ou Devtools. Limpar credenciais ao sair do fluxo e após conclusão.

### Rascunhos e operações em andamento

Form é o proprietário dos valores ativos. Um registro tipado em memória conserva os valores necessários para remontar formulários não sensíveis ao navegar, identificado por usuário, tipo de formulário e entidade/contexto. Ele não constitui uma segunda fonte editável de valores.

Fechar ou voltar à lista conserva o rascunho quando essa for a ação apresentada; cancelar/descartar explicitamente limpa o rascunho; sucesso limpa somente o formulário e a identidade concluídos. Logout e troca de identidade limpam o registro. Navegação não deve depender de manter todas as páginas montadas.

Uma operação iniciada na entidade A não pode resetar, navegar ou mostrar um resultado privado na entidade B quando termina. Associar resultado à identidade da operação e manter o estado de submissão enquanto houver trabalho real em trânsito. Definir o tratamento de permissão revogada e entidade removida.

Arquivos selecionados ficam apenas no escopo vivo do fluxo; ao desmontá-lo, descartar a seleção e informar que é necessário selecioná-la novamente. Não prometer retomada automática de arquivo nem persistência durável offline.

Aceite: todos os fluxos do inventário usam Form para preenchimento, validação e submissão; não restam estados locais concorrentes nem leitura do DOM como fonte dos valores.

## 4. Editor organizado por sessão, comandos e seções

### Propriedade do estado

| Estado        | Proprietário             | Significado                                                                     |
| ------------- | ------------------------ | ------------------------------------------------------------------------------- |
| Confirmado    | Sincronização com Convex | Snapshot aceito, versão do calendário e revisão institucional incorporada.      |
| Aplicado      | Sessão do editor         | Calendário resultante das ações Aplicar/Adicionar; pode aguardar gravação.      |
| Preenchimento | TanStack Form            | Valores ainda não aplicados, validação e contexto do formulário.                |
| Apresentação  | Seção/rota               | Expansões, seleção visual, foco e demais decisões que não alteram o calendário. |

`CalendarEditorProvider` coordena a sessão de um calendário. Sua interface oferece comandos de negócio, seletores e estados de execução, sem setters irrestritos ou referências DOM. O reducer trata transições explícitas; não recebe callbacks que mutam o estado por fora.

### Comandos de calendário

Extrair para `src/calendar-edits/` as operações de aplicar semana, incluir/editar período, aplicar evento, incluir sábados, aplicar férias, configurar/recalcular etapas, alterar Dia do Professor e ingresso semestral e importar calendário.

Cada comando recebe snapshot e entrada tipada e devolve próximo snapshot ou erro estruturado. Aplicação, validação e recálculos necessários são atômicos: falha não deixa alteração parcial. Usar as regras acadêmicas existentes, injetando geração de IDs e outras dependências apenas onde necessárias. O backend reutiliza a lógica pura aplicável e mantém suas verificações próprias de autorização, versão e persistência.

Os resultados de contagem, pendências, sugestões e prévias são derivados sem efeitos. Carregar um registro ou renderizar uma seção não recalcula e persiste datas automaticamente.

### Sincronização e autosave

- Aproveitar a interface e os testes de `createAutosaver`, acrescentando o ciclo de vida necessário ao editor React. Não introduzir Pacer para reimplementar esse comportamento.
- Manter debounce para alterações aplicadas, snapshot imutável por envio e uma gravação pendente por sessão. Uma confirmação atualiza a versão esperada e não apaga edições aplicadas durante a gravação.
- `saved` representa confirmação efetiva do backend. Validade de formulário, resposta otimista ou conexão restabelecida não confirmam persistência.
- Falhas recuperáveis preservam alterações e permitem nova tentativa. Conflito e sessão expirada bloqueiam novas gravações até resolução explícita. Permissão de leitura impede comandos e envio de mutações.
- Atualizações reativas podem renovar uma sessão limpa. Com alteração local, preenchimento não aplicado ou gravação em trânsito, conservar a base e a atualização remota necessária para sinalizar e resolver conflito. Não incorporar nova base institucional silenciosamente.
- Encerramento cancela timers e subscriptions e ignora callbacks de sessões substituídas. Uma mutation já enviada não é considerada cancelada: sua conclusão precisa ser resolvida antes de encerrar uma transição que depende dela.
- Oferecer `flush` com semântica de aguardar todas as alterações aplicadas relevantes, inclusive as que chegaram durante um envio. Retornar o snapshot/versão confirmado usado pela operação seguinte.

### Eventos, atividades e candidatos de PDF

Substituir a movimentação física de um formulário entre listas por composição React e contexto explícito: novo evento, edição por `eventId`, atividade por `requirementId` ou candidato por `historyId` e chave estável. Índice de posição não identifica um candidato.

O proprietário do formulário permanece estável enquanto ele aparece em diferentes apresentações. Fechar conserva; retomar restaura; descartar limpa; trocar de contexto resolve o preenchimento pendente; aplicar emite um comando. Manter origem, página, candidato e prevenção de duplicidade dos eventos provenientes de PDF.

Upload, restauração, análise, consulta do original e inclusão de candidato possuem estados independentes. Uma falha de análise não limpa um rascunho de evento nem reinicia uploads concluídos.

### Exportação e integrações

Separar download JSON, importação, impressão, PDF e conversão para calendário definitivo. Operações que dependem de dados salvos aguardam `flush` e usam exatamente a versão confirmada. Download de cópia local representa o estado aplicado e não inclui preenchimento pendente; a interface deixa isso claro.

Mover a integração `read_calendar_summary` para módulo próprio, com registro e cleanup associados à sessão, leitura do estado correto e contrato somente leitura. Não conceder aprovação institucional ou permitir alteração por essa integração.

Aceite: `web/app.ts`, `editor-dom.ts`, listeners globais de formulários e geração de HTML interativo são removidos. Formulários, comandos, apresentação e sincronização possuem proprietários distintos e testáveis; nenhum módulo substituto concentra todas essas funções.

## 5. Demais módulos que justificam reorganização

| Módulo/assunto   | Organização proposta                                                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Revisão humana   | Página e seleção por rota, formulário, critérios, conclusão, controlador de reconciliação e exportação/prévia separados. Preservar conclusão editada, rascunhos por calendário e vínculo com versões. |
| Contas           | Lista, criação, alteração de papel/campus e apresentação efêmera de convite/recuperação. Credenciais e links privados não entram no cache de formulários.                                             |
| Documentos       | Lista/filtros, envio de versão, restauração e ações de conferência/vigência, com estado de operação por registro.                                                                                     |
| Calendários      | Lista e filtros, criação, lixeira e restauração. Paginação e subscription pertencem à página que as utiliza.                                                                                          |
| Catálogo         | Lista e formulário de evento por identidade; edição não atualiza estado durante renderização.                                                                                                         |
| Layout do portal | Composição, menu, notificações e `Outlet`; dados e formulários de cada assunto pertencem à feature.                                                                                                   |
| Cliente Convex   | Instância e erros compartilhados; hooks e operações tipados por feature. Remover fachada abrangente e ponte global `setAuthActions`; usar o contexto de autenticação.                                 |
| CSS              | Tokens e primitivas, layout e estilos por feature, com escopo claro. Impressão possui recursos independentes. Remover seletores sem consumidores e evitar colisões entre formulários.                 |

A revisão humana mantém salvamento explícito, confirmação de cada critério quando exigida, reavaliação de análise desatualizada e exportação baseada na revisão salva. A seleção de calendário e os critérios usam identidades estáveis, sem associar dados pela posição em arrays.

Módulos como confirmação, paginação, upload e regras puras pequenas são mantidos ou movidos conforme seu papel. Só introduzir abstração quando ela esconder comportamento que seria repetido nos consumidores.

## 6. Convex e contratos de ponta a ponta

Organizar `convex/native.ts`, `nativeAuth.ts` e funções específicas de `repository.ts` por domínio:

- `workspace.ts`: identidade e metadados comuns necessários à aplicação.
- `campuses.ts`: operações de campi.
- `calendars/`: consultas, gravação, versões, lixeira, conversão e contextos internos de exportação.
- `catalogue/`, `documents/` e `reviews/`: operações e helpers de cada assunto.
- `access/`: sessão/identidade, membros, convites, recuperação e preparação do primeiro ADMIN. `auth.ts` importa apenas os helpers de identidade necessários.
- `actions/`: PDF e extração/análise, mantendo arquivos com `"use node"` separados das queries/mutations.
- `lib/`: apenas autorização e tratamento de erros realmente compartilhados. Evitar um novo repositório genérico para todas as entidades.

Separar queries, mutations, contratos e helpers internos apenas onde o volume e a responsabilidade justificarem. Toda função pública tem validação de argumentos/retorno e autorização. Tipos do cliente derivam dos contratos e referências gerados; eliminar casts de passagem sem criar DTOs paralelos.

Preservar nas transações: versão esperada, revisão da base, imutabilidade dos atributos protegidos do calendário, validação de origem dos eventos, arquivamento de snapshots e ausência de versão artificial em gravação sem mudança. Parecer continua vinculado à versão de calendário/base e à revisão salva.

`nativeFiles.ts` permanece o módulo canônico de arquivos enquanto sua responsabilidade for coesa. Seus endpoints agendados de expiração e limpeza têm identidade persistida e não devem ser renomeados por estética. Helpers podem ser extraídos sem duplicar endpoints. Se outra divisão exigir alterar uma identidade agendada, inventariar os jobs e drenar ou reagendar antes de remover a função; editar referências no código não altera jobs persistidos.

`convex/auth.ts`, seus exports do Convex Auth e as rotas de autenticação em `convex/http.ts` permanecem canônicos. A divisão de gestão de acesso preserva provedores, identidades, hashes, sessões e o consumo atômico dos tokens válidos de convite e recuperação; não exige reinicializar contas.

Uploads preservam proprietário, limites, assinatura PDF, SHA-256, consumo único e limpeza; restauração exige o original correto. Preservar `_id`, sessões, storage, índices, snapshots e revisões. O corte é de implementação e contratos de código, não de dados.

Atualizar conjuntamente referências `api` e `internal`, frontend, chamadas entre funções, autenticação, endpoints HTTP, scripts de preparação, módulos registrados em `convex-test`, fixtures e tipos gerados. Não manter reexports dos módulos substituídos. Regenerar os contratos pelo fluxo de codegen do desenvolvimento individual e conferir que nenhum comando aponta para produção.

Aceite: cada domínio autoriza e valida suas operações, consumidores usam referências corretas e a reorganização passa pelos testes de autorização, concorrência e arquivos sem conversão de banco.

## 7. Impressão e PDF compartilhados

Mover o modelo de impressão para `src/printing/` e seus recursos para `assets/printing/`. Separar layout, distribuição de dias e tipos; manter uma única implementação compartilhada por prévia, impressão e PDF. O template é puro e não depende de DOM, React, Router, Form ou providers.

O runtime Chromium permanece separado e exclusivo de Node. Atualizar o gerador de assets, declarações TypeScript, imports, scripts de build, actions e testes. Recursos gerados não são editados manualmente. Conferir também a cópia de arquivos do wrapper Docker.

Preservar identificação de teste/proposta/definitivo, versão e revisão institucional, contagens por modalidade, escape de conteúdo, A4, cores, concorrência e bloqueio de rede do renderizador. O navegador não recebe dependências Node, Chromium ou segredos de processamento.

Aceite: prévia e saída PDF consomem o mesmo modelo; testes do runtime executam o gerador real no Linux sobre o estado final do código.

## 8. Devtools e instrumentação

- Adicionar Devtools do Router e Form e o painel necessário à composição, usando as versões fixadas e as integrações suportadas por elas.
- Montar uma única instância da instrumentação de desenvolvimento. Carregar seus módulos por import dinâmico condicionado a `import.meta.env.DEV`; verificar que os chunks não entram no build de produção.
- Oferecer inspeção de rotas, parâmetros, validação e submissão dos formulários não sensíveis. Testar abertura, fechamento, teclado e ausência de obstrução no desktop e mobile.
- Não registrar senhas, tokens, códigos, arquivos ou links privados nos plugins. Validar o mecanismo real de exclusão por formulário na versão escolhida; ocultar o painel não comprova exclusão de eventos ou valores. Se necessário, deixar a inspeção Form desativada nos fluxos sensíveis, mantendo a migração desses formulários para TanStack Form.
- Capturar o token de ativação/recuperação e removê-lo do fragmento antes de construir Router e instrumentação. Mantê-lo apenas no fluxo temporário, descartando-o ao sair. Verificar que snapshots e eventos de depuração não conservam segredos após a mudança de rota.
- Testes funcionais e visuais comuns rodam com o painel fechado/desativado por configuração explícita de teste; uma suíte própria valida o painel. O artefato de produção é verificado separadamente.

Um painel próprio de autosave não é pré-requisito. A interface da sessão já deve permitir investigar versão confirmada, alterações aplicadas e gravação em trânsito sem expor os dados sensíveis dos formulários.

## 9. Sequência de implementação

As etapas são incrementos de trabalho, mas a entrega funcional é completa. Não publicar um estado misto como conclusão da migração.

| Etapa                       | Entrega                                                                                                            | Critério para avançar                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 1. Contratos e base         | Inventário de fluxos e regras; dependências fixadas; Intent e descoberta local; cenários críticos de referência.   | Instalação reproduzível, skills acessíveis e cobertura identificada sem sobrescrever o trabalho existente no repositório. |
| 2. Sessão e domínio         | Comandos puros, seletores, sincronização e contratos de rascunho; testes de concorrência.                          | Edição durante gravação, falhas e atualização remota exercitadas pela interface da sessão.                                |
| 3. Aplicação e Router       | Entrada única, providers, layouts, rotas tipadas, contratos de paths e servidores.                                 | Acesso direto, histórico, login/retorno, 404 e foco funcionando na aplicação integrada.                                   |
| 4. Padrão Form              | Piloto de campus e integração Base UI, erros, reset, rascunho e Devtools.                                          | Piloto aprovado pelas interações reais; padrão aplicável aos formulários condicionais e assíncronos.                      |
| 5. Portal e acesso          | Todos os formulários de gestão, autenticação e revisão, com módulos por feature.                                   | Inventário dessas áreas fechado, dados sensíveis isolados e regressões funcionais passando.                               |
| 6. Editor completo          | Todas as seções, formulários e controles inline em React; aplicação, autosave, histórico e exportações integrados. | Fluxo criar → preencher → aplicar → confirmar → revisar → exportar funcionando, inclusive falhas e duas sessões.          |
| 7. Backend e impressão      | Domínios Convex, referências/codegen, actions, recursos e modelo compartilhado de impressão.                       | Contratos finais usados por todos os consumidores; jobs persistidos tratados; PDF real validado.                          |
| 8. Corte e documentação     | Remoção de implementações substituídas, fixtures atualizadas, CSS organizado, docs operacionais no presente.       | Uma implementação por fluxo; nenhuma referência ativa a arquivos ou endpoints removidos.                                  |
| 9. Verificação e publicação | Suítes obrigatórias, Windows, E2E descartável e preparação de publicação coordenada.                               | Evidências completas no mesmo estado do código; limitações identificadas e sem testes omitidos tratados como aprovação.   |

A extração do domínio, dos contratos Convex e da impressão pode anteceder as telas que os consomem quando isso reduzir retrabalho. Atualizações de referências e codegen acompanham a mudança de cada domínio; não ficam acumuladas para uma correção final de tipos.

## 10. Validação funcional, técnica e operacional

### Matriz mínima de regressão

| Área                         | Cenários obrigatórios                                                                                                                                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router e servidores          | Todas as rotas por acesso direto e recarga; Voltar/Avançar; nova aba; paths/IDs/query inválidos; trailing slash; 404 de assets, HTMLs removidos e caminhos desconhecidos; `GET`/`HEAD`; equivalência Vite, preview e Vercel.                                   |
| Acesso                       | Sessão carregando, expirada e negada; primeiro ADMIN; login local/Google e retorno seguro; ativação e recuperação com token inválido, expirado e consumido; senhas divergentes; ausência de segredos em URL após bootstrap, logs, storage e Devtools.          |
| Formulários                  | Validação, conversão, condicional, arrays por ID, submit por Enter/botão associado, dupla submissão, erro de backend, cancelamento, reset correto e callback tardio de outra entidade.                                                                         |
| Rascunhos                    | Navegar e retornar; fechar/retomar; descartar; logout/troca de usuário; troca de entidade; resposta remota durante preenchimento; seleção de arquivo descartada com informação clara.                                                                          |
| Editor                       | Digitar não grava; Aplicar altera e agenda; editar durante gravação; confirmação atrasada; conflitos; sessão substituída; limpeza de timers/subscriptions; falha sem perda; `flush` aguarda alterações subsequentes; base institucional requer ação explícita. |
| Eventos e PDFs de referência | Troca de contexto novo/evento/atividade/candidato; proveniência, chave estável, ausência de duplicatas, retomar e cancelar; uploads/restauração/análise com falhas independentes.                                                                              |
| Revisão e permissões         | Critérios/confirmações, conclusão editada, análise desatualizada, troca de calendário, exportação da revisão salva; acesso somente leitura no editor; autorização direta no backend.                                                                           |
| Convex                       | Isolamento entre unidades e papéis, versões e no-op, transações e snapshots, vínculos, validação dos contratos, arquivos temporários e limpeza, chamadas internas e funções agendadas.                                                                         |
| Exportação                   | Snapshot/versão corretos, bloqueio enquanto gravação relevante não terminou, cópia local aplicada, PDF teste/proposta/definitivo, escape e rede bloqueada.                                                                                                     |
| Interface e build            | Desktop/mobile, teclado, foco, controles desobstruídos, feedback de erro/conexão, screenshots inspecionadas, chunks por rota e ausência de Devtools/Node no build do navegador de produção.                                                                    |

Fixtures montam o Router, os formulários e os módulos reais da aplicação. Substituir somente as interfaces necessárias de transporte/autenticação em cenários sintéticos; não manter cópias do editor nem protocolos de teste incompatíveis com o caminho real. Atualizar o registro de módulos do `convex-test` e o servidor de fixtures em conjunto com a árvore final.

Executar a menor suíte relevante durante cada mudança. Ao corrigir um defeito encontrado, acrescentar regressão pela interação real e demonstrar a falha antes da correção quando viável. Antes de concluir mudanças de código, executar `pnpm check` e `pnpm test:linux` no estado final. Este último já inclui runtime PDF; não repetir a mesma validação sem alteração ou falha que justifique.

Validar efetivamente instalação com lockfile, TypeScript, unitários e build no job Windows. Executar também a descoberta/carregamento Intent nessa plataforma. Navegador e PDF no Windows usam Docker Desktop com containers Linux e as referências Linux do README. Ausência de Docker, navegador, ambiente ou resultado do CI deve aparecer como pendência, nunca como aprovação.

Inspecionar imagens e diferenças antes de atualizar referências intencionais de macOS/Linux, e executar a comparação novamente sem atualização. Não ampliar tolerâncias nem modificar a interação apenas para aprovar screenshots.

### E2E integrado

Executar somente em um deployment explicitamente descartável, com `DENTEC_DISPOSABLE_E2E=1`, URL e credenciais exigidas pelo README. Preparar fixture própria para validar restauração. Produção, dados importados e ambientes compartilhados não recebem esses testes.

Cobrir login, criação de calendário, preenchimento/aplicação/salvamento, confirmação após recarga, duas sessões com atualização/conflito, revisão, geração/download de PDF, upload/análise/restauração e autorização. O percurso deve usar a SPA, funções Convex e arquivos reais, confirmando versão e conteúdo devolvidos pelo backend. Sem configuração descartável, esse aceite fica pendente.

### Publicação coordenada

Preparar a publicação de frontend e backend como uma mesma entrega de contratos. Adequar `scripts/deploy-production.ts` para executar um corte controlado, com etapas verificáveis:

1. Acionar um mecanismo operacional de manutenção no backend, por configuração de ambiente, para recusar novas operações de alteração e novas actions de trabalho. A tela informa a indisponibilidade temporária; abas já abertas também têm suas operações recusadas pelo backend. A proteção não pode depender apenas de esconder controles no frontend.
2. Aguardar e verificar a conclusão das mutations/actions já aceitas, incluindo senha, upload, análise e PDF, antes de remover endpoints ou referências `internal` que elas possam chamar. Se não for possível comprovar a drenagem, interromper a publicação. Conferir também as funções agendadas persistidas.
3. Publicar as funções e os contratos Convex e acionar a publicação do frontend. Aguardar a confirmação do deployment da Vercel correspondente ao commit conferido; o push por si só não confirma a disponibilidade do frontend.
4. Executar o smoke autorizado da entrega correspondente, liberar o acesso e exigir recarga das abas com código substituído. A liberação depende de confirmar os dois artefatos; clientes já carregados não passam a usar o novo bundle automaticamente.
5. Em falha, manter o bloqueio operacional, apresentar diagnóstico e permitir recuperação coordenada dos dois artefatos. Não reportar sucesso enquanto backend e frontend divergirem.

Testar a coordenação e as falhas desse procedimento em ambiente descartável, incluindo o acesso restrito necessário para o smoke durante manutenção. Não presumir um comando ou endpoint administrativo de drenagem sem verificar sua disponibilidade e o resultado real. A implementação precisa demonstrar esse controle operacional, não apenas documentar uma janela de indisponibilidade.

O procedimento identifica os destinos e o commit conferido. O smoke abrange login, rotas, consulta, salvamento e PDF após a publicação autorizada, sem executar a suíte destrutiva E2E em produção. A recuperação operacional usa frontend e backend da mesma revisão de código e não depende de aliases de compatibilidade. A configuração temporária de manutenção não converte os dados do produto.

## 11. Remoções e documentação da aplicação

Remover `web/app.ts`, o acesso DOM tipado específico do editor, os wrappers de domínio/importação que apenas encaminham ou fazem casts, os scripts DOM de acesso e logs, `mountNativePage`, a ponte global de autenticação, o cliente abrangente e os HTMLs substituídos. Remover os módulos Convex substituídos após atualizar todos os consumidores e tratar referências persistidas. Não remover arquivos pequenos que continuem sendo a implementação canônica de uma responsabilidade.

Eliminar listeners globais de formulários, movimentação imperativa de campos, `innerHTML` de interface interativa, importações sem consumidores, CSS sem uso e fixtures que reproduzam o caminho removido. HTML de impressão/exportação permanece em seu renderizador puro com escape de conteúdo.

Atualizar README e documentação de arquitetura, desenvolvimento, uso, interface, acesso e operação para descrever somente a aplicação entregue: árvore e responsabilidades, comandos, comportamento, limites e validação. Detalhes de instalação e testes permanecem centralizados no README.

Não escrever relatos de migração, comparações de versões, datas de adoção ou justificativas de compatibilidade. Consolidar procedimentos operacionais ainda aplicáveis dos documentos de conversão, restauração e revisões pontuais e retirar do conjunto ativo os textos exclusivamente retrospectivos. O recurso do produto para PDFs de anos anteriores e versões dos calendários continua documentado como funcionalidade atual.

## Critérios de conclusão

- Uma entrada React e uma árvore tipada de rotas atendem todos os fluxos e servidores.
- Todos os formulários e controles de edição inventariados usam TanStack Form, com propriedade de estado e semântica de aplicação/salvamento explícitas.
- O editor é organizado por comandos, sessão, sincronização, seções e formulários; `web/app.ts` não existe.
- Revisão, contas, documentos, cliente e operações Convex têm interfaces por assunto; não há fachadas de compatibilidade nem dois caminhos de implementação.
- Dados, autorização, versões, arquivos, funções agendadas e regras acadêmicas permanecem consistentes.
- Impressão e PDF usam o modelo compartilhado e o runtime real foi validado.
- Intent funciona com dependências locais nas plataformas suportadas; Devtools ajudam no desenvolvimento sem expor segredos nem entrar em produção.
- `pnpm check`, `pnpm test:linux`, CI Windows e E2E descartável apresentam evidência no código entregue, ou a conclusão permanece explicitamente pendente no item não validado.
- A documentação descreve o funcionamento da aplicação entregue, sem narrativa retrospectiva.

## Referências oficiais

- [TanStack Intent: descoberta e carregamento de skills](https://tanstack.com/intent/latest/docs/overview).
- [Intent: instalação e configuração local](https://tanstack.com/intent/latest/docs/cli/intent-install).
- [TanStack Router: segurança de tipos](https://tanstack.com/router/latest/docs/guide/type-safety).
- [TanStack Router: parâmetros de busca](https://tanstack.com/router/latest/docs/guide/search-params).
- [TanStack Router: bloqueio de navegação](https://tanstack.com/router/latest/docs/guide/navigation-blocking).
- [TanStack Form: composição](https://tanstack.com/form/latest/docs/framework/react/guides/form-composition).
- [TanStack Form: valores iniciais assíncronos](https://tanstack.com/form/latest/docs/framework/react/guides/async-initial-values).
- [TanStack Form: Devtools](https://tanstack.com/form/latest/docs/framework/react/guides/devtools).
- [TanStack Router: Devtools](https://tanstack.com/router/latest/docs/devtools).
- [TanStack CLI: consulta de documentação](https://tanstack.com/cli/latest/docs/cli-reference).
