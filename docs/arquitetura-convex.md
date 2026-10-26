# Arquitetura

A aplicação é uma SPA React e Vite com uma entrada HTML e TanStack Router. Convex concentra identidade, sessões, consultas reativas, transações, arquivos e processamento. `server.ts` serve o build estático para preview e recusa `/api/*`.

## Responsabilidades

| Módulo                                              | Responsabilidade                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| `web/app/`                                          | Árvore tipada de rotas, layouts, sessão, erros e Devtools                         |
| `web/features/`                                     | Páginas e formulários organizados por assunto                                     |
| `web/features/calendar-editor/session/`             | Estado confirmado/aplicado, sincronização, autosave e ciclo de vida do calendário |
| `web/shared/forms/`                                 | Rascunhos em memória, submissão e composição comum de formulários                 |
| `web/shared/convex/`                                | Cliente, erros, tipos e operações por domínio                                     |
| `web/components/`                                   | Controles visuais e confirmação acessível                                         |
| `src/calendar-edits/`                               | Comandos puros que validam e aplicam alterações de calendário                     |
| `src/printing/`                                     | Modelo puro de impressão e distribuição de dias                                   |
| `assets/printing/`                                  | CSS e logo usados no documento                                                    |
| `convex/calendars.ts`, `histories.ts`               | Calendários, versões, lixeira, fontes e análise dos PDFs                          |
| `convex/catalogue.ts`, `documents.ts`, `reviews.ts` | Base institucional, documentos e revisão humana                                   |
| `convex/access/`                                    | Sessão, identidade, membros, convites, recuperação e instalação                   |
| `convex/nativeFiles.ts`                             | Uploads temporários, tickets, restauração e limpeza agendada                      |
| `convex/actions/`                                   | Processamento Node de arquivos, análise e PDF                                     |
| `convex/operations.ts`                              | Admissão de trabalho, manutenção e drenagem de actions                            |

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

O backend deriva identidade, papel e campus da sessão. CAMPUS só atua na unidade autorizada; ADMIN gerencia o sistema; PARECERISTA revisa sem editar calendários. Guards organizam as telas; cada função Convex autoriza a operação. Tipos gerados e validadores são a referência dos contratos.

Salvar calendário confere versão e base, preserva atributos protegidos e valida fontes históricas; uma gravação sem mudança não cria versão artificial. A revisão humana possui salvamento explícito e depende da versão do calendário, base e revisão do parecer. Atualização institucional exige incorporação explícita.

## Arquivos, impressão e manutenção

PDFs ficam no Storage por `storageId`; URLs são obtidas no acesso. Uploads têm proprietário, limite de 8 MB, assinatura PDF, SHA-256 e consumo único. Restauração exige o original exato e preserva ID, análises e vínculos. Tickets e temporários possuem limpeza agendada em funções de identidade estável.

Prévia, impressão e PDF usam o mesmo modelo de `src/printing/`. O gerador Node controla Chromium, bloqueia rede do renderizador e mantém recursos locais. Produção não carrega módulos de Devtools nem os recursos de depuração de formulários sensíveis.

`operationalControl` guarda a manutenção; `operationalLeases` identifica actions admitidas. A admissão e a pausa são transacionais; mutations de domínio e criação de sessões verificam manutenção. Heartbeat e disconnect de presença continuam disponíveis e usam o ciclo próprio do componente fixado, sem alterar o domínio acadêmico. O smoke pode autorizar temporariamente uma conta ADMIN local na janela do commit; as demais contas permanecem bloqueadas. Actions registram o ID do lease no log e o removem em `finally`. Um lease sem conclusão permanece visível e bloqueia publicação: idade não é prova de término. O procedimento de recuperação está em [Implantação e operação](implantacao-convex-vercel.md).

Comandos e ambientes de validação estão em [Verificação no README](../README.md#verificação).
