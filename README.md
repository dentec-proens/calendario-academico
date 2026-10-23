# Assistente de Calendários Acadêmicos DENTEC/PROENS

Aplicação em fase alpha com React, Vite, TypeScript e Convex. Convex executa autenticação, consultas reativas, mutations, armazenamento e processamento de PDFs. O portal usa um único backend; o preview Node serve somente arquivos estáticos.

## Desenvolvimento

Requisitos: Node.js 24 LTS e pnpm 12.15.0. As versões das dependências são fixadas no `package.json` e no lockfile.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Na primeira execução, o CLI do Convex pede acesso à conta e ao projeto. Ele grava a seleção de deployment e a URL pública em `.env.local`. Veja `.env.example`; não copie configurações de outra instalação. O comando prepara as funções, inicia o watcher Convex e abre o Vite com atualização automática em http://127.0.0.1:4183. Ctrl+C encerra ambos.

Este worktree usa o deployment de laboratório `oceanic-gazelle-652`, no team Diretoria de Ensino Técnico — PROENS. O checkout original permanece separado. O build não publica funções nem inicializa dados.

Para conferir o build estático:

```sh
pnpm build
pnpm start
```

O resultado fica em `dist/app/`. O preview escuta somente em `127.0.0.1:4183`; `PORT` permite outra porta. No Windows, `INICIAR.cmd` executa esse build e preview. Autenticação e dados continuam no Convex; não há API Node local.

## Qualidade

```sh
pnpm check
```

Esse comando verifica formatação, lint, lint com análise de tipos, TypeScript estrito, testes e build. A CI executa o mesmo processo com uma URL sintética de build e sem credenciais de deployment.

- TypeScript **7.0.2** nas fronteiras do backend, cliente Convex, autenticação, entradas React e ferramentas. `strict`, imports de tipos e verificações de símbolos não utilizados estão ativos.
- Oxlint **1.89.0**, com verificações de correção, Hooks do React e promises; lint tipado usa o engine compatível com TypeScript 7. Regras de imports impedem reintroduzir os antigos provedores.
- Prettier mantém a formatação de código e documentação. `pnpm format` aplica e `pnpm format:check` confere.
- Os módulos maiores de cálculo e editor permanecem em JavaScript durante a migração progressiva. São testados e analisados pelo linter; não são declarados artificialmente como código TypeScript já migrado.
- Testes usam `node:test` e `convex-test`, com fixtures descartáveis e funções reais do backend. E2E em navegador exige explicitamente um deployment descartável; não aponte essa suíte para os dados importados.

Comandos individuais: `pnpm lint`, `pnpm lint:types`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Fluxos do portal

ADMIN gerencia contas, campi, base institucional, documentos e revisão humana. CAMPUS consulta a base e altera somente os calendários da unidade autorizada. O backend confere o vínculo em cada operação; esconder controles não substitui autorização.

Calendários de teste geram PDF identificado como teste. Propostas definitivas mantêm suas pendências e dependem da revisão prevista; o sistema não concede aprovação institucional. Os cálculos usam datas civis, fontes e ofertas registradas, preservando as regras do domínio.

Alterações entram no calendário com **Adicionar/Aplicar** e são salvas automaticamente após uma breve pausa. O indicador confirma o resultado. Falhas recuperáveis oferecem nova tentativa; conflitos preservam os dados locais e exigem conferir a versão atual. Campos ainda não aplicados ficam protegidos de atualizações remotas. **Baixar cópia** inclui os dados aplicados; **Importar cópia** abre esse JSON compatível.

A confirmação de uma nova base institucional e o salvamento da análise humana continuam explícitos. As consultas Convex atualizam as listas e os editores sem refetch manual.

## Dados, acesso e arquivos

Identidades e sessões usam Convex Auth. Membros precisam estar ativos e previamente autorizados. Credenciais importadas compatíveis conservam o vínculo com seus IDs; não há cadastro público irrestrito.

As funções em `convex/` executam transações e ações. Os dados atuais ficam em documentos Convex e as versões completas ficam em snapshots separados. Os IDs de domínio e as referências históricas importadas permanecem estáveis. PDFs são enviados ao Convex Storage, validados no backend e consultados com autorização e tickets temporários. Geração de PDF e extração de texto executam em actions Node do Convex.

Os **13 PDFs originais permanecem pendentes de transferência**, conforme decisão do usuário. Seus metadados e referências estão preservados. A limpeza do código não baixa, reanalisa ou substitui esses arquivos.

Segredos como `JWT_PRIVATE_KEY`, `JWKS` e credenciais Google pertencem ao ambiente do deployment Convex. Nunca entram em variáveis `VITE_*`, bundles, relatórios ou Git. Google depende da configuração do provedor. A recuperação de senha usa links temporários gerados pelo ADMIN; envio automático por e-mail ainda precisa ser implementado. Consulte [recuperação de acesso](docs/recuperacao-de-senha.md).

Para alterar funções do laboratório, use `pnpm convex:dev`; para publicar funções em produção, o comando explícito é `pnpm convex:deploy`. Confira o alvo antes de executar. Backup usa a exportação completa do Convex, incluindo Storage quando necessário; uma importação de restauração deve ser ensaiada em deployment separado.

## Estrutura e documentação

- `convex/`: funções, autenticação, armazenamento e schema.
- `src/`: regras puras de calendário, snapshots e suporte à renderização.
- `web/`: portal React, cliente Convex e editor.
- `scripts/`: desenvolvimento, build e geração de recursos de impressão.
- `test/`: regras e funções Convex isoladas.

[Arquitetura](docs/arquitetura-convex.md) · [Regras e especificação](docs/especificacao.md) · [Proveniência dos dados](docs/migracao-dados.md) · [Evidências da consolidação](docs/evidencias-convex/consolidation-integrity.json)
