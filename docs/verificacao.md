# Verificação

```sh
pnpm check
```

Executa formatação de código e configuração, lint, lint com análise de tipos, TypeScript, testes e build. Comandos individuais: `pnpm format:check`, `pnpm lint`, `pnpm lint:types`, `pnpm typecheck`, `pnpm test` e `pnpm build`.

A formatação da documentação é independente de `pnpm check`: arquivos Markdown (`.md`, `.mdx` e `.markdown`) são verificados com `pnpm format:docs:check` e formatados com `pnpm format:docs`. `pnpm format` e `pnpm format:check` cuidam dos demais arquivos reconhecidos pelo Prettier, sem Markdown. Os padrões ficam entre aspas para serem interpretados pelo próprio Prettier, não pelo shell.

Para uma alteração apenas documental, confira somente os arquivos alterados, por exemplo:

```sh
pnpm exec prettier --check docs/verificacao.md
```

Os testes de domínio, backend, infraestrutura e autosave usam Vitest e `convex-test`, sem serviço remoto. Os testes de UI usam Playwright com Chromium e fixtures sintéticas que carregam os componentes e CSS reais. Todos entram na checagem estrita de tipos (`pnpm typecheck:tests`).

Os testes de rotas verificam acesso direto às telas nos servidores Vite e de preview, equivalência com as regras da Vercel e respostas 404 para caminhos desconhecidos e arquivos inexistentes. Os testes de navegador cobrem a sincronização de tela e URL, recarregamento, histórico, permissões e preservação dos formulários ao navegar. Esse fluxo não exige geração de rotas por comandos de shell.

Na primeira execução, instale o navegador:

```sh
pnpm test:browser:install
```

| Comando                        | Cobertura                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `pnpm check`                   | Validação local completa antes do commit: formatação de código/configuração, lint, tipos, testes e build |
| `pnpm format`                  | Formatação de código e configuração, sem Markdown                                                        |
| `pnpm format:check`            | Conferência da formatação de código e configuração, sem Markdown                                         |
| `pnpm format:docs`             | Formatação da documentação Markdown                                                                      |
| `pnpm format:docs:check`       | Conferência da formatação da documentação Markdown, fora de `pnpm check`                                 |
| `pnpm test`                    | Vitest + toda a suíte sintética de navegador, incluindo regressão visual                                 |
| `pnpm test:unit`               | Domínio, backend e infraestrutura em Vitest                                                              |
| `pnpm test:watch`              | Vitest em modo contínuo                                                                                  |
| `pnpm test:browser`            | Interações e regressão visual em Playwright                                                              |
| `pnpm test:browser:functional` | Apenas os fluxos de interação                                                                            |
| `pnpm test:visual`             | Comparação de screenshots em desktop (1440 × 1000) e mobile (390 × 844)                                  |
| `pnpm test:browser:ui`         | Interface interativa do Playwright para investigar testes                                                |
| `pnpm test:browser:trace`      | Suíte local com gravação de traces, preservados nas falhas                                               |
| `pnpm test:visual:update`      | Atualização das referências visuais do sistema local, após revisão                                       |
| `pnpm test:e2e`                | Integração Convex com destino descartável ou dev verificado e dados próprios                             |

## Validação local e release

