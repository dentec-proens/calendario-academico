# Assistente de Calendários Acadêmicos DENTEC/PROENS

Aplicação web em fase alpha para elaborar calendários acadêmicos e administrativos, conferir dias letivos e registrar a revisão técnico-pedagógica. A interface é uma SPA React com Vite e TypeScript, TanStack Router e TanStack Form; autenticação, dados, arquivos e processamento de PDFs ficam no Convex.

## Desenvolvimento

Requisitos: Node.js 24 e pnpm 12.15.0. As dependências são fixadas em `package.json` e `pnpm-lock.yaml`. Os dois desenvolvedores usam os mesmos teams Dentec e repositório, com um deployment Convex de desenvolvimento para cada pessoa.

Na primeira preparação:

```sh
pnpm install --frozen-lockfile
pnpm dev:setup
```

A preparação seleciona o desenvolvimento do usuário atual no projeto da equipe e grava `.env.local`, ignorado pelo Git. Uma configuração existente é preservada; não copie a de outro desenvolvedor. `pnpm env:doctor` confere a coerência local dos destinos, sem chamadas remotas. Veja a preparação e o primeiro acesso ADMIN em [Desenvolvimento](docs/desenvolvimento.md).

No dia a dia:

```sh
pnpm dev
```

O comando acompanha funções Convex e serve o Vite em [localhost:4183](http://127.0.0.1:4183). Ctrl+C encerra os dois processos. As alterações do backend vão para o desenvolvimento individual configurado em `.env.local`.

Para conferir o build local:

```sh
pnpm build
pnpm start
```

O build gera `dist/app/`, servido em `127.0.0.1:4183`; `PORT` altera a porta. No Windows, `INICIAR.cmd` executa build e servidor local. Os dados e o login continuam no Convex; esse servidor não fornece uma API local.

## Uso

ADMIN gerencia campi, contas, documentos, eventos institucionais e revisão humana. CAMPUS consulta a base institucional e trabalha somente nos calendários da unidade autorizada. PARECERISTA consulta calendários e referências e registra análises sem alterar os calendários.

Uma entrada React atende portal, editor, revisão, logs e acesso. A navegação usa TanStack Router com rotas e parâmetros tipados. Cada seção e formulário tem endereço próprio, como `/calendarios`, `/calendarios/novo`, `/documentos`, `/contas/nova` e `/revisoes`. As seções do editor usam `/calendarios/<id>/editar`, `/periodos`, `/dias`, `/eventos`, `/historico`, `/pendencias` e `/visualizar` sob o mesmo calendário. É possível abrir esses endereços diretamente, recarregar a tela e percorrer a navegação com Voltar/Avançar do navegador. A URL identifica a tela; campos ainda não aplicados permanecem apenas na sessão e não são recuperados ao recarregar.

Os formulários usam TanStack Form para preenchimento, validação e submissão. A URL guarda filtros de navegação; rascunhos não sensíveis ficam em memória por usuário e entidade. Logout limpa os rascunhos, e arquivos selecionados exigem nova seleção quando seu fluxo é desmontado.

No editor, **Adicionar/Aplicar** inclui o preenchimento no calendário e inicia o salvamento automático. O indicador confirma a gravação; campos ainda em edição não são salvos até serem aplicados. Conflitos e falhas preservam as alterações na tela e indicam a ação necessária.

Calendários de teste geram PDFs identificados como teste. Calendários definitivos podem gerar uma cópia da proposta com pendências; a saída definitiva depende das verificações e da revisão humana atualizada. A aplicação não concede aprovação institucional nem assina ou protocola no SEI.

Veja os fluxos e limites em [Uso da aplicação](docs/uso.md).

## Verificação

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

A suíte visual protege o portal, a criação de calendário, a revisão humana com confirmação pendente, o editor, a edição de evento e o diálogo de confirmação. Dados, relógio, idioma, fuso e viewports são fixos. As referências ficam versionadas em `test/browser/__screenshots__/`, separadas por sistema e viewport. O teste falha quando falta uma referência; os testes obrigatórios não são pulados quando o navegador está ausente.

Para uma mudança visual intencional, execute `pnpm test:visual:update`, confira cada screenshot alterado e execute `pnpm test:visual` novamente. No macOS, atualize também as referências de Linux com `pnpm test:visual:linux:update` (requer Docker). O wrapper usa a mesma imagem e arquitetura do CI, instala as dependências em uma pasta temporária e copia as referências somente se toda a atualização passar; preserva o `node_modules` local. O wrapper lê as versões de Playwright e pnpm do `package.json`. Ao atualizar Playwright, mantenha `playwright-core` e `@playwright/test` na mesma versão, atualize a imagem em `.github/workflows/tests.yml` e regenere as referências. Não aceite alterações de screenshots sem verificar o efeito na interface.

A CI executa formatação, lint, análise de tipos, Vitest e build em um job; outro job instala explicitamente o Chromium, valida a geração real de PDFs e executa todos os testes sintéticos e visuais na imagem Linux fixa. Um terceiro job em `windows-latest` valida instalação com lockfile, TypeScript, testes unitários (incluindo os servidores de rotas) e build no PowerShell. Os testes de navegador e PDF no Windows usam o fluxo Docker Desktop com containers Linux e as referências Linux descritas acima. O status `check` só passa quando os três jobs passam. Adicionar o job não comprova execução: a validação Windows depende do resultado efetivo da CI. O relatório HTML, screenshots de falhas e traces ficam disponíveis no artefato `playwright-report` por 14 dias. Localmente, use `pnpm exec playwright show-report` ou `pnpm exec playwright show-trace <arquivo-trace.zip>` para investigar falhas.

O gerador de PDF usa `playwright-core` e o Chromium serverless fixado em `@sparticuz/chromium`. A preparação converte os recursos oficiais para gzip no computador de desenvolvimento ou publicação e os armazena no Convex Storage, separados dos documentos da aplicação. O pacote ARM64 tem digest SHA-256 fixado; os arquivos x64 vêm da dependência com integridade no lockfile. `dev:setup`, `e2e:setup` e `deploy:production` preparam e conferem automaticamente as duas arquiteturas, com acesso ao GitHub e ao Storage. `pnpm runtime:prepare` repete a preparação somente no dev selecionado. A configuração operacional `DENTEC_CHROMIUM_RUNTIME` identifica versão, arquivos e hashes; o runtime confere tamanho, hash e arquitetura antes de extrair e executar. As actions usam apenas gzip, mantendo o bloqueio de Brotli do Convex.

Os recursos ficam em cache por versão no `.temp/` local e na pasta temporária do worker. Eles não entram no bundle do navegador nem no catálogo institucional. A suíte `test/runtime/` executa esse mesmo caminho de download, verificação, extração e geração sem mocks, com recursos servidos localmente. Confere concorrência, conteúdo do modelo, identificação de teste/proposta, papel A4 e escape de conteúdo; é obrigatória no CI e pode ser executada separadamente com `pnpm test:runtime:linux`. Não há seleção de Chrome local nem variáveis de teste no caminho de produção do PDF.

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

## Agentes e depuração

TanStack Intent descobre as skills distribuídas com as dependências instaladas. Antes de alterar Router ou Form, consulte `AGENTS.md` e carregue a orientação pertinente:

```sh
pnpm exec intent list
pnpm exec intent load IDENTIDADE_DA_SKILL
pnpm agents:check
```

Use as identidades retornadas por `list`. A configuração e as versões são compartilhadas pelo projeto; não é necessária instalação global. A checagem de skills faz parte da validação Linux e Windows.

Em desenvolvimento, `?devtools=1` habilita o painel nas rotas permitidas. Router Devtools mostra navegação; Form Devtools acompanha formulários não sensíveis. Fluxos de credenciais e links privados ficam fora da instrumentação, e o build de produção não inclui o painel. A depuração não persiste rascunhos nem substitui testes de comportamento.

## Operação

O portal está configurado para [calendario-academico-phi.vercel.app](https://calendario-academico-phi.vercel.app). Desenvolvimento e produção usam deployments Convex separados. Ambos os desenvolvedores podem publicar diretamente, sem PR obrigatório ou ambiente intermediário.

Para publicar uma versão commitada em `main`:

```sh
pnpm deploy:production
```

O comando verifica o código e os destinos, confere o protocolo operacional, aciona manutenção, aguarda as actions admitidas e inventaria os jobs agendados. Publica Convex, prepara o runtime PDF e envia o commit conferido ao GitHub. Só libera o acesso após confirmar o mesmo deployment no domínio Vercel e executar o smoke restrito de login, rotas, consulta, salvamento sem alteração e PDF real. Exige controle operacional previamente instalado, `VERCEL_TOKEN`, Chromium local e conta/calendário operacionais explícitos; consulte [os pré-requisitos e o preflight](docs/implantacao-convex-vercel.md#publicação-coordenada). Um destino sem admissão e drenagem comprovadas exige preparação operacional antes do corte; o comando permanece bloqueado nesse caso. Uma falha mantém a manutenção para diagnóstico. `pnpm deploy:production --dry-run` mostra o plano sem chamadas remotas. Os alvos públicos estão em [`config/environments.ts`](config/environments.ts).

Build e publicação isolada do frontend não publicam funções do backend nem inicializam dados. Consulte [Implantação e operação](docs/implantacao-convex-vercel.md).

Segredos de autenticação e provedores pertencem ao ambiente Convex. Somente configurações públicas usam prefixo `VITE_`. Contas precisam de autorização prévia; convites e recuperação de senha usam links temporários entregues manualmente. Veja [Acesso e contas](docs/recuperacao-de-senha.md).

## Estrutura e documentação

| Diretório          | Conteúdo                                                                   |
| ------------------ | -------------------------------------------------------------------------- |
| `web/app/`         | Router, layouts, sessão e infraestrutura React da aplicação                |
| `web/features/`    | Telas e formulários de cada assunto; editor organizado por sessão e seções |
| `web/shared/`      | Formulários compartilhados e integração tipada Convex                      |
| `web/components/`  | Primitivas visuais e diálogo de confirmação                                |
| `convex/`          | Funções por domínio, autenticação, arquivos e controle operacional         |
| `src/`             | Regras acadêmicas, comandos puros, revisão e impressão compartilhada       |
| `assets/printing/` | CSS e logo do documento de impressão                                       |
| `scripts/`         | Desenvolvimento, build, verificação e publicação                           |
| `test/`            | Domínio, backend, infraestrutura, navegador e integração                   |
| `migration/`       | Ferramentas administrativas isoladas para exportações de dados             |

- [Desenvolvimento](docs/desenvolvimento.md): preparação individual, primeiro acesso e rotina diária.
- [Uso da aplicação](docs/uso.md): funcionalidades disponíveis, salvamento, revisão e limitações.
- [Arquitetura](docs/arquitetura-convex.md): componentes, autorização, persistência e concorrência.
- [Acesso e contas](docs/recuperacao-de-senha.md): convites, recuperação e Google institucional.
- [Implantação e operação](docs/implantacao-convex-vercel.md): ambientes, configuração, publicação e backups.
- [Operações administrativas de dados](docs/migracao-schema.md): exportação, ensaio, validação e aplicação controlada de planos.
- [Restauração dos originais](docs/restauracao-de-originais.md): reposição de PDFs com conferência de hash e preservação dos vínculos.
