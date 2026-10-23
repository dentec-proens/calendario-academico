# Assistente de Calendários Acadêmicos DENTEC/PROENS

Aplicação web em fase alpha para elaborar calendários acadêmicos e administrativos, conferir dias letivos e registrar a revisão técnico-pedagógica. O frontend usa React, Vite e TypeScript; autenticação, dados, arquivos e processamento de PDFs ficam no Convex.

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

O comando acompanha funções Convex e serve o Vite em [localhost:4183](http://127.0.0.1:4183). Ctrl+C encerra os dois processos. As alterações do backend vão para o desenvolvimento individual; o deployment `oceanic-gazelle-652` já configurado por Gustavo permanece preservado.

Para conferir o build local:

```sh
pnpm build
pnpm start
```

O build gera `dist/app/`, servido em `127.0.0.1:4183`; `PORT` altera a porta. No Windows, `INICIAR.cmd` executa build e servidor local. Os dados e o login continuam no Convex; esse servidor não fornece uma API local.

## Uso

ADMIN gerencia campi, contas, documentos, eventos institucionais e revisão humana. CAMPUS consulta a base institucional e trabalha somente nos calendários da unidade autorizada.

No editor, **Adicionar/Aplicar** inclui o preenchimento no calendário e inicia o salvamento automático. O indicador confirma a gravação; campos ainda em edição não são salvos até serem aplicados. Conflitos e falhas preservam as alterações na tela e indicam a ação necessária.

Calendários de teste geram PDFs identificados como teste. Calendários definitivos podem gerar uma cópia da proposta com pendências; a saída definitiva depende das verificações e da revisão humana atualizada. A aplicação não concede aprovação institucional nem assina ou protocola no SEI.

Veja os fluxos e limites em [Uso da aplicação](docs/uso.md).

## Verificação

```sh
pnpm check
```

Executa formatação, lint, lint com análise de tipos, TypeScript, testes e build. Comandos individuais: `pnpm format:check`, `pnpm lint`, `pnpm lint:types`, `pnpm typecheck`, `pnpm test` e `pnpm build`.

Os testes de domínio, backend, infraestrutura e autosave usam Vitest e `convex-test`, sem serviço remoto. Os testes de UI usam Playwright com Chromium e fixtures sintéticas que carregam os componentes e CSS reais. Todos entram na checagem estrita de tipos (`pnpm typecheck:tests`).

Na primeira execução, instale o navegador:

```sh
pnpm test:browser:install
```

| Comando                         | Cobertura                                                                   |
| ------------------------------- | --------------------------------------------------------------------------- |
| `pnpm test`                     | Vitest + toda a suíte sintética de navegador, incluindo regressão visual    |
| `pnpm test:unit`                | Domínio, backend e infraestrutura em Vitest                                 |
| `pnpm test:watch`               | Vitest em modo contínuo                                                     |
| `pnpm test:browser`             | Interações e regressão visual em Playwright                                 |
| `pnpm test:browser:functional`  | Apenas os fluxos de interação                                               |
| `pnpm test:visual`              | Comparação de screenshots em desktop (1440 × 1000) e mobile (390 × 844)     |
| `pnpm test:browser:ui`          | Interface interativa do Playwright para investigar testes                   |
| `pnpm test:visual:update`       | Atualização das referências visuais do sistema local, após revisão          |
| `pnpm test:browser:linux`       | Toda a suíte de navegador na imagem Docker do CI (Linux amd64)              |
| `pnpm test:visual:linux:update` | Atualização das referências visuais de Linux na imagem do CI                |
| `pnpm test:linux`               | PDFs reais + testes de navegador e visuais na imagem Linux do CI            |
| `pnpm test:runtime`             | Geração real de PDFs com o Chromium serverless (Linux)                      |
| `pnpm test:runtime:linux`       | A mesma validação de PDF na imagem Docker do CI                             |
| `pnpm test:e2e`                 | Integração com um deployment Convex descartável, configurado explicitamente |

A suíte visual protege o portal, a criação de calendário, a revisão humana com confirmação pendente, o editor, a edição de evento e o diálogo de confirmação. Dados, relógio, idioma, fuso e viewports são fixos. As referências ficam versionadas em `test/browser/__screenshots__/`, separadas por sistema e viewport. O teste falha quando falta uma referência; os testes obrigatórios não são pulados quando o navegador está ausente.

Para uma mudança visual intencional, execute `pnpm test:visual:update`, confira cada screenshot alterado e execute `pnpm test:visual` novamente. No macOS, atualize também as referências de Linux com `pnpm test:visual:linux:update` (requer Docker). O wrapper usa a mesma imagem e arquitetura do CI, instala as dependências em uma pasta temporária e copia as referências somente se toda a atualização passar; preserva o `node_modules` local. O wrapper lê as versões de Playwright e pnpm do `package.json`. Ao atualizar Playwright, mantenha `playwright-core` e `@playwright/test` na mesma versão, atualize a imagem em `.github/workflows/tests.yml` e regenere as referências. Não aceite alterações de screenshots sem verificar o efeito na interface.

A CI executa formatação, lint, análise de tipos, Vitest e build em um job; outro job instala explicitamente o Chromium, valida a geração real de PDFs e executa todos os testes sintéticos e visuais na imagem Linux fixa. O status `check` só passa quando ambos os jobs passam. O relatório HTML, screenshots de falhas e traces ficam disponíveis no artefato `playwright-report` por 14 dias. Localmente, use `pnpm exec playwright show-report` ou `pnpm exec playwright show-trace <arquivo-trace.zip>` para investigar falhas.

O gerador de PDF usa `playwright-core` para controlar o navegador. `@sparticuz/chromium` é uma dependência de produção: fornece o executável e as bibliotecas Linux necessários às actions Node do Convex, e não participa dos testes de UI. A suíte `test/runtime/` executa esse mesmo gerador sem mocks, verificando concorrência, conteúdo do modelo de impressão, identificação de teste/proposta, papel A4 e escape de conteúdo. Ela é obrigatória no CI e roda separadamente com `pnpm test:runtime:linux` em outros sistemas. Não há seleção de Chrome local nem variáveis de teste no caminho de produção do PDF.

Os testes de integração real ficam em `test/e2e/native-portal.spec.ts` e não fazem parte de `pnpm test`, `pnpm check` ou do CI padrão. `pnpm test:e2e` exige `DENTEC_DISPOSABLE_E2E=1`, `DENTEC_NATIVE_BROWSER_URL`, `DENTEC_NATIVE_TEST_EMAIL` e `DENTEC_NATIVE_TEST_PASSWORD`. Sem essa configuração o comando falha antes de acessar o deployment. Nunca use produção, dados importados ou um ambiente compartilhado. O cenário de restauração exige também `DENTEC_NATIVE_RESTORE_FIXTURE`; apenas esse cenário é pulado quando a fixture opcional não foi informada. Nenhum comando sintético publica funções ou altera dados remotos.

## Operação

O portal está configurado para [calendario-academico-phi.vercel.app](https://calendario-academico-phi.vercel.app). Desenvolvimento e produção usam deployments Convex separados. Ambos os desenvolvedores podem publicar diretamente, sem PR obrigatório ou ambiente intermediário.

Para publicar uma versão commitada em `main`:

```sh
pnpm deploy:production
```

O comando verifica o código, confirma o destino Convex de produção, publica as funções e envia o commit conferido ao GitHub. A integração Git da Vercel publica o portal. `pnpm deploy:production --dry-run` mostra o plano sem chamadas remotas. Os alvos públicos estão em [`config/environments.ts`](config/environments.ts).

Build e publicação isolada do frontend não publicam funções do backend nem inicializam dados. Consulte [Implantação e operação](docs/implantacao-convex-vercel.md).

Segredos de autenticação e provedores pertencem ao ambiente Convex. Somente configurações públicas usam prefixo `VITE_`. Contas precisam de autorização prévia; convites e recuperação de senha usam links temporários entregues manualmente. Veja [Acesso e contas](docs/recuperacao-de-senha.md).

## Estrutura e documentação

| Diretório    | Conteúdo                                                          |
| ------------ | ----------------------------------------------------------------- |
| `web/`       | Portal React, cliente Convex, editor e renderização do calendário |
| `convex/`    | Autenticação, consultas, transações, arquivos e processamento     |
| `src/`       | Regras de calendário, contagem, sugestões, revisão e exportação   |
| `scripts/`   | Desenvolvimento, build e recursos de impressão                    |
| `test/`      | Testes de domínio, backend, build e navegador                     |
| `migration/` | Conversão administrativa isolada dos backups anteriores           |

- [Desenvolvimento](docs/desenvolvimento.md): preparação individual, primeiro acesso e rotina diária.
- [Uso da aplicação](docs/uso.md): funcionalidades disponíveis, salvamento, revisão e limitações.
- [Arquitetura](docs/arquitetura-convex.md): componentes, autorização, persistência e concorrência.
- [Acesso e contas](docs/recuperacao-de-senha.md): convites, recuperação e Google institucional.
- [Implantação e operação](docs/implantacao-convex-vercel.md): ambientes, configuração, publicação e backups.
- [Migração do schema](docs/migracao-schema.md): backup, ensaio, preservação dos históricos e conferência dos dados.
- [Restauração dos originais](docs/restauracao-de-originais.md): registro da restauração dos 13 PDFs em produção e desenvolvimento, sem pendências de transferência, e procedimento para novas reposições.
- [Revisão da consolidação](docs/revisao-consolidacao-convex.md): achados do Claude Code CLI e correções aplicadas.
