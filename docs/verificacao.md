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

| Comando                        | Cobertura                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `pnpm check`                   | Validação local completa antes de uma release: formatação, lint, tipos, testes e build |
| `pnpm test`                    | Vitest + toda a suíte sintética de navegador, incluindo regressão visual               |
| `pnpm test:unit`               | Domínio, backend e infraestrutura em Vitest                                            |
| `pnpm test:watch`              | Vitest em modo contínuo                                                                |
| `pnpm test:browser`            | Interações e regressão visual em Playwright                                            |
| `pnpm test:browser:functional` | Apenas os fluxos de interação                                                          |
| `pnpm test:visual`             | Comparação de screenshots em desktop (1440 × 1000) e mobile (390 × 844)                |
| `pnpm test:browser:ui`         | Interface interativa do Playwright para investigar testes                              |
| `pnpm test:browser:trace`      | Suíte local com gravação de traces, preservados nas falhas                             |
| `pnpm test:visual:update`      | Atualização das referências visuais do sistema local, após revisão                     |
| `pnpm test:runtime`            | Geração real de PDFs com o Chromium serverless, em Linux local                         |
| `pnpm test:runtime:linux`      | Teste específico do runtime PDF em Docker local, também no Windows/macOS               |
| `pnpm test:e2e`                | Integração Convex com destino descartável ou dev verificado e dados próprios           |

## Validação local e release

O repositório não executa GitHub Actions. `pnpm check` é o bloqueio local de release: `pnpm deploy:production` executa essa checagem antes de entrar em manutenção ou publicar o backend. A suíte local inclui os fluxos de navegador e as referências visuais desktop e mobile; não há execução adicional obrigatória desses testes em Linux/Docker.

O E2E com Convex continua separado e exige o opt-in descrito abaixo. Execute-o quando a mudança exigir integração real, em destino de desenvolvimento autorizado ou descartável, antes da release. Os testes sintéticos de `check` não acessam o backend remoto. O smoke operacional de publicação mantém suas verificações de login, navegação e PDF no portal publicado.

## Desempenho e diagnóstico

Os testes sintéticos usam até quatro workers, limitados ao paralelismo disponível da máquina, e distribuem os casos independentes dentro dos arquivos. Para comparar ou limitar o consumo, use `pnpm test:browser --workers=2` ou `--workers=1`. O E2E com Convex mantém um worker e execução sequencial, pois utiliza registros compartilhados da própria suíte.

Cada worker reutiliza um servidor Vite por tipo de fixture. Os testes continuam recebendo contextos de navegador novos: memória dos módulos da aplicação, cookies e armazenamento do navegador ficam isolados. As variantes de perfil e os testes de indisponibilidade de backend têm servidores separados; os caches Vite são separados por worker.

A execução normal não grava traces. Casos marcados com `.only` são recusados também na validação local. Para investigar uma falha, execute `pnpm test:browser:trace`, acrescentando o arquivo ou `--grep` desejado; o trace é gravado durante o teste e preservado somente em caso de falha. Não há retry automático. O relatório HTML e as screenshots de falhas continuam disponíveis em `playwright-report/` e `test-results/`. Use `pnpm exec playwright show-report` ou `pnpm exec playwright show-trace <arquivo-trace.zip>` para inspecioná-los.

Para executar validações simultâneas no mesmo checkout, separe os artefatos: configure `DENTEC_TEST_OUTPUT_DIR` e `PLAYWRIGHT_HTML_OUTPUT_DIR` com diretórios distintos por execução (no PowerShell, use `$env:NOME = "caminho"`). Isso evita que uma suíte apague os traces ou screenshots de outra.

Durante o desenvolvimento, rode primeiro os arquivos afetados, por exemplo `pnpm test:browser test/browser/editor-forms.spec.ts`. Antes de concluir ou publicar, execute `pnpm check` completo e registre comando, resultado e duração. Uma execução parcial não substitui a validação de release.

## Referências visuais

A suíte visual protege o portal, a criação de calendário, a consulta de documentos e seu leitor PDF, a revisão humana com confirmação pendente, o editor, a edição de evento e o diálogo de confirmação. Dados, relógio, idioma, fuso e viewports são fixos. As referências ficam versionadas em `test/browser/__screenshots__/`, separadas por sistema e viewport. O teste falha quando falta uma referência; os testes obrigatórios não são pulados quando o navegador está ausente.

Para uma mudança visual intencional, execute `pnpm test:visual:update`, confira cada screenshot alterado e execute `pnpm test:visual` novamente, sem atualização. Valide as referências do sistema local em uso; ao passar a outro sistema, gere e revise as referências correspondentes, sem copiar imagens entre sistemas. As referências Linux já versionadas podem ser usadas quando o desenvolvimento local ocorrer em Linux. Ao atualizar Playwright, mantenha `playwright-core` e `@playwright/test` na mesma versão e confira as referências afetadas. Não aceite alterações de screenshots sem verificar o efeito na interface.

No Windows, instalação, TypeScript, testes unitários, navegador e build executam localmente pelo PowerShell. A primeira execução visual exige referências `win32` revisadas; resultados em macOS ou Linux não comprovam essa plataforma. Para executar o teste específico do runtime PDF fora de Linux, instale o Docker (Docker Desktop com containers Linux no Windows/macOS), inicie o daemon e permita acesso à imagem `mcr.microsoft.com/playwright` e ao registro npm. Esse teste é independente do navegador local e mantém suas dependências em uma pasta temporária.

## Runtime de PDF

O gerador de PDF usa `playwright-core` e o Chromium serverless fixado em `@sparticuz/chromium`. A preparação converte os recursos oficiais para gzip no computador de desenvolvimento ou publicação e os armazena no Convex Storage, separados dos documentos da aplicação. O pacote ARM64 tem digest SHA-256 fixado; os arquivos x64 vêm da dependência com integridade no lockfile. `dev:setup`, `e2e:setup` e `deploy:production` preparam e conferem automaticamente as duas arquiteturas, com acesso ao GitHub e ao Storage. `pnpm runtime:prepare` repete a preparação somente no dev selecionado. A configuração operacional `DENTEC_CHROMIUM_RUNTIME` identifica versão, arquivos e hashes; o runtime confere tamanho, hash e arquitetura antes de extrair e executar. As actions usam apenas gzip, mantendo o bloqueio de Brotli do Convex.

Os recursos ficam em cache por versão no `.temp/` local e na pasta temporária do worker. Eles não entram no bundle do navegador nem no catálogo institucional. A suíte `test/runtime/` executa esse mesmo caminho de download, verificação, extração e geração sem mocks, com recursos servidos localmente. Confere concorrência, conteúdo do modelo, identificação de teste/proposta, papel A4 e escape de conteúdo; é executada localmente quando houver mudanças no gerador, modelo de impressão ou dependências do runtime, com `pnpm test:runtime` em Linux ou `pnpm test:runtime:linux` pelo Docker. Não há seleção de Chrome local nem variáveis de teste no caminho de produção do PDF.

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
