# Assistente de Calendários Acadêmicos DENTEC/PROENS

Aplicação web em fase alpha para elaborar calendários acadêmicos e administrativos, conferir dias letivos e registrar a revisão técnico-pedagógica. O frontend usa React, Vite e TypeScript; autenticação, dados, arquivos e processamento de PDFs ficam no Convex.

## Desenvolvimento

Requisitos: Node.js 24 e pnpm 12.15.0. As dependências são fixadas em `package.json` e `pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Na primeira execução, o CLI do Convex solicita acesso à conta e seleção do projeto, gravando a configuração em `.env.local`. Use `.env.example` como referência. `pnpm dev` prepara as funções, inicia o watcher Convex e serve o Vite em [localhost:4183](http://127.0.0.1:4183). Ctrl+C encerra os dois processos. Confira o deployment selecionado antes de executar comandos que alteram o backend.

Para testar o build estático:

```sh
pnpm build
pnpm start
```

O build gera `dist/app/`. O preview escuta em `127.0.0.1:4183`; `PORT` altera a porta. No Windows, `INICIAR.cmd` executa build e preview. Os dados e o login continuam no Convex; o preview não fornece uma API local.

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

Os testes de domínio e backend usam `node:test` e `convex-test`, com dados descartáveis e sem serviço remoto. Os testes de navegador são opcionais e exigem um deployment descartável, credenciais de teste e navegador, conforme `test/native-portal-browser.test.mjs`. Não devem apontar para produção. A CI executa `pnpm check` com configuração sintética de build, sem publicar funções nem alterar dados remotos.

## Operação

O portal está configurado para [calendario-academico-phi.vercel.app](https://calendario-academico-phi.vercel.app). Desenvolvimento e produção usam deployments Convex separados. Build e publicação do frontend não publicam as funções do backend; consulte [Implantação e operação](docs/implantacao-convex-vercel.md).

Segredos de autenticação e provedores pertencem ao ambiente Convex. Somente configurações públicas usam prefixo `VITE_`. Contas precisam de autorização prévia; convites e recuperação de senha usam links temporários entregues manualmente. Veja [Acesso e contas](docs/recuperacao-de-senha.md).

## Estrutura e documentação

| Diretório  | Conteúdo                                                          |
| ---------- | ----------------------------------------------------------------- |
| `web/`     | Portal React, cliente Convex, editor e renderização do calendário |
| `convex/`  | Autenticação, consultas, transações, arquivos e processamento     |
| `src/`     | Regras de calendário, contagem, sugestões, revisão e exportação   |
| `scripts/` | Desenvolvimento, build e recursos de impressão                    |
| `test/`    | Testes de domínio, backend, build e navegador                     |

- [Uso da aplicação](docs/uso.md): funcionalidades disponíveis, salvamento, revisão e limitações.
- [Arquitetura](docs/arquitetura-convex.md): componentes, autorização, persistência e concorrência.
- [Acesso e contas](docs/recuperacao-de-senha.md): convites, recuperação e Google institucional.
- [Implantação e operação](docs/implantacao-convex-vercel.md): ambientes, configuração, publicação e backups.
