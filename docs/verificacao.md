# Verificação

```sh
pnpm check
```

Executa formatação, lint, lint com análise de tipos, TypeScript, testes e build. Comandos individuais: `pnpm format:check`, `pnpm lint`, `pnpm lint:types`, `pnpm typecheck`, `pnpm test` e `pnpm build`.

Os testes de domínio, backend, infraestrutura e autosave usam Vitest e `convex-test`, sem serviço remoto. Os testes de UI usam Playwright com Chromium e fixtures sintéticas que carregam os componentes e CSS reais. Todos entram na checagem estrita de tipos (`pnpm typecheck:tests`).

Os testes de rotas verificam acesso direto às telas nos servidores Vite e de preview, equivalência com as regras da Vercel e respostas 404 para caminhos desconhecidos e arquivos inexistentes. Os testes de navegador cobrem a sincronização de tela e URL, recarregamento, histórico, permissões e preservação dos formulários ao navegar. Esse fluxo não exige scripts Unix nem geração de rotas por comandos de shell; os comandos de instalação, build e validação acima também se aplicam ao PowerShell.

Na primeira execução, instale o navegador:

```sh
pnpm test:browser:install
```

| Comando                         | Cobertura                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm test`                     | Vitest + toda a suíte sintética de navegador, incluindo regressão visual     |
| `pnpm test:unit`                | Domínio, backend e infraestrutura em Vitest                                  |
| `pnpm test:watch`               | Vitest em modo contínuo                                                      |
| `pnpm test:browser`             | Interações e regressão visual em Playwright                                  |
| `pnpm test:browser:functional`  | Apenas os fluxos de interação                                                |
| `pnpm test:visual`              | Comparação de screenshots em desktop (1440 × 1000) e mobile (390 × 844)      |
| `pnpm test:browser:ui`          | Interface interativa do Playwright para investigar testes                    |
| `pnpm test:visual:update`       | Atualização das referências visuais do sistema local, após revisão           |
| `pnpm test:browser:linux`       | Toda a suíte de navegador na imagem Docker do CI (Linux amd64)               |
| `pnpm test:visual:linux:update` | Atualização das referências visuais de Linux na imagem do CI                 |
| `pnpm test:linux`               | PDFs reais + testes de navegador e visuais na imagem Linux do CI             |
| `pnpm test:runtime`             | Geração real de PDFs com o Chromium serverless (Linux)                       |
| `pnpm test:runtime:linux`       | A mesma validação de PDF na imagem Docker do CI                              |
| `pnpm test:e2e`                 | Integração Convex com destino descartável ou dev verificado e dados próprios |

## Referências visuais e CI

A suíte visual protege o portal, a criação de calendário, a consulta de documentos e seu leitor PDF, a revisão humana com confirmação pendente, o editor, a edição de evento e o diálogo de confirmação. Dados, relógio, idioma, fuso e viewports são fixos. As referências ficam versionadas em `test/browser/__screenshots__/`, separadas por sistema e viewport. O teste falha quando falta uma referência; os testes obrigatórios não são pulados quando o navegador está ausente.

Para uma mudança visual intencional, execute `pnpm test:visual:update`, confira cada screenshot alterado e execute `pnpm test:visual` novamente. No macOS, atualize também as referências de Linux com `pnpm test:visual:linux:update` (requer Docker). O wrapper usa a mesma imagem e arquitetura do CI, instala as dependências em uma pasta temporária e copia as referências somente se toda a atualização passar; preserva o `node_modules` local. O wrapper lê as versões de Playwright e pnpm do `package.json`. Ao atualizar Playwright, mantenha `playwright-core` e `@playwright/test` na mesma versão, atualize a imagem em `.github/workflows/tests.yml` e regenere as referências. Não aceite alterações de screenshots sem verificar o efeito na interface.

A CI executa formatação, lint, análise de tipos, Vitest e build em um job; outro job instala explicitamente o Chromium, valida a geração real de PDFs e executa todos os testes sintéticos e visuais na imagem Linux fixa. Um terceiro job em `windows-latest` valida instalação com lockfile, TypeScript, testes unitários (incluindo os servidores de rotas) e build no PowerShell. Os testes de navegador e PDF no Windows usam o fluxo Docker Desktop com containers Linux e as referências Linux descritas acima. O status `check` só passa quando os três jobs passam. Adicionar o job não comprova execução: a validação Windows depende do resultado efetivo da CI. O relatório HTML, screenshots de falhas e traces ficam disponíveis no artefato `playwright-report` por 14 dias. Localmente, use `pnpm exec playwright show-report` ou `pnpm exec playwright show-trace <arquivo-trace.zip>` para investigar falhas.

## Runtime de PDF

O gerador de PDF usa `playwright-core` e o Chromium serverless fixado em `@sparticuz/chromium`. A preparação converte os recursos oficiais para gzip no computador de desenvolvimento ou publicação e os armazena no Convex Storage, separados dos documentos da aplicação. O pacote ARM64 tem digest SHA-256 fixado; os arquivos x64 vêm da dependência com integridade no lockfile. `dev:setup`, `e2e:setup` e `deploy:production` preparam e conferem automaticamente as duas arquiteturas, com acesso ao GitHub e ao Storage. `pnpm runtime:prepare` repete a preparação somente no dev selecionado. A configuração operacional `DENTEC_CHROMIUM_RUNTIME` identifica versão, arquivos e hashes; o runtime confere tamanho, hash e arquitetura antes de extrair e executar. As actions usam apenas gzip, mantendo o bloqueio de Brotli do Convex.

Os recursos ficam em cache por versão no `.temp/` local e na pasta temporária do worker. Eles não entram no bundle do navegador nem no catálogo institucional. A suíte `test/runtime/` executa esse mesmo caminho de download, verificação, extração e geração sem mocks, com recursos servidos localmente. Confere concorrência, conteúdo do modelo, identificação de teste/proposta, papel A4 e escape de conteúdo; é obrigatória no CI e pode ser executada separadamente com `pnpm test:runtime:linux`. Não há seleção de Chrome local nem variáveis de teste no caminho de produção do PDF.

## E2E com Convex

Os testes de integração real ficam em `test/e2e/native-portal.spec.ts` e não fazem parte de `pnpm test`, `pnpm check` ou do CI padrão. Há dois modos de opt-in: `DENTEC_DISPOSABLE_E2E=1` para um deployment descartável e `DENTEC_DEVELOPMENT_E2E=1` para o desenvolvimento atual explicitamente autorizado. Os modos são mutuamente exclusivos; o portal de produção é sempre recusado.

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