A [release](implantacao-convex-vercel.md#publicação) não repete `check`, testes ou build local. Mantém o typecheck do deploy Convex e o build remoto Production da Vercel. Ao implementar ou alterar código, permanece obrigatória a validação de desenvolvimento com `pnpm check`.

O repositório não executa GitHub Actions. `pnpm check` é o bloqueio local antes do commit que será publicado. A suíte local inclui os fluxos de navegador e as referências visuais desktop e mobile do macOS; não há execução desses testes em Linux ou Docker.

O E2E com Convex continua separado e exige o opt-in descrito abaixo. Execute-o quando a mudança exigir integração real, em destino de desenvolvimento autorizado ou descartável, antes da release. Os testes sintéticos de `check` não acessam o backend remoto.

## Desempenho e diagnóstico

Os testes sintéticos usam até quatro workers, limitados ao paralelismo disponível da máquina, e distribuem os casos independentes dentro dos arquivos. Para comparar ou limitar o consumo, use `pnpm test:browser --workers=2` ou `--workers=1`. O E2E com Convex mantém um worker e execução sequencial, pois utiliza registros compartilhados da própria suíte.

Cada worker reutiliza um servidor Vite por tipo de fixture. Os testes continuam recebendo contextos de navegador novos: memória dos módulos da aplicação, cookies e armazenamento do navegador ficam isolados. As variantes de perfil e os testes de indisponibilidade de backend têm servidores separados; os caches Vite são separados por worker.

A execução normal não grava traces. Casos marcados com `.only` são recusados também na validação local. Para investigar uma falha, execute `pnpm test:browser:trace`, acrescentando o arquivo ou `--grep` desejado; o trace é gravado durante o teste e preservado somente em caso de falha. Não há retry automático. O relatório HTML e as screenshots de falhas continuam disponíveis em `playwright-report/` e `test-results/`. Use `pnpm exec playwright show-report` ou `pnpm exec playwright show-trace <arquivo-trace.zip>` para inspecioná-los.

Para executar validações simultâneas no mesmo checkout, separe os artefatos: configure `DENTEC_TEST_OUTPUT_DIR` e `PLAYWRIGHT_HTML_OUTPUT_DIR` com diretórios distintos por execução. Isso evita que uma suíte apague os traces ou screenshots de outra.

Durante o desenvolvimento, rode primeiro os arquivos afetados, por exemplo `pnpm test:browser test/browser/editor-forms.spec.ts`. Antes de concluir ou publicar, execute `pnpm check` completo e registre comando, resultado e duração. Uma execução parcial não substitui a validação de release.

## Organização e contratos do domínio

`pnpm test:unit test/architecture/boundaries.test.ts test/domain/academic-diagnostics.test.ts test/domain/prepare-calendar-save.test.ts` verifica imports sem ciclos em runtime e sem dependências dos adaptadores no domínio acadêmico, coerência dos diagnósticos entre estado aplicado e confirmado e preparação pura do salvamento. As suítes de calendário, regras de 2027, base, adição de ofertas, revisão e persistência continuam exercitando os mesmos contratos públicos, agora importados de `src/domain/`.

Os testes unitários ficam agrupados pela camada exercitada: `test/domain/` (regras puras e impressão), `test/web/` (contratos da interface), `test/convex/` (funções e persistência com `convex-test`), `test/tooling/` (scripts, build, migrações e release) e `test/architecture/` (fronteiras entre módulos). `test/browser/`, `test/e2e/` e `test/runtime/` mantêm suas configurações próprias.

## Referências visuais

A suíte visual protege o portal, a criação de calendário, a consulta de documentos e seu leitor PDF, a revisão humana com confirmação pendente, o editor, a edição de evento e o diálogo de confirmação. Dados, relógio, idioma, fuso e viewports são fixos. As referências ficam versionadas em `test/browser/__screenshots__/`, somente para macOS (`darwin`), separadas por viewport. O teste falha quando falta uma referência; os testes obrigatórios não são pulados quando o navegador está ausente.

Para uma mudança visual intencional, execute `pnpm test:visual:update`, confira cada screenshot alterado e execute `pnpm test:visual` novamente, sem atualização. Outros sistemas não têm referências versionadas, e a comparação visual falha neles. Ao atualizar Playwright, confira as referências afetadas. Não aceite alterações de screenshots sem verificar o efeito na interface.

## Impressão do calendário

O PDF do calendário é a impressão da prévia pelo navegador. Os testes de navegador conferem o nome sugerido pelo título da página, e o E2E gera o PDF da prévia com `page.pdf()` do Chromium e confere seu texto.

## E2E com Convex

Os testes de integração real ficam em `test/e2e/native-portal.spec.ts` e não fazem parte de `pnpm test` ou `pnpm check`. Há dois modos de opt-in: `DENTEC_DISPOSABLE_E2E=1` para um deployment descartável e `DENTEC_DEVELOPMENT_E2E=1` para o desenvolvimento atual explicitamente autorizado. Os modos são mutuamente exclusivos; o portal de produção é sempre recusado.

Para preparar os testes no desenvolvimento selecionado em `.env.local`:

```sh
pnpm e2e:setup
pnpm dev
```

Em outro terminal:

```sh
pnpm test:e2e
```

`e2e:setup` publica as funções no desenvolvimento conferido, preserva suas contas e dados e cria uma conta ADMIN, um campus e fontes exclusivos dos testes. Reserva um ano de 7000 a 8999 sem calendários, documentos ou eventos preexistentes, e grava `.env.e2e.local`, ignorado pelo Git. A configuração inclui frontend loopback na porta local, backend/deployment verificados, credenciais de teste e fixture de restauração em `test/.temp/`. O comando não cria outro ambiente e não aponta para produção.

`test:e2e` lê esse arquivo e confere novamente o destino antes de iniciar o navegador. O modo de desenvolvimento exige `DENTEC_NATIVE_DEPLOYMENT`, `DENTEC_NATIVE_BACKEND_URL`, `DENTEC_NATIVE_TEST_RUN_ID`, `DENTEC_NATIVE_TEST_CAMPUS_ID` e `DENTEC_NATIVE_TEST_YEAR`, além de URL e credenciais. A suíte altera somente os registros que cria; não reseta tabelas, não edita eventos institucionais existentes e não restaura originais arbitrários. Registros de teste ficam identificados, com calendários na lixeira e documentos arquivados após o fluxo; fontes, versões e auditoria são preservadas.

Para um deployment descartável configurado separadamente, informar `DENTEC_NATIVE_BROWSER_URL`, `DENTEC_NATIVE_TEST_EMAIL` e `DENTEC_NATIVE_TEST_PASSWORD` junto ao opt-in correspondente. Sem configuração válida o comando falha antes de acessar o deployment. Restauração requer `DENTEC_NATIVE_RESTORE_FIXTURE`; no desenvolvimento, a fixture deve pertencer ao run/campus/ano preparados. Nenhum comando sintético publica funções ou altera dados remotos.

## Atualização segura entre versões

Os contratos puros ficam em `test/web/frontend-updates.test.ts` e `test/tooling/frontend-build.test.ts`. A suíte verifica identidade única inclusive em chamada direta ao Vite, divergência cliente/manifesto, validação e limite de JSON, erro/timeout/abort, deduplicação, janela de observação e tentativas por alvo, rollback, fontes vivas e finalizações tardias. `test/web/form-drafts.test.ts` conserva os contratos anteriores do registro.

`test/browser/updates.spec.ts` constrói A e B pelo mesmo `vite.config.ts` e plugin usados pela aplicação, em modo de produção. Usa a árvore real, componentes e CSS, usando doubles locais para serviços externos e sondas explícitas de teste para identidade de objetos/erro de renderização. Uma propriedade CSS de teste sem efeito visual distingue os estilos gerados de A e B. O servidor troca o diretório servido sem reiniciar o navegador; pode servir o manifesto público novo enquanto uma aba ainda executa A. As sondas de teste expõem somente referências dos proprietários, para comprovar a identidade da sessão e do registro após falhas, sem acrescentar hooks de teste ao código da aplicação.

```sh
pnpm test:unit test/web/frontend-updates.test.ts test/tooling/frontend-build.test.ts test/web/form-drafts.test.ts
pnpm test:browser test/browser/updates.spec.ts
pnpm test:visual test/browser/updates.visual.spec.ts
```

A regressão inicial falhou antes da correção porque o erro do chunk de `PeriodsSection` removia `.portal-back` e o proprietário do editor. Depois da correção, o teste compara as mesmas referências de sessão e drafts e retorna ao campo não aplicado. A falha de CSS usa uma requisição real abortada e a recuperação aguarda o mesmo URL original antes de exibir a tela. Não se usa HMR, query aleatória, módulo duplicado ou prefetch para esconder o problema.

O teste de HTML demorado mantém a resposta do documento pendente no servidor. Playwright aguarda o novo contexto ao consultar uma página em navegação; por isso, um observador instalado antes da navegação lê o DOM visível anterior e comunica apenas texto/posição dos controles. O teste clica com mouse nativo no cancelamento visível, confirma o aborto da requisição e libera a resposta tardia antes de editar outra vez. O observador não altera a aplicação, não força controles nem remove a trava. O timeout do evento de aborto inclui os dez segundos previstos para oferecer o cancelamento. O teste de BFCache usa uma instância Chromium local com o cache de voltar/avançar habilitado, sem substituir os headers da aplicação. O HTML estático do preview usa revalidação a cada acesso (`public, max-age=0, must-revalidate`), alinhada ao domínio público observado; o manifesto permanece `no-store`. A política anterior de `no-store` no HTML impedia a restauração no Chromium por `response-cache-control-no-store-with-js-network-request`; não era uma falha de estado da aplicação. O shell não inclui dados autenticados ou valores de formulário.

As referências novas comparam somente o aviso de versão, liberado e bloqueado, em desktop e mobile. Antes de concluir, inspecione as imagens e repita a comparação sem atualização. As suítes existentes continuam cobrindo navegação, formulários, revisão, sessão expirada, diálogos e exportação.

Essas provas são locais no Chromium/macOS, com viewport mobile. Não certificam retenção na CDN, outro navegador, encerramento do processo ou descarte da aba pelo sistema. Não executam E2E Convex remoto nem publicam artefatos. Como o gerador/modelo/runtime PDF não é alterado, `pnpm test:runtime:linux` não é necessário para esta entrega.

As regressões de revisão cobrem descarte explícito seguido de desmontagem, habilitação do editor de conclusão sem alteração de conteúdo, OAuth com navegação de documento local, troca de identidade durante HTML atrasado, erro de renderização no painel, retorno ao mesmo build e reabertura do calendário remoto sem recarregar. O ensaio A/B também remove de fato um chunk da versão anterior e verifica a recuperação e o CSS da nova versão. As sondas de falha/referência e o marcador CSS existem somente no plugin da fixture; não são compilados no portal publicado.

O manifesto interno do Vite não é publicado: `manifest` fica desabilitado na configuração do portal. `test/tooling/static-build.test.ts` solicita `--manifest` somente para inspecionar o grafo de chunks da compilação e verificar ausência de painéis de desenvolvimento/Node. O manifesto público de versão continua gerado pelo plugin e é o único JSON necessário ao runtime.

## Regressões de segurança

`pnpm exec vitest run test/convex/security-hardening.test.ts test/convex/storage-simulator.test.ts test/convex/native-files.test.ts` exercita os fluxos reais de autenticação, quota e ingresso: mais de mil renovações/sessões, revogação e novo login com relógio congelado, geração legada, limpeza limitada, par incompatível de refresh, bloqueio/desbloqueio auditado, recência original do ADMIN antes do hash, reset intercalado após verificação real da senha e teto de trabalho em andamento mesmo após repor a quota de frequência. A suíte de Storage também verifica rollback externo e de subtransação do adaptador de testes. `test/browser/account-security.spec.ts` cobre a ação de desbloqueio com teclado em desktop/mobile.

`pnpm audit` consulta avisos conhecidos das dependências e complementa `pnpm check`. `pnpm exec tsx scripts/benchmark-passwords.ts` mede hashes sintéticos somente no Node local. O [guia operacional](seguranca.md) distingue esses resultados da validação remota ainda exigida antes de publicar auth e ingresso de bytes.

## Continuidade dos arquivos publicados

`pnpm test:unit test/tooling/frontend-assets.test.ts test/tooling/static-build.test.ts` verifica a herança cumulativa A → B → C, adoção do portal anterior sem inventário, imports transitivos, CSS e worker, integridade e bloqueio de histórico ausente/corrompido. O build direto do Vite precisa emitir um inventário completo e a marca de adoção no HTML.

`pnpm test:browser test/browser/updates.spec.ts` inclui uma aba preenchida antes de uma publicação: após servir B, a aba A abre a revisão sem erro, conserva o evento ainda não aplicado e as mesmas referências de sessão/formulários. Uma aba nova recebe B. Os cenários usam desktop e viewport mobile, com o menu real de etapas; um deles exercita a primeira adoção sem inventário. Os testes anteriores de remoção deliberada de arquivos continuam cobrindo a recuperação protegida quando o recurso realmente está indisponível.

O ensaio remoto de retenção pode usar somente GETs públicos do inventário e arquivos estáticos, sem acessar registros de calendários. Após uma promoção autorizada, conferir que arquivos identificados antes da promoção continuam disponíveis pelo domínio canônico. Uma suíte local não substitui essa confirmação da CDN. O mecanismo não muda o gerador/modelo nem as dependências do runtime PDF.
