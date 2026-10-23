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

Os testes de domínio e backend usam TypeScript, Vitest e `convex-test`, com dados descartáveis e sem serviço remoto. Eles entram na checagem estrita de tipos (`pnpm typecheck:tests`). Use `pnpm test:unit` para uma execução ou `pnpm test:watch` para executar novamente os testes afetados durante o desenvolvimento. `pnpm test` executa toda a suíte em Vitest, incluindo infraestrutura e autosave; `pnpm test:unit` exclui os testes de navegador e `pnpm test:browser` executa apenas esses testes. Os testes de navegador são opcionais e exigem um deployment descartável, credenciais de teste e navegador, conforme `test/native-portal-browser.test.ts`. Não devem apontar para produção. A CI executa `pnpm check` com configuração sintética de build, sem publicar funções nem alterar dados remotos.

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

| Diretório  | Conteúdo                                                          |
| ---------- | ----------------------------------------------------------------- |
| `web/`     | Portal React, cliente Convex, editor e renderização do calendário |
| `convex/`  | Autenticação, consultas, transações, arquivos e processamento     |
| `src/`     | Regras de calendário, contagem, sugestões, revisão e exportação   |
| `scripts/` | Desenvolvimento, build e recursos de impressão                    |
| `test/`    | Testes de domínio, backend, build e navegador                     |

- [Desenvolvimento](docs/desenvolvimento.md): preparação individual, primeiro acesso e rotina diária.
- [Uso da aplicação](docs/uso.md): funcionalidades disponíveis, salvamento, revisão e limitações.
- [Arquitetura](docs/arquitetura-convex.md): componentes, autorização, persistência e concorrência.
- [Acesso e contas](docs/recuperacao-de-senha.md): convites, recuperação e Google institucional.
- [Implantação e operação](docs/implantacao-convex-vercel.md): ambientes, configuração, publicação e backups.
